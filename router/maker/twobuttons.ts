import { Request, Response } from 'express';
import { getCanvasLib } from '../../src/canvasSafe';
import { ensureFont, loadBackground, sendPng, fitFont, FONT_FAMILY } from './_canvas';

const BG_URL = 'https://cdn.jsdelivr.net/gh/Ditzzx-vibecoder/Assets@main/Image/Two-Buttons.jpg';

export default async function twoButtonsHandler(req: Request, res: Response) {
    const teks1 = String(req.query.teks1 ?? req.body?.teks1 ?? '').trim();
    const teks2 = String(req.query.teks2 ?? req.body?.teks2 ?? '').trim();
    const teks3 = String(req.query.teks3 ?? req.body?.teks3 ?? '').trim();

    if (!teks1 || !teks2 || !teks3) {
        return res.status(400).json({
            status: false,
            message: "Parameter 'teks1', 'teks2', dan 'teks3' diperlukan."
        });
    }

    await ensureFont();

    const width = 600;
    const height = 908;
    const canvas = getCanvasLib().createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    await loadBackground(ctx, width, height, BG_URL);

    // [text, x, y, w, h, ukuran awal font, pakai outline putih (teks besar bawah)]
    const zones: Array<[string, number, number, number, number, number, boolean]> = [
        [teks1, 69, 108, 168, 54, 60, false],
        [teks2, 275, 76, 146, 43, 50, false],
        [teks3, 28, 796, 542, 66, 60, true]
    ];

    for (const [text, x, y, w, h, start, outline] of zones) {
        const f = fitFont(ctx, text, w, h, start, 14);
        ctx.font = `700 ${f.size}px ${FONT_FAMILY}`;
        ctx.fillStyle = outline ? '#ffffff' : '#111111';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        f.lines.forEach((line, i) => {
            const ly = y + h / 2 + (i - (f.lines.length - 1) / 2) * f.size * 1.1;
            if (outline) {
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 6;
                ctx.strokeText(line, x + w / 2, ly);
            }
            ctx.fillText(line, x + w / 2, ly);
        });
    }

    return sendPng(res, canvas);
}
