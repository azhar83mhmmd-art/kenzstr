import { Request, Response } from 'express';
import axios from 'axios';

const BASE_URL = 'https://www.tikwm.com';

function fullUrl(url: string | null) {
    if (!url) return null;
    if (/^https?:\/\//i.test(url)) return url;
    return BASE_URL + url;
}

export default async function ttvideoHandler(req: Request, res: Response) {
    const query = String(req.query.q || req.query.query || '').trim();
    const limit = Math.min(Number(req.query.limit) || 10, 20);

    if (!query) {
        return res.status(400).json({
            status: false,
            message: "Parameter 'q' diperlukan."
        });
    }

    const body = new URLSearchParams({
        keywords: query,
        count: String(limit),
        cursor: '0',
        web: '1',
        hd: '1'
    });

    const { data } = await axios.post(`${BASE_URL}/api/feed/search`, body, {
        headers: {
            accept: 'application/json, text/javascript, */*; q=0.01',
            'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            origin: BASE_URL,
            referer: `${BASE_URL}/`
        },
        timeout: 20000
    });

    const videos = Array.isArray(data?.data?.videos) ? data.data.videos : [];

    const result = videos.slice(0, limit).map((item: any) => ({
        id: item.video_id || item.id || null,
        title: item.title || null,
        author: item.author?.nickname || item.author?.unique_id || null,
        duration: item.duration || 0,
        play: fullUrl(item.play),
        cover: fullUrl(item.cover),
        stats: {
            play: item.play_count || 0,
            like: item.digg_count || 0,
            comment: item.comment_count || 0,
            share: item.share_count || 0
        }
    }));

    return res.json({
        status: data?.code === 0,
        total: result.length,
        result
    });
}
