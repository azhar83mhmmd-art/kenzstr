import { Request, Response } from 'express';
import { getCanvasLib } from '../../src/canvasSafe';
import { ensureFont, loadBackground, sendPng, fitFont, FONT_FAMILY } from './_canvas';

const BG_URL = 'https://cdn.jsdelivr.net/gh/Ditzzx-vibecoder/Assets@main/Image/jarvismeme.png';

export default async function jarvisHandler(req: Request, res: Response) {
    const text = String(req.query.text ?? req.body?.text ?? '').trim();

    if (!text) {
        return res.status(400).json({
            status: false,
            message: "Parameter 'text' diperlukan."
        });
    }

    await ensureFont();

    const width = 735;
    const height = 678;
    const canvas = getCanvasLib().createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    await loadBackground(ctx, width, height, BG_URL);

    const f = fitFont(ctx, text, 695, 237, 100, 18);
    ctx.font = `700 ${f.size}px ${FONT_FAMILY}`;
    ctx.fillStyle = '#111111';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const lh = f.size * 1.2;
    const sy = 3 + 237 / 2 - ((f.lines.length - 1) * lh) / 2;
    f.lines.forEach((line, i) => ctx.fillText(line, 367.5, sy + i * lh));

    return sendPng(res, canvas);
}
