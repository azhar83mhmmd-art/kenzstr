import { Request, Response } from 'express';
import { getCanvasLib } from '../../src/canvasSafe';
import { ensureFont, sendPng, fitFont, FONT_FAMILY } from './_canvas';

/*
 * Bug sebelumnya: background diambil dari URL
 * '.../Image/ayanolkoji.png' yang sepertinya tidak pernah benar-benar
 * ada di repo asset manapun (selalu 404), jadi endpoint ini selalu
 * gagal total. Diganti jadi kartu kutipan yang digambar sendiri di
 * canvas — tidak bergantung sama sekali ke asset pihak ketiga, jadi
 * dijamin selalu bisa render.
 */

export default async function quoteAnimeHandler(req: Request, res: Response) {
    const text = String(req.query.text ?? req.body?.text ?? '').trim();
    const username = String(req.query.username ?? req.body?.username ?? '').trim();

    if (!text || !username) {
        return res.status(400).json({
            status: false,
            message: "Parameter 'text' dan 'username' diperlukan."
        });
    }

    await ensureFont();

    const width = 1000;
    const height = 1000;
    const canvas = getCanvasLib().createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#1f1c2c');
    gradient.addColorStop(1, '#3a3a52');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.font = `700 320px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('"', 40, -60);

    const padding = 100;
    const f = fitFont(ctx, text, width - padding * 2, 560, 64, 24);
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${f.size}px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const lh = f.size * 1.3;
    const startY = height / 2 - ((f.lines.length - 1) * lh) / 2;
    f.lines.forEach((line, i) => ctx.fillText(line, width / 2, startY + i * lh));

    ctx.fillStyle = '#c9c9d6';
    ctx.font = `400 32px ${FONT_FAMILY}`;
    const usernameY = height / 2 + (f.lines.length * lh) / 2 + 50;
    ctx.fillText(`— ${username}`, width / 2, usernameY);

    return sendPng(res, canvas);
}
