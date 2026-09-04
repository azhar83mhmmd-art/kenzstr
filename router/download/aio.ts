import { Request, Response } from 'express';
import axios from 'axios';

/*
 * AIO Downloader
 *
 * Endpoint tunggal untuk memproses URL dari berbagai platform.
 * Setiap platform diproses lewat provider publik yang memang
 * mendukungnya. Platform yang belum punya provider terverifikasi
 * TIDAK dipaksakan — endpoint akan melaporkan status
 * "provider_required" apa adanya, bukan data palsu.
 */

type Platform =
    | 'tiktok'
    | 'instagram'
    | 'youtube'
    | 'facebook'
    | 'twitter'
    | 'pinterest'
    | 'reddit'
    | 'threads'
    | 'soundcloud'
    | 'mediafire'
    | 'unknown';

const detectPlatform = (url: string): Platform => {
    const host = (() => {
        try {
            return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
        } catch {
            return '';
        }
    })();

    if (!host) return 'unknown';

    if (/(^|\.)tiktok\.com$/.test(host)) return 'tiktok';
    if (/(^|\.)instagram\.com$/.test(host)) return 'instagram';
    if (/(^|\.)(youtube\.com|youtu\.be)$/.test(host)) return 'youtube';
    if (/(^|\.)facebook\.com$|(^|\.)fb\.watch$/.test(host)) return 'facebook';
    if (/(^|\.)(twitter\.com|x\.com)$/.test(host)) return 'twitter';
    if (/(^|\.)pinterest\.(com|[a-z]{2,3})$|(^|\.)pin\.it$/.test(host)) return 'pinterest';
    if (/(^|\.)reddit\.com$/.test(host)) return 'reddit';
    if (/(^|\.)threads\.net$/.test(host)) return 'threads';
    if (/(^|\.)soundcloud\.com$/.test(host)) return 'soundcloud';
    if (/(^|\.)mediafire\.com$/.test(host)) return 'mediafire';

    return 'unknown';
};

/*
 * TikTok — provider: tikwm.com
 * API publik, gratis, tanpa API key. Sudah dipakai luas
 * oleh banyak project open-source sebagai middleman resmi
 * untuk mengambil link media TikTok tanpa watermark.
 */
const downloadTiktok = async (url: string) => {
    const { data } = await axios.get('https://www.tikwm.com/api/', {
        params: { url, hd: 1 },
        timeout: 15000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });

    if (!data || data.code !== 0 || !data.data) {
        throw new Error(data?.msg || 'Gagal memproses URL TikTok.');
    }

    const d = data.data;
    const result: Record<string, unknown> = {
        platform: 'tiktok'
    };

    if (d.title) result.title = d.title;
    if (d.cover) result.thumbnail = d.cover;
    if (typeof d.duration === 'number') result.duration = d.duration;
    if (d.hdplay || d.play) result.video = d.hdplay || d.play;
    if (d.play) result.video_watermark = d.wmplay;
    if (d.music) result.audio = d.music;

    return result;
};

export default async function aioHandler(req: Request, res: Response) {
    const url = String(req.query.url || req.body?.url || '').trim();

    if (!url) {
        return res.status(400).json({
            status: false,
            message: "Parameter 'url' diperlukan."
        });
    }

    if (!/^https?:\/\//i.test(url)) {
        return res.status(400).json({
            status: false,
            message: 'URL harus diawali dengan http:// atau https://'
        });
    }

    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return res.status(400).json({
            status: false,
            message: 'URL tidak valid.'
        });
    }

    const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];
    const isPrivateHost =
        blockedHosts.includes(parsed.hostname) ||
        /^10\./.test(parsed.hostname) ||
        /^192\.168\./.test(parsed.hostname) ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(parsed.hostname);

    if (isPrivateHost) {
        return res.status(400).json({
            status: false,
            message: 'URL tidak diizinkan.'
        });
    }

    const platform = detectPlatform(url);

    try {
        switch (platform) {
            case 'tiktok': {
                const result = await downloadTiktok(url);
                return res.json({ status: true, result });
            }

            case 'unknown':
                return res.status(400).json({
                    status: false,
                    message: 'Platform pada URL ini tidak dikenali.'
                });

            default:
                /*
                 * Platform terdeteksi tapi belum punya provider
                 * yang terverifikasi valid & sah untuk dipakai.
                 * Dilaporkan apa adanya, bukan dipaksakan.
                 */
                return res.status(501).json({
                    status: false,
                    platform,
                    message: `Platform "${platform}" terdeteksi, namun provider untuk platform ini belum dikonfigurasi. Butuh provider/API resmi yang valid sebelum endpoint ini bisa mendukungnya.`
                });
        }
    } catch (error: any) {
        if (error.code === 'ECONNABORTED') {
            return res.status(504).json({
                status: false,
                message: 'Provider tidak merespons (timeout).'
            });
        }

        return res.status(502).json({
            status: false,
            message: error.message || 'Gagal memproses URL.'
        });
    }
}
