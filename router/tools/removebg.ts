import { Request, Response } from 'express';
import axios from 'axios';

const UA = 'Mozilla/5.0 (Android 14; Mobile; rv:144.0) Gecko/144.0 Firefox/144.0';

async function fetchImageAsBase64(imageUrl: string): Promise<{ data: string; contentType: string }> {
    const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
        maxRedirects: 5,
        validateStatus: () => true,
        headers: { 'user-agent': UA, accept: 'image/*,*/*' }
    });

    if (response.status !== 200) throw new Error(`Gagal mengambil gambar sumber: HTTP ${response.status}`);

    const contentType = String(response.headers['content-type'] || 'image/jpeg');
    return { data: Buffer.from(response.data).toString('base64'), contentType };
}

export default async function removebgHandler(req: Request, res: Response) {
    const imageUrl = String(req.query.url || req.body?.url || '').trim();

    if (!imageUrl) {
        return res.status(400).json({ status: false, message: "Parameter 'url' (link gambar) diperlukan." });
    }

    const { data: base64Source, contentType } = await fetchImageAsBase64(imageUrl);
    const encodedImage = `data:${contentType};base64,${base64Source}`;

    const apiResponse = await axios.post(
        'https://background-remover.com/removeImageBackground',
        { encodedImage, title: 'image.jpg', mimeType: 'image/jpeg' },
        {
            timeout: 60000,
            validateStatus: () => true,
            headers: {
                'content-type': 'application/json',
                'user-agent': UA,
                referer: 'https://background-remover.com/upload',
                accept: '*/*',
                origin: 'https://background-remover.com'
            },
            responseType: 'arraybuffer'
        }
    );

    if (apiResponse.status !== 200) {
        return res.status(502).json({ status: false, message: `Remove background gagal: HTTP ${apiResponse.status}` });
    }

    const responseContentType = String(apiResponse.headers['content-type'] || '');

    if (responseContentType.includes('image/')) {
        const resultBase64 = Buffer.from(apiResponse.data).toString('base64');
        return res.json({
            status: true,
            input: imageUrl,
            resultBase64: `data:${responseContentType};base64,${resultBase64}`
        });
    }

    let json: any;
    try {
        json = JSON.parse(Buffer.from(apiResponse.data).toString('utf-8'));
    } catch {
        return res.status(502).json({ status: false, message: 'Response remove-background tidak dikenali.' });
    }

    const resultData = json.encodedImageWithoutBackground || json.image || json.resultImage || json.output || json.data || json.result;

    if (!resultData) {
        return res.status(502).json({ status: false, message: 'Tidak ada data gambar pada response.' });
    }

    return res.json({
        status: true,
        input: imageUrl,
        resultBase64: typeof resultData === 'string' && resultData.startsWith('data:') ? resultData : `data:image/png;base64,${resultData}`
    });
}
