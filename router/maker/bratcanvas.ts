import { Request, Response } from 'express';
import { getCanvasLib } from '../../src/canvasSafe';
import type { SKRSContext2D } from '@napi-rs/canvas';
import { ensureFont, FONT_FAMILY, sendPng } from './_canvas';
import { drawTextWithEmojis, measureTextWithEmojis } from './_emoji';

/*
 * Brat Canvas Generator (bertema)
 *
 * Variasi /api/maker/brat yang di-render langsung di canvas (bukan
 * lewat API pihak ketiga) sehingga bisa punya pilihan tema warna
 * (black/white/green) dan blur — diadaptasi dari referensi
 * brat-img.js milik user, dipindah ke helper font/emoji bersama
 * project (_canvas.ts / _emoji.ts).
 */

const THEMES: Record<string, { bg: string; text: string }> = {
    black: { bg: '#000000', text: '#ffffff' },
    white: { bg: '#ffffff', text: '#000000' },
    green: { bg: '#8ace00', text: '#000000' }
};

async function wrapWithEmojis(ctx: SKRSContext2D, text: string, maxWidth: number, fontSize: number) {
    ctx.font = `${fontSize}px ${FONT_FAMILY}`;
    const words = text.split(' ');
    const lines: string[] = [];
    let cur = '';
    for (const word of words) {
        const test = cur ? `${cur} ${word}` : word;
        const w = await measureTextWithEmojis(ctx, test, fontSize);
        if (w > maxWidth && cur) {
            lines.push(cur);
            cur = word;
        } else {
            cur = test;
        }
    }
    if (cur) lines.push(cur);
    return lines;
}

async function fits(ctx: SKRSContext2D, text: string, fontSize: number, maxWidth: number, maxHeight: number, lineGap: number) {
    const lines = await wrapWithEmojis(ctx, text, maxWidth, fontSize);
    const widths = await Promise.all(text.split(' ').map((w) => measureTextWithEmojis(ctx, w, fontSize)));
    const longestWord = Math.max(...widths);
    const totalHeight = lines.length * (fontSize + lineGap) - lineGap;
    return longestWord <= maxWidth && totalHeight <= maxHeight;
}

async function findBestFontSize(ctx: SKRSContext2D, text: string, maxWidth: number, maxHeight: number, lineGap: number) {
    let lo = 10;
    let hi = 700;
    let best = lo;
    while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (await fits(ctx, text, mid, maxWidth, maxHeight, lineGap)) {
            best = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return best;
}

export default async function bratcanvasHandler(req: Request, res: Response) {
    const text = String(req.query.text || req.body?.text || '').trim();
    const theme = String(req.query.theme || 'white').toLowerCase();
    const blurParam = parseInt(String(req.query.blur ?? '0'), 10);
    const blurAmount = [0, 1, 2, 3].includes(blurParam) ? blurParam : 0;

    if (!text) {
        return res.status(400).json({
            status: false,
            message: "Parameter 'text' diperlukan."
        });
    }

    const selectedTheme = THEMES[theme] || THEMES.white;

    try {
        await ensureFont();

        const size = 1000;
        const padding = 80;
        const lineGap = 20;
        const maxWidth = size - padding * 2;
        const maxHeight = size - padding * 2;

        const canvas = getCanvasLib().createCanvas(size, size);
        const ctx = canvas.getContext('2d');

        const fontSize = await findBestFontSize(ctx, text, maxWidth, maxHeight, lineGap);
        const lines = await wrapWithEmojis(ctx, text, maxWidth, fontSize);

        ctx.fillStyle = selectedTheme.bg;
        ctx.fillRect(0, 0, size, size);

        ctx.fillStyle = selectedTheme.text;
        ctx.font = `${fontSize}px ${FONT_FAMILY}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        ctx.save();
        if (blurAmount > 0) ctx.filter = `blur(${blurAmount}px)`;

        const totalTextHeight = lines.length * (fontSize + lineGap) - lineGap;
        let y = (size - totalTextHeight) / 2 + fontSize / 2;
        for (const line of lines) {
            await drawTextWithEmojis(ctx, line, padding, y, fontSize);
            y += fontSize + lineGap;
        }

        ctx.restore();

        return sendPng(res, canvas);
    } catch (error: any) {
        return res.status(500).json({
            status: false,
            message: error.message || 'Gagal membuat gambar.'
        });
    }
}
