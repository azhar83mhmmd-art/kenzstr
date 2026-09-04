import { Request, Response } from 'express';
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
// @ts-ignore - tidak menyertakan type declaration lengkap
import mql from '@microlink/mql';

const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36';

function makeClient() {
    const jar = new CookieJar();
    return wrapper(
        axios.create({
            jar,
            withCredentials: true,
            timeout: 60000,
            validateStatus: () => true,
            headers: { 'user-agent': UA, 'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7' }
        })
    );
}

// Provider 1: pikwy.com
async function tryPikwy(url: string): Promise<string | null> {
    const client = makeClient();

    await client.get('https://pikwy.com', {
        headers: { accept: 'text/html', referer: 'https://www.google.com/' }
    });

    const res = await client.get('https://api.pikwy.com/', {
        params: {
            tkn: '125',
            d: '3000',
            u: encodeURIComponent(url),
            fs: '0',
            w: '1920',
            h: '1080',
            s: '100',
            z: '100',
            f: 'png',
            rt: 'jweb'
        },
        headers: { accept: '*/*', origin: 'https://pikwy.com', referer: 'https://pikwy.com/' }
    });

    if (res.status >= 200 && res.status < 300 && typeof res.data === 'object' && res.data.iurl) {
        return res.data.iurl as string;
    }

    return null;
}

// Provider 2: id.vivoldi.com
async function tryVivoldi(url: string): Promise<string | null> {
    const BASE = 'https://id.vivoldi.com';
    const PAGE = `${BASE}/tools/website-screen-capturer`;
    const client = makeClient();

    await client.get(PAGE, { headers: { accept: 'text/html', referer: 'https://www.google.com/' } });

    const res = await client.post(
        PAGE,
        {
            urls: url,
            client: 'chromium',
            height: 'auto',
            quality: 'auto',
            agent: '1',
            export: 'png',
            delay: '2',
            querySelector: ''
        },
        {
            headers: { 'api-post': 'Y', accept: 'application/json', 'content-type': 'application/json', origin: BASE, referer: PAGE }
        }
    );

    if (res.status >= 200 && res.status < 300 && res.data?.code === 0 && res.data?.result?.downloadUrl) {
        return res.data.result.downloadUrl as string;
    }

    return null;
}

// Provider 3: microlink.io (via @microlink/mql)
async function tryMicrolink(url: string): Promise<string | null> {
    const options: any = {
        screenshot: { optimizeForSpeed: true, fullPage: false },
        viewport: { width: 1920, height: 1080 },
        waitFor: 3000,
        meta: false
    };

    const result: any = await mql(url, options);

    return result?.data?.screenshot?.url || null;
}

export default async function screenshotHandler(req: Request, res: Response) {
    const url = String(req.query.url || '').trim();

    if (!url) {
        return res.status(400).json({ status: false, message: "Parameter 'url' diperlukan." });
    }

    if (!/^https?:\/\//i.test(url)) {
        return res.status(400).json({ status: false, message: "Parameter 'url' harus diawali http:// atau https://." });
    }

    const providers: { name: string; fn: (u: string) => Promise<string | null> }[] = [
        { name: 'pikwy', fn: tryPikwy },
        { name: 'vivoldi', fn: tryVivoldi },
        { name: 'microlink', fn: tryMicrolink }
    ];

    for (const provider of providers) {
        try {
            const resultUrl = await provider.fn(url);
            if (resultUrl) {
                return res.json({ status: true, input: url, provider: provider.name, resultUrl });
            }
        } catch {
            // lanjut ke provider berikutnya
            continue;
        }
    }

    return res.status(502).json({ status: false, message: 'Semua provider screenshot gagal, coba lagi nanti.' });
}
