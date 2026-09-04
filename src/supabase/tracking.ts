/*
 * Kairoo API | sylvatica.my.id
 * © Dandy
 *
 * Middleware request tracking untuk Server Monitor.
 *
 * Alur (sesuai prompt update poin 21):
 *   start timer -> jalankan endpoint -> dapatkan status ->
 *   hitung response time -> update statistik -> simpan log
 *
 * PENTING: jika Supabase gagal/tidak dikonfigurasi, API UTAMA TIDAK
 * BOLEH ikut gagal. record() dipanggil secara fire-and-forget
 * (tidak di-await oleh response handler) dan setiap error di-catch
 * lokal, hanya di-log ke console.
 */
import { Request, Response, NextFunction } from 'express';
import { supabase, hasSupabase } from './client';
import { hashIp } from './hashIp';

const IGNORED_PREFIXES = [
    '/stats',
    '/monitor',
    '/api/monitor',
    '/api/status',
    '/api/feedback',
    '/status',
    '/logs',
    '/feedback',
    '/about',
    '/privacy',
    '/terms',
    '/src',
    '/docs',
    '/config',
    '/theme.css',
    '/kairoo-nav.js',
    '/favicon.ico',
    '/'
];

const getIp = (req: Request): string => {
    const forwarded = req.headers['x-forwarded-for'];
    let ip: string;

    if (typeof forwarded === 'string') {
        ip = forwarded.split(',')[0].trim();
    } else if (Array.isArray(forwarded)) {
        ip = forwarded[0]?.trim() || 'unknown';
    } else {
        ip = req.ip || req.socket?.remoteAddress || 'unknown';
    }

    return ip.replace('::ffff:', '').trim();
};

const shouldTrack = (path: string): boolean => {
    // '/' sendiri (landing page) diabaikan, tapi endpoint API di
    // bawah kategori (mis. /ai/kuroneko) tetap dilacak. Cocokkan exact
    // match untuk prefix pendek, startsWith untuk yang lain.
    if (path === '/') return false;

    return !IGNORED_PREFIXES.some((prefix) => prefix !== '/' && path.startsWith(prefix));
};

export const monitorTracking = (req: Request, res: Response, next: NextFunction) => {
    if (!shouldTrack(req.path)) {
        return next();
    }

    const start = process.hrtime.bigint();

    res.on('finish', () => {
        if (!hasSupabase || !supabase) return;

        const responseTimeMs = Number(process.hrtime.bigint() - start) / 1_000_000;
        const ip = getIp(req);

        supabase
            .rpc('record_api_request', {
                p_endpoint: req.path,
                p_method: req.method,
                p_status_code: res.statusCode,
                p_response_time: Math.round(responseTimeMs),
                p_ip_hash: ip && ip !== 'unknown' ? hashIp(ip) : null,
                p_user_agent: (req.headers['user-agent'] as string) || null
            })
            .then(
                ({ error }: { error: any }) => {
                    if (error) {
                        console.error('[Monitor] Gagal mencatat statistik request:', error.message);
                    }
                },
                (error: any) => {
                    console.error('[Monitor] Gagal mencatat statistik request:', error?.message || error);
                }
            );
    });

    next();
};
