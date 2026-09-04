import { Request, Response } from 'express';
import { getCanvasLib } from '../../src/canvasSafe';
import type { Image, SKRSContext2D } from '@napi-rs/canvas';
import { remoteImage, loadBackground, sendPng } from './_canvas';

const BG_URL = 'https://cdn.jsdelivr.net/gh/Ditzzx-vibecoder/Assets@main/Image/2image.jpeg';

function drawCover(ctx: SKRSContext2D, img: Image, x: number, y: number, w: number, h: number) {
    const scale = Math.max(w / img.width, h / img.height);
    const sw = img.width * scale;
    const sh = img.height * scale;
    ctx.drawImage(img, x + (w - sw) / 2, y + (h - sh) / 2, sw, sh);
}

export default async function beautifulHandler(req: Request, res: Response) {
    const image1 = String(req.query.image1 ?? req.body?.image1 ?? '').trim();
    const image2 = String(req.query.image2 ?? req.body?.image2 ?? '').trim();

    if (!image1 || !image2) {
        return res.status(400).json({
            status: false,
            message: "Parameter 'image1' dan 'image2' diperlukan."
        });
    }

    if (!/^https?:\/\//i.test(image1) || !/^https?:\/\//i.test(image2)) {
        return res.status(400).json({
            status: false,
            message: "Parameter 'image1' dan 'image2' harus berupa URL http/https."
        });
    }

    const width = 1217;
    const height = 1280;
    const canvas = getCanvasLib().createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    await loadBackground(ctx, width, height, BG_URL);

    let img1: Image;
    let img2: Image;

    try {
        img1 = await remoteImage(image1);
    } catch {
        return res.status(400).json({ status: false, message: 'Gagal memuat gambar dari image1.' });
    }

    try {
        img2 = await remoteImage(image2);
    } catch {
        return res.status(400).json({ status: false, message: 'Gagal memuat gambar dari image2.' });
    }

    drawCover(ctx, img1, 833, 61, 305, 344);
    drawCover(ctx, img2, 841, 719, 299, 348);

    return sendPng(res, canvas);
}
