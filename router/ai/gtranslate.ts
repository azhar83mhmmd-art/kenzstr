import { Request, Response } from 'express';
// @ts-ignore - google-translate-api-x tidak menyertakan type declaration bawaan
import { translate, speak } from 'google-translate-api-x';

const OPTIONS: any = {
    client: 'gtx',
    forceBatch: true,
    fallbackBatch: true,
    autoCorrect: true
};

export default async function gtranslateHandler(req: Request, res: Response) {
    const text = String(req.query.text || req.query.q || '').trim();
    const from = String(req.query.from || 'auto');
    const to = String(req.query.to || 'id');
    const mode = String(req.query.mode || 'text') === 'audio' ? 'audio' : 'text';

    if (!text) {
        return res.status(400).json({ status: false, message: "Parameter 'text' diperlukan." });
    }

    if (mode === 'text') {
        const result = await translate(text, { from, to, ...OPTIONS } as any);

        return res.json({
            status: true,
            mode: 'text',
            input: text,
            from: result.from?.language?.iso || from,
            to,
            result: result.text,
            pronunciation: result.pronunciation || null,
            correction: result.from?.text || null
        });
    }

    // mode audio: translate dulu, lalu ubah hasil terjemahan jadi speech
    const translated = await translate(text, { from, to, ...OPTIONS } as any);
    const base64 = await speak(translated.text, { to, client: 'gtx' } as any);

    return res.json({
        status: true,
        mode: 'audio',
        input: text,
        from: translated.from?.language?.iso || from,
        to,
        textTts: translated.text,
        format: 'mp3',
        audioBase64: `data:audio/mpeg;base64,${base64}`
    });
}
