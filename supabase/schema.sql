-- Kairoo API | Supabase schema untuk Server Monitor
-- Jalankan file ini di Supabase SQL Editor (Project > SQL Editor > New query)
--
-- Desain:
-- - api_requests  : log per-request (dibatasi retensi, lihat trigger di bawah)
-- - daily_stats   : agregat harian, dibaca oleh /monitor tanpa scan tabel besar
-- - endpoints     : daftar endpoint + kounter agregat (top endpoints)
--
-- Semua kolom yang berpotensi sensitif (IP) disimpan dalam bentuk hash,
-- bukan mentah, sesuai instruksi "IP user jangan ditampilkan mentah".

create extension if not exists pgcrypto;

-- =========================================================
-- 1. api_requests — log request individual
-- =========================================================
create table if not exists api_requests (
    id bigint generated always as identity primary key,
    endpoint text not null,
    method text not null,
    status_code integer not null,
    response_time integer not null, -- ms
    ip_hash text, -- sha256(ip), bukan IP mentah
    user_agent text,
    created_at timestamptz not null default now()
);

create index if not exists idx_api_requests_created_at on api_requests (created_at desc);
create index if not exists idx_api_requests_endpoint on api_requests (endpoint);
create index if not exists idx_api_requests_status on api_requests (status_code);

-- =========================================================
-- 2. daily_stats — agregat harian (1 baris per hari)
-- =========================================================
create table if not exists daily_stats (
    id bigint generated always as identity primary key,
    date date not null unique,
    total_requests bigint not null default 0,
    successful_requests bigint not null default 0,
    failed_requests bigint not null default 0,
    average_response numeric(10, 2) not null default 0,
    unique_users bigint not null default 0,
    updated_at timestamptz not null default now()
);

create index if not exists idx_daily_stats_date on daily_stats (date desc);

-- =========================================================
-- 3. endpoints — kounter agregat per endpoint (top endpoints table)
-- =========================================================
create table if not exists endpoints (
    id bigint generated always as identity primary key,
    endpoint text not null,
    method text not null,
    total_requests bigint not null default 0,
    success_requests bigint not null default 0,
    error_requests bigint not null default 0,
    total_response_time bigint not null default 0, -- untuk hitung avg
    last_request_at timestamptz,
    unique (endpoint, method)
);

create index if not exists idx_endpoints_total on endpoints (total_requests desc);

-- =========================================================
-- 4. users — opsional, dipakai untuk hitung "unique users" ringan
--    berbasis hash IP harian (bukan akun/login).
-- =========================================================
create table if not exists daily_unique_visitors (
    date date not null,
    ip_hash text not null,
    primary key (date, ip_hash)
);

-- =========================================================
-- 5. Function: record_api_request
-- Dipanggil sekali per request dari middleware tracking (lihat
-- src/supabase/tracking.ts). Melakukan 3 hal sekaligus dalam satu
-- round-trip DB supaya dashboard yang polling tiap 5 detik tetap ringan:
--   a. insert log ke api_requests
--   b. upsert agregat ke endpoints
--   c. upsert agregat ke daily_stats + daily_unique_visitors
-- =========================================================
create or replace function record_api_request(
    p_endpoint text,
    p_method text,
    p_status_code integer,
    p_response_time integer,
    p_ip_hash text,
    p_user_agent text
) returns void as $$
declare
    v_today date := current_date;
    v_is_success boolean := p_status_code >= 200 and p_status_code < 400;
begin
    insert into api_requests (endpoint, method, status_code, response_time, ip_hash, user_agent)
    values (p_endpoint, p_method, p_status_code, p_response_time, p_ip_hash, p_user_agent);

    insert into endpoints (endpoint, method, total_requests, success_requests, error_requests, total_response_time, last_request_at)
    values (
        p_endpoint,
        p_method,
        1,
        case when v_is_success then 1 else 0 end,
        case when v_is_success then 0 else 1 end,
        p_response_time,
        now()
    )
    on conflict (endpoint, method) do update set
        total_requests = endpoints.total_requests + 1,
        success_requests = endpoints.success_requests + case when v_is_success then 1 else 0 end,
        error_requests = endpoints.error_requests + case when v_is_success then 0 else 1 end,
        total_response_time = endpoints.total_response_time + p_response_time,
        last_request_at = now();

    insert into daily_stats (date, total_requests, successful_requests, failed_requests, average_response, unique_users)
    values (
        v_today,
        1,
        case when v_is_success then 1 else 0 end,
        case when v_is_success then 0 else 1 end,
        p_response_time,
        0
    )
    on conflict (date) do update set
        total_requests = daily_stats.total_requests + 1,
        successful_requests = daily_stats.successful_requests + case when v_is_success then 1 else 0 end,
        failed_requests = daily_stats.failed_requests + case when v_is_success then 0 else 1 end,
        average_response = (
            (daily_stats.average_response * daily_stats.total_requests) + p_response_time
        ) / (daily_stats.total_requests + 1),
        updated_at = now();

    if p_ip_hash is not null then
        insert into daily_unique_visitors (date, ip_hash)
        values (v_today, p_ip_hash)
        on conflict do nothing;

        update daily_stats
        set unique_users = (
            select count(*) from daily_unique_visitors where date = v_today
        )
        where date = v_today;
    end if;
end;
$$ language plpgsql security definer;

-- =========================================================
-- 6. Function: get_monitor_snapshot
-- Satu panggilan agregat untuk GET /api/monitor/stats, supaya dashboard
-- tidak melakukan banyak query terpisah setiap polling 5 detik.
--
-- FIX (Server Monitor "column reference total_requests is ambiguous"):
-- kolom `total_requests` di RETURNS TABLE (baris di bawah) punya nama
-- yang sama persis dengan kolom `daily_stats.total_requests`. Di dalam
-- subquery requests_today, PostgreSQL tidak bisa menentukan mana yang
-- dimaksud -> error ambiguous, dan /api/monitor/stats selalu balas
-- status "offline". Sudah diqualify jadi `daily_stats.total_requests`.
-- Jalankan ulang blok `create or replace function get_monitor_snapshot`
-- ini di Supabase SQL Editor supaya fix-nya aktif (CREATE OR REPLACE
-- aman dijalankan berkali-kali, tidak menghapus data).
-- =========================================================
create or replace function get_monitor_snapshot()
returns table (
    total_users bigint,
    total_requests bigint,
    total_endpoints bigint,
    rps_5s numeric,
    rps_15s numeric,
    rps_60s numeric,
    avg_response_time numeric,
    success_rate numeric,
    error_rate numeric,
    requests_today bigint
) as $$
begin
    return query
    select
        (select coalesce(sum(unique_users), 0) from daily_stats) as total_users,
        (select coalesce(count(*), 0) from api_requests) as total_requests,
        (select coalesce(count(*), 0) from endpoints) as total_endpoints,
        (select coalesce(count(*), 0) from api_requests where created_at > now() - interval '5 seconds') / 5.0 as rps_5s,
        (select coalesce(count(*), 0) from api_requests where created_at > now() - interval '15 seconds') / 15.0 as rps_15s,
        (select coalesce(count(*), 0) from api_requests where created_at > now() - interval '60 seconds') / 60.0 as rps_60s,
        (select coalesce(avg(response_time), 0) from api_requests where created_at > now() - interval '15 minutes') as avg_response_time,
        (select case when count(*) = 0 then 100 else round(100.0 * count(*) filter (where status_code < 400) / count(*), 2) end
            from api_requests where created_at > now() - interval '15 minutes') as success_rate,
        (select case when count(*) = 0 then 0 else round(100.0 * count(*) filter (where status_code >= 400) / count(*), 2) end
            from api_requests where created_at > now() - interval '15 minutes') as error_rate,
        (select coalesce(daily_stats.total_requests, 0) from daily_stats where date = current_date) as requests_today;
end;
$$ language plpgsql stable;

-- =========================================================
-- 7. feedback — Pusat Feedback & Laporan (poin 14 prompt update)
-- Nama & email opsional. ip_hash dipakai HANYA untuk rate limit ringan
-- (maks N submission per jam per ip_hash), bukan untuk identifikasi.
-- =========================================================
create table if not exists feedback (
    id bigint generated always as identity primary key,
    category text not null check (category in ('bug', 'feature_request', 'endpoint_request', 'general')),
    message text not null,
    name text,
    email text,
    ip_hash text,
    created_at timestamptz not null default now()
);

create index if not exists idx_feedback_created_at on feedback (created_at desc);
create index if not exists idx_feedback_ip_hash_created_at on feedback (ip_hash, created_at desc);

-- =========================================================
-- 8. Retensi log: hapus api_requests lebih dari 14 hari supaya tabel
-- tidak membengkak (daily_stats/endpoints tetap menyimpan agregatnya).
-- Jalankan manual atau jadwalkan lewat Supabase Cron/pg_cron.
-- =========================================================
create or replace function cleanup_old_api_requests() returns void as $$
begin
    delete from api_requests where created_at < now() - interval '14 days';
end;
$$ language plpgsql;

-- Jika project Supabase mendukung pg_cron (Pro plan ke atas), aktifkan baris berikut:
-- select cron.schedule('cleanup-api-requests', '0 3 * * *', 'select cleanup_old_api_requests();');

-- =========================================================
-- 9. Function: count_recent_feedback — dipakai backend untuk rate limit
-- submission feedback per ip_hash (poin 14: "Tambahkan validasi dan
-- rate limit"), tanpa perlu scan penuh dari Node.
-- =========================================================
create or replace function count_recent_feedback(p_ip_hash text, p_minutes integer)
returns bigint as $$
    select count(*) from feedback
    where ip_hash = p_ip_hash
      and created_at > now() - (p_minutes || ' minutes')::interval;
$$ language sql stable;
