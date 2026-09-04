/*
 * Kairoo API | sylvatica.my.id
 * © Dandy
 *
 * Supabase client untuk fitur Server Monitor.
 *
 * Pola sama seperti src/middleware/rateLimit.ts: kalau env var Supabase
 * tidak diset, modul ini TIDAK BOLEH membuat proses crash saat boot.
 * hasSupabase = false membuat semua pemanggil (tracking.ts, endpoint
 * /api/monitor/stats) otomatis masuk ke mode "metrics tidak tersedia"
 * alih-alih melempar error atau mematikan seluruh API.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const isPlaceholderSupabaseUrl = (url: string): boolean => {
    const normalized = url.trim().toLowerCase();
    if (!normalized) return true;
    return normalized.includes('xxxx') || normalized.includes('your-project');
};

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const hasSupabase =
    Boolean(supabaseUrl) &&
    Boolean(supabaseKey) &&
    !isPlaceholderSupabaseUrl(supabaseUrl);

if (!hasSupabase) {
    if (supabaseUrl && isPlaceholderSupabaseUrl(supabaseUrl)) {
        console.warn(
            '[!] SUPABASE_URL masih berisi nilai placeholder (' + supabaseUrl + '). ' +
            'Server Monitor akan berjalan dalam mode terbatas. Isi dengan URL project Supabase asli.'
        );
    } else {
        console.warn(
            '[!] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY tidak diset — Server Monitor ' +
            'akan berjalan dalam mode terbatas (statistik request tidak dicatat/disimpan).'
        );
    }
}

/*
 * SERVICE_ROLE_KEY hanya dipakai di sini (server-side, dalam proses
 * Node/Vercel Function). Jangan pernah mengirim key ini ke response API
 * atau ke frontend — lihat src/routes/monitor.ts yang hanya meneruskan
 * angka agregat, bukan credential apa pun.
 *
 * PENTING (bug FUNCTION_INVOCATION_FAILED di semua route Vercel):
 * createClient() memvalidasi format SUPABASE_URL secara synchronous dan
 * bisa throw ("Invalid URL", dsb) kalau env var-nya SUDAH DIISI tapi
 * formatnya salah (bukan placeholder, jadi lolos dari pengecekan
 * isPlaceholderSupabaseUrl di atas). Karena modul ini di-import di
 * level teratas lewat rantai index.ts -> tracking.ts -> client.ts,
 * exception yang tidak ditangkap di sini akan mematikan SELURUH proses
 * Vercel Function saat cold start (bukan cuma fitur Server Monitor).
 * Maka createClient() WAJIB dibungkus try/catch di sini juga.
 */
let supabaseClient: SupabaseClient | null = null;

if (hasSupabase) {
    try {
        supabaseClient = createClient(supabaseUrl, supabaseKey, {
            auth: { persistSession: false }
        });
    } catch (error) {
        console.error(
            '[✗] Gagal membuat Supabase client (SUPABASE_URL kemungkinan tidak valid). ' +
            'Server Monitor akan berjalan dalam mode terbatas:',
            error instanceof Error ? error.message : error
        );
        supabaseClient = null;
    }
}

export const supabase: SupabaseClient | null = supabaseClient;
