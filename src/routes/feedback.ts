/*
 * Kairoo API | sylvatica.my.id
 * © Dandy
 *
 * POST /api/feedback — Pusat Feedback & Laporan (poin 14 prompt update)
 *
 * Validasi:
 * - category harus salah satu dari daftar yang diizinkan
 * - message wajib diisi, dibatasi panjangnya
 * - name/email opsional, dibatasi panjangnya kalau diisi
 * - rate limit: maksimal 3 submission / 10 menit per ip_hash (memakai
 *   fungsi count_recent_feedback di Supabase), MENCEGAH spam tanpa
 *   menyimpan IP mentah (poin 26 - IP privacy).
 *
 * Kalau Supabase tidak dikonfigurasi, endpoint mengembalikan pesan
 * eksplisit bahwa fitur belum tersedia - tidak berpura-pura sukses.
 */
import { Request, Response } from 'express';
import { supabase, hasSupabase } from '../supabase/client';
import { hashIp } from '../supabase/hashIp';

const ALLOWED_CATEGORIES = ['bug', 'feature_request', 'endpoint_request', 'general'];
const MAX_MESSAGE_LENGTH = 2000;
const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 200;
const RATE_LIMIT_WINDOW_MINUTES = 10;
const RATE_LIMIT_MAX_SUBMISSIONS = 3;

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

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export async function submitFeedbackHandler(req: Request, res: Response) {
    if (!hasSupabase || !supabase) {
        return res.status(503).json({
            status: false,
            message: 'Fitur feedback belum dikonfigurasi di server ini (Supabase belum diset).'
        });
    }

    const body = req.body || {};
    const category = String(body.category || '').trim();
    const message = String(body.message || '').trim();
    const name = body.name ? String(body.name).trim() : null;
    const email = body.email ? String(body.email).trim() : null;

    if (!ALLOWED_CATEGORIES.includes(category)) {
        return res.status(400).json({
            status: false,
            message: `Kategori tidak valid. Gunakan salah satu: ${ALLOWED_CATEGORIES.join(', ')}.`
        });
    }

    if (!message || message.length < 5) {
        return res.status(400).json({ status: false, message: 'Pesan wajib diisi (minimal 5 karakter).' });
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
        return res.status(400).json({ status: false, message: `Pesan terlalu panjang (maksimal ${MAX_MESSAGE_LENGTH} karakter).` });
    }

    if (name && name.length > MAX_NAME_LENGTH) {
        return res.status(400).json({ status: false, message: `Nama terlalu panjang (maksimal ${MAX_NAME_LENGTH} karakter).` });
    }

    if (email) {
        if (email.length > MAX_EMAIL_LENGTH || !isValidEmail(email)) {
            return res.status(400).json({ status: false, message: 'Format email tidak valid.' });
        }
    }

    const ip = getIp(req);
    const ipHash = ip && ip !== 'unknown' ? hashIp(ip) : null;

    try {
        if (ipHash) {
            const { data: recentCount, error: countError } = await supabase
                .rpc('count_recent_feedback', { p_ip_hash: ipHash, p_minutes: RATE_LIMIT_WINDOW_MINUTES });

            if (!countError && typeof recentCount === 'number' && recentCount >= RATE_LIMIT_MAX_SUBMISSIONS) {
                return res.status(429).json({
                    status: false,
                    message: `Terlalu banyak feedback dikirim. Coba lagi dalam ${RATE_LIMIT_WINDOW_MINUTES} menit.`
                });
            }
        }

        const { error } = await supabase.from('feedback').insert({
            category,
            message,
            name,
            email,
            ip_hash: ipHash
        });

        if (error) throw error;

        return res.status(201).json({ status: true, message: 'Feedback berhasil dikirim. Terima kasih!' });
    } catch (err: any) {
        console.error('[Feedback] Gagal menyimpan feedback:', err?.message || err);
        return res.status(500).json({ status: false, message: 'Gagal mengirim feedback. Coba lagi nanti.' });
    }
}
