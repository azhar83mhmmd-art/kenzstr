import { Request, Response } from 'express';
import axios from 'axios';

const TEXT_TYPES = ['text/', 'application/json', 'application/xml', 'application/javascript', 'application/x-javascript'];

function isTextContentType(contentType: string): boolean {
    return TEXT_TYPES.some((t) => contentType.startsWith(t));
}

export default async function webfetchHandler(req: Request, res: Response) {
    const targetUrl = String(req.query.url || '').trim();

    if (!targetUrl) {
        return res.status(400).json({ status: false, message: "Parameter 'url' diperlukan." });
    }

    if (!/^https?:\/\//i.test(targetUrl)) {
        return res.status(400).json({ status: false, message: "Parameter 'url' harus diawali http:// atau https://." });
    }

    let parsed: URL;
    try {
        parsed = new URL(targetUrl);
    } catch {
        return res.status(400).json({ status: false, message: 'URL tidak valid.' });
    }

    const response = await axios.get(targetUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
        maxRedirects: 5,
        maxContentLength: 15 * 1024 * 1024, // 15MB, dibatasi lebih ketat karena dikembalikan langsung ke caller
        validateStatus: () => true,
        headers: {
            'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36',
            accept: '*/*',
            referer: `${parsed.origin}/`
        }
    });

    const contentType = String(response.headers['content-type'] || 'application/octet-stream');
    const buffer = Buffer.from(response.data);

    if (response.status < 200 || response.status >= 300) {
        return res.status(502).json({ status: false, message: `Fetch gagal: HTTP ${response.status}` });
    }

    if (isTextContentType(contentType)) {
        return res.json({
            status: true,
            url: targetUrl,
            contentType,
            size: buffer.length,
            content: buffer.toString('utf-8')
        });
    }

    return res.json({
        status: true,
        url: targetUrl,
        contentType,
        size: buffer.length,
        contentBase64: `data:${contentType};base64,${buffer.toString('base64')}`
    });
}
