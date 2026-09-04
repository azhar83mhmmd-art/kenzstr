import { Request, Response } from 'express';
import axios from 'axios';

function cleanText(value: string) {
    return String(value || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function limitText(value: string, limit = 300) {
    const text = cleanText(value);
    if (!limit || text.length <= limit) return text;
    return `${text.slice(0, limit).trim()}...`;
}

export default async function mcpedlHandler(req: Request, res: Response) {
    const query = String(req.query.q || req.query.query || '').trim();
    const limit = Math.min(Number(req.query.limit) || 10, 20);

    if (!query) {
        return res.status(400).json({
            status: false,
            message: "Parameter 'q' diperlukan."
        });
    }

    const { data } = await axios.get('https://api.mcpedl.com/api/search/advanced', {
        params: {
            q: query,
            sort: 'relevance',
            updated_at: '2y',
            page: 1
        },
        headers: {
            accept: 'application/json',
            origin: 'https://mcpedl.com',
            referer: 'https://mcpedl.com/'
        },
        timeout: 20000
    });

    const items = Array.isArray(data?.results) ? data.results.slice(0, limit) : [];

    const result = items.map((item: any) => ({
        title: item.title ?? null,
        url: item.slug ? `https://mcpedl.com/${item.slug}/` : null,
        summary: limitText(item.summary, 250),
        image: item.image ?? null,
        rating: item.average_rating ?? null,
        downloads: item.downloadCount ?? null,
        author: item.display_name ?? null
    }));

    return res.json({
        status: true,
        total: data?.meta?.total ?? result.length,
        result
    });
}
