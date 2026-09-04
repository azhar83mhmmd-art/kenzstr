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
const USER_AGENT =
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36';

function uuid() {
    return crypto.randomUUID();
}

function hex(bytes: number) {
    return crypto.randomBytes(bytes).toString('hex');
}

function parseNdjson(text: string) {
    const chunks: string[] = [];

    for (const line of text.split(/\r?\n/)) {
        const clean = line.trim();
        if (!clean || !clean.startsWith('{')) continue;

        try {
            const json = JSON.parse(clean);
            if (json.type === 'content' && typeof json.content === 'string') {
                chunks.push(json.content);
            }
        } catch {
            // baris bukan JSON valid, lewati
        }
    }

    return chunks.join('').trim();
}

export default async function quillbotHandler(req: Request, res: Response) {
    const q = String(req.query.q || req.body?.q || '').trim();
    const sessionParam = String(req.query.session || req.body?.session || '').trim();

    if (!q) {
        return res.status(400).json({
            status: false,
            message: "Parameter 'q' diperlukan."
        });
    }

    // Session dibawa lewat string base64 (conversation_id + device_id),
    // bukan disimpan ke file — filesystem Vercel read-only dan tiap
    // invocation function terpisah, sehingga state harus dititipkan ke
    // client seperti pola handler AI lain (lihat kuroneko.ts).
    let conversationId: string;
    let deviceId: string;

    if (sessionParam) {
        try {
            const decoded = JSON.parse(Buffer.from(sessionParam, 'base64').toString());
            conversationId = decoded.conversation_id || uuid();
            deviceId = decoded.device_id || uuid();
        } catch {
            conversationId = uuid();
            deviceId = uuid();
        }
    } else {
        conversationId = uuid();
        deviceId = uuid();
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

    await setCookie('qbDeviceId', deviceId);
    await setCookie('ajs_anonymous_id', uuid());
    await setCookie('anonID', hex(8));
    await setCookie('authenticated', 'false');
    await setCookie('premium', 'false');
    await setCookie('acceptedPremiumModesTnc', 'false');
    await setCookie('qdid', hex(16));

    await client.get(`${BASE}/`, {
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

    const body = {
        message: { content: `${q}\n\n` },
        context: {
            editorContext: '',
            selectionContext: '',
            userDialect: 'en-us',
            apiVersion: 2
        },
        origin: { name: 'ai-chat.chat', url: BASE }
    };

    const response = await client.post(
        `${BASE}/api/ai-chat/chat/conversation/${conversationId}`,
        body,
        {
            responseType: 'text',
            headers: {
                'cache-control': 'max-age=0',
                'platform-type': 'webapp',
                'qb-product': 'AI-CHAT',
                useridtoken: 'empty-token',
                baggage: `sentry-environment=prod,sentry-release=v42.51.6,sentry-public_key=5743ef12f4887fc460c7968ebb2de54d,sentry-trace_id=${traceId},sentry-sampled=false,sentry-sample_rand=${Math.random()},sentry-sample_rate=0.01`,
                'sentry-trace': `${traceId}-${spanId}-0`,
                'user-agent': USER_AGENT,
                accept: 'text/event-stream',
                'webapp-version': '42.51.6',
                'content-type': 'application/json',
                origin: BASE,
                referer: `${BASE}/ai-chat/c/${conversationId}`,
                'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
            }
        }
    );

    const raw = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    const result = parseNdjson(raw);
    const success = response.status >= 200 && response.status < 300 && !!result;

    if (!success) {
        return res.status(502).json({
            status: false,
            message: 'Gagal mendapat balasan dari QuillBot'
        });
    }

    const newSession = Buffer.from(
        JSON.stringify({ conversation_id: conversationId, device_id: deviceId })
    ).toString('base64');

    return res.json({
        status: true,
        response: result,
        session: newSession
    });
}
