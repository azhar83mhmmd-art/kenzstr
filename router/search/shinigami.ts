import { Request, Response } from 'express';
import axios from 'axios';

const WEB_URL = 'https://g.shinigami.asia';

function pickTaxonomy(taxonomy: any, key: string) {
    if (!taxonomy || !Array.isArray(taxonomy[key])) return [];
    return taxonomy[key].map((v: any) => v.name).filter(Boolean);
}

export default async function shinigamiHandler(req: Request, res: Response) {
    const query = String(req.query.q || req.query.query || '').trim();
    const limit = Math.min(Number(req.query.limit) || 10, 20);

    if (!query) {
        return res.status(400).json({
            status: false,
            message: "Parameter 'q' diperlukan."
        });
    }

    const { data } = await axios.get('https://api.shngm.io/v1/manga/list', {
        params: {
            page: 1,
            page_size: limit,
            q: query
        },
        headers: {
            accept: 'application/json',
            referer: `${WEB_URL}/`,
            origin: WEB_URL
        },
        timeout: 20000
    });

    const items = Array.isArray(data?.data) ? data.data : [];

    const result = items.map((item: any) => ({
        title: item.title || null,
        url: item.manga_id ? `${WEB_URL}/series/${item.manga_id}` : null,
        manga_id: item.manga_id || null,
        description: item.description || null,
        status: item.status ?? null,
        rating: item.user_rate ?? null,
        latest_chapter: item.latest_chapter_number ?? null,
        cover: item.cover_image_url || null,
        author: pickTaxonomy(item.taxonomy, 'Author'),
        genre: pickTaxonomy(item.taxonomy, 'Genre')
    }));

    return res.json({
        status: data.retcode === 0,
        total: data?.meta?.total_record ?? result.length,
        result
    });
}
