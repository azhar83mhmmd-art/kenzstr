import { Request, Response } from 'express';
import { getCanvasLib } from '../../src/canvasSafe';
import type { SKRSContext2D, Image } from '@napi-rs/canvas';
import { ensureRemoteFont, remoteImage, sendPng } from './_canvas';

/*
 * IG Story Card
 *
 * Kartu bergaya Instagram Story (foto utama blur-cover, avatar bulat,
 * nama pengguna) — diadaptasi dari referensi igstory-img.js milik
 * user. Foto utama & avatar wajib dikirim lewat parameter (bukan
 * hardcoded), font & template background di-cache lewat helper
 * bersama _canvas.ts.
 */

const BG_URL = 'https://raw.githubusercontent.com/Ditzzx-vibecoder/Assets/main/Image/igimg.png';
const FONT_SEMIBOLD_URL =
    'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKYAZ9hiJ-Ek-_EeA.woff2';
const FONT_REGULAR_URL =
    'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hiJ-Ek-_EeA.woff2';
const FAMILY_SEMIBOLD = 'KairooInterSemiBold';
const FAMILY_REGULAR = 'KairooInterRegular';

const BG_W = 898;
const BG_H = 1600;

const FOTO_ZONE = { a: 136, b: 912, c: 38, d: 860, radius: 20 };
const PP = { x: 110, y: 82, size: 80 };
const NAMA = { x: 170, y: 58, fontSize: 25, maxWidth: 500, minFontSize: 16, color: '#feffff' };
const USERNAME = { x: 170, y: 90, fontSize: 17, color: '#8c8d91' };

function roundedBottomClipPath(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y);
    ctx.closePath();
}

function getContainSize(img: Image, w: number, h: number) {
    const imgRatio = img.width / img.height;
    const boxRatio = w / h;
    if (imgRatio > boxRatio) return { fw: w, fh: w / imgRatio };
    return { fh: h, fw: h * imgRatio };
}

async function drawFoto(ctx: SKRSContext2D, img: Image, zone: typeof FOTO_ZONE) {
    const { a, b, c, d, radius } = zone;
    const x = c, y = a, w = d - c, h = b - a;
    ctx.save();
    roundedBottomClipPath(ctx, x, y, w, h, radius);
    ctx.clip();
    ctx.filter = 'blur(28px)';
    ctx.drawImage(img, x - 40, y - 40, w + 80, h + 80);
    ctx.filter = 'none';
    const { fw, fh } = getContainSize(img, w, h);
    ctx.drawImage(img, x + (w - fw) / 2, y + (h - fh) / 2, fw, fh);
    ctx.restore();
}

async function drawAvatar(ctx: SKRSContext2D, img: Image, pp: typeof PP) {
    const { x, y, size } = pp;
    const r = size / 2;
    const dim = Math.min(img.width, img.height);
    const sx = (img.width - dim) / 2;
    const sy = (img.height - dim) / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, sx, sy, dim, dim, x - r, y - r, size, size);
    ctx.restore();
}

function resolveFontSize(ctx: SKRSContext2D, text: string, maxWidth: number, fontSize: number, minFontSize: number, family: string) {
    let size = fontSize;
    while (size > minFontSize) {
        ctx.font = `${size}px ${family}`;
        if (ctx.measureText(text).width <= maxWidth) break;
        size -= 1;
    }
    return Math.max(size, minFontSize);
}

let bgImageCache: Image | null = null;
async function loadBgImage(): Promise<Image> {
    if (bgImageCache) return bgImageCache;
    bgImageCache = await remoteImage(BG_URL);
    return bgImageCache;
}

export default async function igstoryHandler(req: Request, res: Response) {
    const foto = String(req.query.foto || req.body?.foto || '').trim();
    const avatar = String(req.query.avatar || req.body?.avatar || '').trim();
    const username = String(req.query.username || req.body?.username || 'Someone').trim();

    if (!foto || !avatar) {
        return res.status(400).json({
            status: false,
            message: "Parameter 'foto' (foto utama) dan 'avatar' (foto profil) diperlukan."
        });
    }

    if (!/^https?:\/\//i.test(foto) || !/^https?:\/\//i.test(avatar)) {
        return res.status(400).json({
            status: false,
            message: "Parameter 'foto' dan 'avatar' harus berupa URL http/https."
        });
    }

    try {
        const [bgImg] = await Promise.all([
            loadBgImage(),
            ensureRemoteFont(FONT_SEMIBOLD_URL, FAMILY_SEMIBOLD, 'inter-semibold-igstory.woff2'),
            ensureRemoteFont(FONT_REGULAR_URL, FAMILY_REGULAR, 'inter-regular-igstory.woff2')
        ]);

        const canvas = getCanvasLib().createCanvas(BG_W, BG_H);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bgImg, 0, 0, BG_W, BG_H);

        let photoImg: Image, avatarImg: Image;
        try {
            [photoImg, avatarImg] = await Promise.all([remoteImage(foto), remoteImage(avatar)]);
        } catch {
            return res.status(400).json({
                status: false,
                message: 'Gagal memuat gambar dari URL foto/avatar.'
            });
        }

        await drawFoto(ctx, photoImg, FOTO_ZONE);
        await drawAvatar(ctx, avatarImg, PP);

        const namaSize = resolveFontSize(ctx, username, NAMA.maxWidth, NAMA.fontSize, NAMA.minFontSize, FAMILY_SEMIBOLD);
        ctx.font = `${namaSize}px ${FAMILY_SEMIBOLD}`;
        ctx.fillStyle = NAMA.color;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(username, NAMA.x, NAMA.y);

        ctx.font = `${USERNAME.fontSize}px ${FAMILY_REGULAR}`;
        ctx.fillStyle = USERNAME.color;
        ctx.fillText(`@${username.toLowerCase().replace(/\s+/g, '')}`, USERNAME.x, USERNAME.y);

        return sendPng(res, canvas);
    } catch (error: any) {
        return res.status(500).json({
            status: false,
            message: error.message || 'Gagal membuat gambar.'
        });
    }
}
