import { Request, Response } from 'express';
import { getCanvasLib } from '../../src/canvasSafe';
import { ensureFont, loadBackground, sendPng, fitFont, FONT_FAMILY } from './_canvas';

/*
 * Bug sebelumnya: URL background 'https://imgflip.com/s/meme/Drake-Hotline-Bling.jpg'
 * bukan URL gambar langsung (Imgflip menyajikan template di domain i.imgflip.com),
 * jadi selalu gagal diambil. Sudah diganti ke URL gambar aslinya.
 */
const BG_URL = 'https://i.imgflip.com/30b1gx.jpg';

export default async function drakeHandler(req: Request, res: Response) {
    const teks1 = String(req.query.teks1 ?? req.body?.teks1 ?? '').trim();
    const teks2 = String(req.query.teks2 ?? req.body?.teks2 ?? '').trim();

    if (!teks1 || !teks2) {
        return res.status(400).json({
            status: false,
            message: "Parameter 'teks1' dan 'teks2' diperlukan."
        });
    }

    await ensureFont();

    const width = 1200;
    const height = 1200;
    const canvas = getCanvasLib().createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    await loadBackground(ctx, width, height, BG_URL);

    const zones: Array<[string, number, number, number, number]> = [
        [teks1, 615, 22, 571, 564],
        [teks2, 615, 623, 571, 561]
    ];

    for (const [text, x, y, w, h] of zones) {
        const f = fitFont(ctx, text, w, h, 110, 20);
        ctx.font = `700 ${f.size}px ${FONT_FAMILY}`;
        ctx.fillStyle = '#000000';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const lh = f.size * 1.2;
        const sy = y + h / 2 - ((f.lines.length - 1) * lh) / 2;
        f.lines.forEach((line, i) => ctx.fillText(line, x + w / 2, sy + i * lh));
    }

    return sendPng(res, canvas);
}
