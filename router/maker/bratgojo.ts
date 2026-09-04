import { Request, Response } from 'express';
import { getCanvasLib } from '../../src/canvasSafe';
import type { SKRSContext2D, Image } from '@napi-rs/canvas';
import { ensureRemoteFont, remoteImage, sendPng } from './_canvas';

/*
 * Brat Gojo Template
 *
 * Menimpakan teks (auto-wrap, auto-shrink font) ke area kosong pada
 * template gambar "Gojo" bergaya brat — diadaptasi dari referensi
 * brat-gojo.js milik user. Font di-cache lewat ensureRemoteFont dan
 * gambar template di-cache in-memory lewat remoteImage(), sama
 * seperti endpoint maker lain (qcwa, dst).
 */

const IMAGE_URL = 'https://raw.githubusercontent.com/Ditzzx-vibecoder/Assets/main/Brat/Gojo.jpeg';
const FONT_URL = 'https://raw.githubusercontent.com/Ditzzx-vibecoder/Assets/main/Brat/Poppins.ttf';
const FONT_FAMILY_GOJO = 'KairooPoppins';

const CANVAS = { width: 1254, height: 1254 };
const SAFE_ZONE = { a: 660, b: 1180, c: 270, d: 990 };
const TEXT_STYLE = { maxFontSize: 90, minFontSize: 22, lineHeight: 1.18, color: '#111111' };

function splitLongWord(ctx: SKRSContext2D, word: string, maxWidth: number) {
    const chars = [...word];
    const parts: string[] = [];
    let current = '';
    for (const char of chars) {
        const test = current + char;
        if (ctx.measureText(test).width <= maxWidth || !current) {
            current = test;
        } else {
            parts.push(current);
            current = char;
        }
    }
    if (current) parts.push(current);
    return parts;
}

function wrapParagraph(ctx: SKRSContext2D, paragraph: string, maxWidth: number) {
    const words = paragraph.split(' ').filter(Boolean);
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
        const test = current ? `${current} ${word}` : word;
        if (ctx.measureText(test).width <= maxWidth) {
            current = test;
            continue;
        }
        if (current) {
            lines.push(current);
            current = '';
        }
        if (ctx.measureText(word).width <= maxWidth) {
            current = word;
        } else {
            const parts = splitLongWord(ctx, word, maxWidth);
            lines.push(...parts.slice(0, -1));
            current = parts[parts.length - 1] || '';
        }
    }
    if (current) lines.push(current);
    return lines;
}

function wrapText(ctx: SKRSContext2D, text: string, maxWidth: number) {
    return text.split('\n').flatMap((paragraph) => {
        const clean = paragraph.trim();
        if (!clean) return [''];
        return wrapParagraph(ctx, clean, maxWidth);
    });
}

function fitText(ctx: SKRSContext2D, text: string, rect: { w: number; h: number }) {
    for (let size = TEXT_STYLE.maxFontSize; size >= TEXT_STYLE.minFontSize; size--) {
        ctx.font = `${size}px ${FONT_FAMILY_GOJO}`;
        const lineHeight = Math.ceil(size * TEXT_STYLE.lineHeight);
        const lines = wrapText(ctx, text, rect.w);
        const totalHeight = lines.length * lineHeight;
        if (totalHeight <= rect.h) {
            return { size, lines, lineHeight, totalHeight };
        }
    }
    const size = TEXT_STYLE.minFontSize;
    ctx.font = `${size}px ${FONT_FAMILY_GOJO}`;
    const lineHeight = Math.ceil(size * TEXT_STYLE.lineHeight);
    const lines = wrapText(ctx, text, rect.w);
    const maxLines = Math.max(1, Math.floor(rect.h / lineHeight));
    const clipped = lines.slice(0, maxLines);
    if (lines.length > maxLines && clipped.length) {
        let last = clipped[clipped.length - 1];
        while (last.length > 0 && ctx.measureText(`${last}...`).width > rect.w) {
            last = last.slice(0, -1);
        }
        clipped[clipped.length - 1] = `${last}...`;
    }
    return { size, lines: clipped, lineHeight, totalHeight: clipped.length * lineHeight };
}

let templateImageCache: Image | null = null;
async function loadTemplateImage(): Promise<Image> {
    if (templateImageCache) return templateImageCache;
    templateImageCache = await remoteImage(IMAGE_URL);
    return templateImageCache;
}

export default async function bratgojoHandler(req: Request, res: Response) {
    const text = String(req.query.text || req.body?.text || '').trim();

    if (!text) {
        return res.status(400).json({
            status: false,
            message: "Parameter 'text' diperlukan."
        });
    }

    try {
        const [image] = await Promise.all([
            loadTemplateImage(),
            ensureRemoteFont(FONT_URL, FONT_FAMILY_GOJO, 'poppins-brat.ttf')
        ]);

        const canvas = getCanvasLib().createCanvas(CANVAS.width, CANVAS.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, CANVAS.width, CANVAS.height);

        const rect = {
            x: SAFE_ZONE.c,
            y: SAFE_ZONE.a,
            w: SAFE_ZONE.d - SAFE_ZONE.c,
            h: SAFE_ZONE.b - SAFE_ZONE.a,
            centerX: (SAFE_ZONE.c + SAFE_ZONE.d) / 2
        };
        const fitted = fitText(ctx, text, rect);
        const startY = rect.y + (rect.h - fitted.totalHeight) / 2;

        ctx.save();
        ctx.beginPath();
        ctx.rect(rect.x, rect.y, rect.w, rect.h);
        ctx.clip();
        ctx.font = `${fitted.size}px ${FONT_FAMILY_GOJO}`;
        ctx.fillStyle = TEXT_STYLE.color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        fitted.lines.forEach((line, index) => {
            const y = startY + index * fitted.lineHeight;
            ctx.fillText(line, rect.centerX, y);
        });
        ctx.restore();

        return sendPng(res, canvas);
    } catch (error: any) {
        return res.status(500).json({
            status: false,
            message: error.message || 'Gagal membuat gambar.'
        });
    }
}
