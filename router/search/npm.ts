import { Request, Response } from 'express';
import axios from 'axios';

export default async function npmHandler(req: Request, res: Response) {
    const query = String(req.query.q || req.query.query || '').trim();

    if (!query) {
        return res.status(400).json({
            status: false,
            message: "Parameter 'q' diperlukan."
        });
    }

    const { data } = await axios.get('https://registry.npmjs.org/-/v1/search', {
        params: {
            text: query,
            size: 20
        },
        headers: {
            accept: 'application/json'
        }
    });

    const result = (data.objects || []).map((obj: any) => ({
        name: obj.package?.name,
        version: obj.package?.version,
        description: obj.package?.description || null,
        license: obj.package?.license || null,
        author: obj.package?.author?.name || null,
        date: obj.package?.date || null,
        homepage: obj.package?.links?.homepage || null,
        npm: obj.package?.links?.npm || null,
        repository: obj.package?.links?.repository || null,
        keywords: obj.package?.keywords || []
    }));

    return res.json({
        status: true,
        total: data.total || result.length,
        result
    });
}
