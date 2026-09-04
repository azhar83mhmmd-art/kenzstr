import { Request, Response } from 'express';
import axios from 'axios';
import crypto from 'crypto';

const BASE_URL = 'https://www.tikwm.com';

function fullUrl(url: string | null) {
    if (!url) return null;
    if (/^https?:\/\//i.test(url)) return url;
    return BASE_URL + url;
}

export default async function ttphotoHandler(req: Request, res: Response) {
    const query = String(req.query.q || req.query.query || '').trim();
    const limit = Math.min(Number(req.query.limit) || 10, 20);

    if (!query) {
        return res.status(400).json({
            status: false,
            message: "Parameter 'q' diperlukan."
        });
    }

    const uniqueId = `user_${crypto.randomBytes(6).toString('hex')}`;

    const params = new URLSearchParams({
        unique_id: uniqueId,
        count: String(limit),
        cursor: '0',
        web: '1',
        hd: '1',
        keywords: query
    });

    const { data } = await axios.post(`${BASE_URL}/api/photo/search`, params, {
        headers: {
            accept: 'application/json, text/javascript, */*; q=0.01',
            'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
            origin: BASE_URL,
            referer: `${BASE_URL}/`
        },
        timeout: 20000
    });

    const items = Array.isArray(data?.data?.images) ? data.data.images : (Array.isArray(data?.data) ? data.data : []);

    const result = items.slice(0, limit).map((item: any) => ({
        id: item.video_id || item.id || null,
        title: item.title || null,
        author: item.author?.nickname || item.author?.unique_id || null,
        cover: fullUrl(item.cover),
        images_total: Array.isArray(item.images) ? item.images.length : 0,
        images: Array.isArray(item.images) ? item.images.slice(0, 9) : [],
        stats: {
            play: item.play_count || 0,
            like: item.digg_count || 0,
            comment: item.comment_count || 0
        }
    }));

    return res.json({
        status: data?.code === 0,
        total: result.length,
        result
    });
}
