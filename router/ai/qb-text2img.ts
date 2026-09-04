/*
 * Kairoo API | sylvatica.my.id
 * © Dandy
 */
import { Request, Response } from 'express';
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import crypto from 'node:crypto';

const BASE = 'https://quillbot.com';
const PROMPT_ID = 'image/generate-image';
const USER_AGENT =
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36';

function uuid() {
    return crypto.randomUUID();
}

function hex(bytes: number) {
    return crypto.randomBytes(bytes).toString('hex');
}

export default async function qbText2imgHandler(req: Request, res: Response) {
    const prompt = String(req.query.q || req.query.prompt || req.body?.prompt || '').trim();
    const aspectRatio = String(req.query.ratio || req.body?.ratio || '1:1');

    if (!prompt) {
        return res.status(400).json({
            status: false,
            message: "Parameter 'q' diperlukan."
        });
    }

    const jar = new CookieJar();
    const client = wrapper(
        axios.create({
            jar,
            withCredentials: true,
            decompress: true,
            validateStatus: () => true,
            timeout: 60000
        })
    );

    const setCookie = async (name: string, value: string) => {
        await jar.setCookie(
            `${name}=${value}; Path=/; Domain=quillbot.com; Secure; SameSite=None`,
            BASE
        );
    };

    await setCookie('qbDeviceId', uuid());
    await setCookie('ajs_anonymous_id', uuid());
    await setCookie('anonID', hex(8));
    await setCookie('authenticated', 'false');
    await setCookie('premium', 'false');
    await setCookie('acceptedPremiumModesTnc', 'false');
    await setCookie('qdid', hex(16));

    await client.get(BASE, {
        headers: {
            'sec-ch-ua-mobile': '?1',
            'upgrade-insecure-requests': '1',
            'user-agent': USER_AGENT,
            accept:
                'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
        }
    });

    const traceId = hex(16);
    const spanId = hex(8);

    const response = await client.post(
        `${BASE}/api/raven/generate/image`,
        {
            prompt,
            category: 'Auto',
            aspectRatio,
            promptId: PROMPT_ID
        },
        {
            headers: {
                'platform-type': 'webapp',
                'qb-product': 'IMAGE-GENERATOR',
                useridtoken: 'empty-token',
                'user-agent': USER_AGENT,
                accept: 'application/json, text/plain, */*',
                'webapp-version': '42.51.6',
                'content-type': 'application/json',
                origin: BASE,
                referer: `${BASE}/ai-image-generator/i/${uuid()}`,
                'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
                baggage: `sentry-environment=prod,sentry-release=v42.51.6,sentry-public_key=5743ef12f4887fc460c7968ebb2de54d,sentry-trace_id=${traceId},sentry-sampled=false,sentry-sample_rand=${Math.random()},sentry-sample_rate=0.01`,
                'sentry-trace': `${traceId}-${spanId}-0`
            }
        }
    );

    const urls = (response.data?.data?.images || [])
        .map((v: any) => v.downloadUrl)
        .filter(Boolean);

    if (response.status < 200 || response.status >= 300 || urls.length === 0) {
        return res.status(502).json({
            status: false,
            message: 'Gagal generate gambar'
        });
    }

    return res.json({
        status: true,
        prompt,
        result: urls.length === 1 ? urls[0] : urls
    });
}
