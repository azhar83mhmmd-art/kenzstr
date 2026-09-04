/*
 * Kairoo API | sylvatica.my.id
 * © Dandy
 */
import { Request, Response } from 'express';
import axios from 'axios';

const WIDGET_ID = 'asyntai_2bcd9dfbae24';

function generateSessionId() {
    return 'session_' + Math.random().toString(36).slice(2, 14);
}

async function asyntai(message: string, sessionId: string | null) {
    const finalSessionId = sessionId || generateSessionId();

    const { data } = await axios.post(
        'https://asyntai.com/api/widget-chat/',
        {
            widget_id: WIDGET_ID,
            message,
            session_id: finalSessionId
        },
        {
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000
        }
    );

    return {
        reply: data.reply,
        session: data.session_id || finalSessionId
    };
}

export default async function asyntaiHandler(req: Request, res: Response) {
    const q = String(req.query.q || req.body?.q || '').trim();
    const session = String(req.query.session || req.body?.session || '').trim();

    if (!q) {
        return res.status(400).json({
            status: false,
            message: "Parameter 'q' diperlukan."
        });
    }

    const result = await asyntai(q, session || null);

    return res.json({
        status: true,
        response: result.reply,
        session: result.session
    });
}
