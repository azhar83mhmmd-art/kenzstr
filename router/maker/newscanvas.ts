import { Request, Response } from 'express';
import { getCanvasLib } from '../../src/canvasSafe';
import type { SKRSContext2D, Image } from '@napi-rs/canvas';
import { ensureRemoteFont, remoteImage, sendPng } from './_canvas';

/*
 * News Headline Card
 *
 * Kartu berita bergaya portal daring (headline + foto blur-cover) —
 * diadaptasi dari referensi kompas-canvas.js milik user. Foto & judul
 * datang dari parameter request, template background + font di-cache
 * lewat helper bersama _canvas.ts.
 */

const BG_URL = 'https://raw.githubusercontent.com/ryyntwx/allimagerin/refs/heads/main/Fberita.png';
const FONT_URL = 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYAZ9hiJ-Ek-_EeA.woff2';
const FONT_FAMILY_NEWS = 'KairooInterNews';

const BG_W = 962;
const BG_H = 1634;
const TEXT_ZONE = { x: 30, y: 277, maxWidth: 1010 };
const FOTO_ZONE = { a: 1025, b: 1634, c: 0, d: 962 };

function wordWrap(text: string, ctx: SKRSContext2D, maxWidth: number) {
    const words = text.split(' ');
    const lines: string[] = [];
    let current = '';
    for (let i = 0; i < words.length; i++) {
        const test = `${current}${words[i]} `;
        if (ctx.measureText(test.trim()).width > maxWidth && i > 0) {
            lines.push(current.trim());
            current = `${words[i]} `;
        } else {
            current = test;
        }
    }
    if (current) lines.push(current.trim());
    return lines;
}

async function drawFoto(ctx: SKRSContext2D, imgUrl: string, zone: typeof FOTO_ZONE) {
    const { a, b, c, d } = zone;
    const x = c, y = a, w = d - c, h = b - a;
    const img = await remoteImage(imgUrl);
    const imgRatio = img.width / img.height;
    const boxRatio = w / h;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    ctx.filter = 'blur(28px)';
    ctx.drawImage(img, x - 40, y - 40, w + 80, h + 80);
    ctx.filter = 'none';

    let fw: number, fh: number;
    if (imgRatio > boxRatio) {
        fw = w;
        fh = fw / imgRatio;
    } else {
        fh = h;
        fw = fh * imgRatio;
    }
    ctx.drawImage(img, x + (w - fw) / 2, y + (h - fh) / 2, fw, fh);
    ctx.restore();
}

let bgImageCache: Image | null = null;
async function loadBgImage(): Promise<Image> {
    if (bgImageCache) return bgImageCache;
    bgImageCache = await remoteImage(BG_URL);
    return bgImageCache;
}

export default async function newscanvasHandler(req: Request, res: Response) {
    const text = String(req.query.text || req.body?.text || '').replace(/\s+/g, ' ').trim();
    const foto = String(req.query.foto || req.body?.foto || '').trim();

    if (!text || !foto) {
        return res.status(400).json({
            status: false,
            message: "Parameter 'text' dan 'foto' diperlukan."
        });
    }

    if (!/^https?:\/\//i.test(foto)) {
        return res.status(400).json({
            status: false,
            message: "Parameter 'foto' harus berupa URL http/https."
        });
    }

    try {
        const [bgImg] = await Promise.all([
            loadBgImage(),
            ensureRemoteFont(FONT_URL, FONT_FAMILY_NEWS, 'inter-news-bold.woff2')
        ]);

        const canvas = getCanvasLib().createCanvas(BG_W, BG_H);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bgImg, 0, 0, BG_W, BG_H);

        try {
            await drawFoto(ctx, foto, FOTO_ZONE);
        } catch {
            return res.status(400).json({
                status: false,
                message: 'Gagal memuat gambar dari URL foto.'
            });
        }

        const words = text.split(' ');
        const fontSize = words.length <= 18 ? 76 : 56;
        const lineGap = words.length <= 18 ? 12 : 18;
        const lineHeight = fontSize + lineGap;

        ctx.font = `700 ${fontSize}px ${FONT_FAMILY_NEWS}`;
        ctx.fillStyle = '#eaf2f8';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        let lines = wordWrap(text, ctx, TEXT_ZONE.maxWidth);
        if (lines.length > 6) {
            lines = lines.slice(0, 5);
            lines.push('...');
        }

        lines.forEach((line, i) => {
            ctx.fillText(line, TEXT_ZONE.x, TEXT_ZONE.y + i * lineHeight);
        });

        return sendPng(res, canvas);
    } catch (error: any) {
        return res.status(500).json({
            status: false,
            message: error.message || 'Gagal membuat gambar.'
        });
    }
}
