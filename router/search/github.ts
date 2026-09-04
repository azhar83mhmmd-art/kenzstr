import { Request, Response } from 'express';
import axios from 'axios';

export default async function githubHandler(req: Request, res: Response) {
    const query = String(req.query.q || req.query.query || '').trim();

    if (!query) {
        return res.status(400).json({
            status: false,
            message: "Parameter 'q' diperlukan."
        });
    }

    const headers: Record<string, string> = {
        accept: 'application/vnd.github+json',
        'user-agent': 'kairoo-api'
    };

    if (process.env.GITHUB_TOKEN) {
        headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const { data } = await axios.get('https://api.github.com/search/repositories', {
        params: {
            q: query,
            sort: 'stars',
            order: 'desc',
            per_page: 10
        },
        headers
    });

    const result = (data.items || []).map((repo: any) => ({
        full_name: repo.full_name,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        language: repo.language || null,
        description: repo.description || null,
        url: repo.html_url
    }));

    return res.json({
        status: true,
        total: data.total_count || 0,
        result
    });
}
