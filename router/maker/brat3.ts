import { Request, Response } from 'express';
import { getCanvasLib } from '../../src/canvasSafe';
import type { SKRSContext2D } from '@napi-rs/canvas';
import { ensureFont, FONT_FAMILY, sendPng } from './_canvas';
import { drawTextWithEmojis, measureTextWithEmojis } from './_emoji';

/*
 * Brat 3-Line Generator
 *
 * Variasi brat dengan 3 baris teks bertumpuk (atas abu-abu kecil,
 * tengah hitam besar, bawah abu-abu kecil) di atas background putih —
 * diadaptasi dari referensi brat-3.js milik user, dipindah ke pola
 * project (font & emoji dipakai dari helper _canvas.ts / _emoji.ts,
 * bukan download sendiri) supaya konsisten dan tidak duplikasi asset.
 */

const COLOR_OUTER = '#dadada';
const COLOR_MID = '#000000';
const BG_COLOR = '#ffffff';

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

async function longestWordWidth(ctx: SKRSContext2D, text: string, fontSize: number) {
    ctx.font = `${fontSize}px ${FONT_FAMILY}`;
    const widths = await Promise.all(text.split(' ').map((w) => measureTextWithEmojis(ctx, w, fontSize)));
    return Math.max(...widths);
}

export default async function brat3Handler(req: Request, res: Response) {
    const topText = String(req.query.teks1 || req.query.top || '').trim();
    const midText = String(req.query.teks2 || req.query.mid || '').trim();
    const bottomText = String(req.query.teks3 || req.query.bottom || '').trim();
    const blurParam = parseInt(String(req.query.blur ?? '0'), 10);
    const blurAmount = [0, 1, 2, 3].includes(blurParam) ? blurParam : 0;

    if (!topText || !midText || !bottomText) {
        return res.status(400).json({
            status: false,
            message: "Parameter 'teks1', 'teks2', dan 'teks3' diperlukan."
        });
    }

    try {
        await ensureFont();

        const size = 1000;
        const padding = 40;
        const lineGap = 6;
        const stackGapTop = 4;
        const stackGapBottom = 40;
        const maxWidth = size - padding * 2;
        const maxHeight = size - padding * 2;

        const canvas = getCanvasLib().createCanvas(size, size);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = BG_COLOR;
        ctx.fillRect(0, 0, size, size);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const centerX = size / 2;

        async function computeLayout(outerSize: number, midSize: number) {
            const topLines = await wrapWithEmojis(ctx, topText, maxWidth, outerSize);
            const bottomLines = await wrapWithEmojis(ctx, bottomText, maxWidth, outerSize);
            const midLines = await wrapWithEmojis(ctx, midText, maxWidth, midSize);

            const topLongest = await longestWordWidth(ctx, topText, outerSize);
            const bottomLongest = await longestWordWidth(ctx, bottomText, outerSize);
            const midLongest = await longestWordWidth(ctx, midText, midSize);

            const topH = topLines.length * (outerSize + lineGap) - lineGap;
            const midH = midLines.length * (midSize + lineGap) - lineGap;
            const bottomH = bottomLines.length * (outerSize + lineGap) - lineGap;
            const totalH = topH + stackGapTop + midH + stackGapBottom + bottomH;

            const fits =
                topLongest <= maxWidth && bottomLongest <= maxWidth && midLongest <= maxWidth && totalH <= maxHeight;

            return { fits, topLines, midLines, bottomLines, topH, midH, bottomH, totalH };
        }

        let outerSize = 200;
        let midSize = 340;
        let layout = await computeLayout(outerSize, midSize);
        while (!layout.fits && outerSize > 6) {
            outerSize -= 2;
            midSize -= Math.round(2 * (340 / 200));
            layout = await computeLayout(outerSize, midSize);
        }

        const { topLines, midLines, bottomLines, topH, midH, totalH } = layout;

        ctx.save();
        if (blurAmount > 0) ctx.filter = `blur(${blurAmount}px)`;

        let cursorY = (size - totalH) / 2;

        ctx.fillStyle = COLOR_OUTER;
        ctx.font = `${outerSize}px ${FONT_FAMILY}`;
        for (const line of topLines) {
            const w = await measureTextWithEmojis(ctx, line, outerSize);
            await drawTextWithEmojis(ctx, line, centerX - w / 2, cursorY + outerSize / 2, outerSize);
            cursorY += outerSize + lineGap;
        }
        cursorY += stackGapTop - lineGap;

        ctx.fillStyle = COLOR_MID;
        ctx.font = `${midSize}px ${FONT_FAMILY}`;
        for (const line of midLines) {
            const w = await measureTextWithEmojis(ctx, line, midSize);
            await drawTextWithEmojis(ctx, line, centerX - w / 2, cursorY + midSize / 2, midSize);
            cursorY += midSize + lineGap;
        }
        cursorY += stackGapBottom - lineGap;

        ctx.fillStyle = COLOR_OUTER;
        ctx.font = `${outerSize}px ${FONT_FAMILY}`;
        for (const line of bottomLines) {
            const w = await measureTextWithEmojis(ctx, line, outerSize);
            await drawTextWithEmojis(ctx, line, centerX - w / 2, cursorY + outerSize / 2, outerSize);
            cursorY += outerSize + lineGap;
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
