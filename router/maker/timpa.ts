import { Request, Response } from 'express';
import { getCanvasLib } from '../../src/canvasSafe';
import { ensureFont, loadBackground, sendPng, fitFont, FONT_FAMILY } from './_canvas';

const BG_URL = 'https://raw.githubusercontent.com/ryyntwx/allimagerin/refs/heads/main/IMG-20260710-WA1772.jpg';

export default async function timpaHandler(req: Request, res: Response) {
    const username = String(req.query.username ?? req.body?.username ?? '').trim();
    const text = String(req.query.text ?? req.body?.text ?? '').trim();

    if (!username || !text) {
        return res.status(400).json({
            status: false,
            message: "Parameter 'username' dan 'text' diperlukan."
        });
    }

    await ensureFont();

    const width = 735;
    const height = 735;
    const canvas = getCanvasLib().createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    await loadBackground(ctx, width, height, BG_URL);

    const f = fitFont(ctx, text, 520, 170, 36, 12);
    ctx.fillStyle = '#262626';
    ctx.font = `700 ${f.size}px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const lh = f.size * 1.2;
    f.lines.forEach((line, i) =>
        ctx.fillText(line, 430, 365 - ((f.lines.length - 1) * lh) / 2 + i * lh)
    );

    ctx.font = `700 22px ${FONT_FAMILY}`;
    ctx.fillText(`~ ${username.replace(/^~\s*/, '')}`, 430, 600);

    return sendPng(res, canvas);
}
