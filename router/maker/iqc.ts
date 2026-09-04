import { Request, Response } from 'express';
import { getCanvasLib } from '../../src/canvasSafe';
import type { Image, SKRSContext2D } from '@napi-rs/canvas';
import https from 'https';
import path from 'path';
import fs from 'fs';
import os from 'os';

/*
 * IQC Card Generator
 *
 * Menghasilkan gambar kartu bergaya "info WhatsApp" (nama, waktu, foto)
 * di atas background siap pakai. Murni komposisi gambar/teks di canvas —
 * semua parameter (nama, waktu, foto) datang langsung dari request,
 * tidak ada data yang disimpan di server.
 *
 * Asset (font & background) di-cache di os.tmpdir() supaya kompatibel
 * dengan lingkungan serverless (mis. Vercel) yang filesystem-nya
 * read-only kecuali /tmp.
 */

const TMP_DIR = path.join(os.tmpdir(), 'kairoo-iqc');
const FONTS_DIR = path.join(TMP_DIR, 'fonts');
const BG_DIR = path.join(TMP_DIR, 'backgrounds');

const REMOTE_ASSETS = [
    {
        url: 'https://raw.githubusercontent.com/Ditzzx-vibecoder/Assets/main/Font/SFPRODISPLAYREGULAR.OTF',
        dest: path.join(FONTS_DIR, 'SFPRODISPLAYREGULAR.OTF')
    },
    {
        url: 'https://raw.githubusercontent.com/Ditzzx-vibecoder/Assets/main/Font/SFPRODISPLAYSEMIBOLD.ttf',
        dest: path.join(FONTS_DIR, 'SFPRODISPLAYSEMIBOLD.ttf')
    },
    {
        url: 'https://raw.githubusercontent.com/Ditzzx-vibecoder/Assets/main/Image/bg.jpg',
        dest: path.join(BG_DIR, 'bg.jpg')
    }
];

const WA_COLORS = [
    '#E53935', '#D81B60', '#8E24AA', '#5E35B1',
    '#1E88E5', '#039BE5', '#00897B', '#43A047',
    '#F4511E', '#FB8C00'
];

let colorIndex = 0;
const getNextColor = () => {
    const color = WA_COLORS[colorIndex % WA_COLORS.length];
    colorIndex = (colorIndex + 1) % WA_COLORS.length;
    return color;
};

type Zone = {
    a: number; b: number; c: number; d: number;
    fontSize?: number; maxChars?: number; font?: string;
    align?: 'left' | 'center'; textColor?: string; centerY?: number;
    radius?: number;
};

const safeZones: Record<string, Zone> = {
    namaAtas: { a: 980, b: 1080, c: 250, d: 630, fontSize: 55, maxChars: 25, font: 'SFProSemiBold', align: 'left' },
    foto: { a: 1125, b: 1713, c: 240, d: 830, radius: 28 },
    waktu: { a: 1750, b: 1860, c: 233, d: 424, fontSize: 45, maxChars: 10, font: 'SFProRegular', textColor: '#555555', align: 'center' },
    namaBawah: { a: 2701, b: 2880, c: 700, d: 1160, centerY: 2787, fontSize: 67, maxChars: 25, font: 'SFProSemiBold', textColor: '#100e0e', align: 'left' }
};

function download(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
        if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return resolve();

        fs.mkdirSync(path.dirname(dest), { recursive: true });
        const file = fs.createWriteStream(dest);

        https.get(url, (response) => {
            if ([301, 302, 303, 307, 308].includes(response.statusCode || 0) && response.headers.location) {
                file.close(() => {
                    if (fs.existsSync(dest)) fs.unlinkSync(dest);
                    download(response.headers.location as string, dest).then(resolve).catch(reject);
                });
                return;
            }

            if (response.statusCode !== 200) {
                file.close(() => {
                    if (fs.existsSync(dest)) fs.unlinkSync(dest);
                    reject(new Error(`HTTP ${response.statusCode} untuk ${url}`));
                });
                return;
            }

            response.pipe(file);
            file.on('finish', () => file.close(() => resolve()));
        }).on('error', (err) => {
            file.close(() => {
                if (fs.existsSync(dest)) fs.unlinkSync(dest);
                reject(err);
            });
        });
    });
}

async function downloadAssets() {
    for (const asset of REMOTE_ASSETS) {
        await download(asset.url, asset.dest);
    }
}

function findFontFile(dir: string, basenames: string[]) {
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir);
    for (const base of basenames) {
        const match = files.find((f) => f.toLowerCase() === base.toLowerCase());
        if (match) return path.join(dir, match);
    }
    return null;
}

function registerFont(family: string, ...basenames: string[]) {
    if (getCanvasLib().GlobalFonts.families.some((f) => f.family === family)) return;
    const file = findFontFile(FONTS_DIR, basenames);
    if (!file) throw new Error(`Font tidak ditemukan: ${family}`);
    getCanvasLib().GlobalFonts.registerFromPath(file, family);
}

let fontsLoaded = false;
function loadFonts() {
    if (fontsLoaded) return;
    registerFont('SFProSemiBold', 'SFPRODISPLAYSEMIBOLD.TTF', 'SFPRODISPLAYSEMIBOLD.OTF');
    registerFont('SFProRegular', 'SFPRODISPLAYREGULAR.OTF', 'SFPRODISPLAYREGULAR.TTF');
    fontsLoaded = true;
}

function roundedClipPath(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function drawText(ctx: SKRSContext2D, text: string, zone: Zone, textColor: string) {
    const { a, b, c, d, fontSize = 40, maxChars = 25, font = 'SFProRegular', align = 'left', centerY } = zone;
    const str = String(text).slice(0, maxChars);
    const boxW = d - c;
    const boxH = b - a;
    const cy = centerY !== undefined ? centerY : a + boxH / 2;
    const weight = font === 'SFProSemiBold' ? 'bold' : 'normal';

    let size = fontSize;
    ctx.textBaseline = 'middle';
    while (size > 12) {
        ctx.font = `${weight} ${size}px ${font}`;
        if (ctx.measureText(str).width <= boxW) break;
        size -= 1;
    }
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.fillStyle = textColor;

    if (align === 'center') {
        ctx.textAlign = 'center';
        ctx.fillText(str, c + boxW / 2, cy);
    } else {
        ctx.textAlign = 'left';
        ctx.fillText(str, c, cy);
    }
}

async function drawFoto(ctx: SKRSContext2D, img: Image, zone: Zone) {
    const { a, b, c, d, radius = 28 } = zone;
    const x = c, y = a, w = d - c, h = b - a;
    const imgRatio = img.width / img.height;
    const boxRatio = w / h;

    ctx.save();
    roundedClipPath(ctx, x, y, w, h, radius);
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

export default async function iqcHandler(req: Request, res: Response) {
    const nama = String(req.query.nama || req.body?.nama || '').trim();
    const waktuInput = String(req.query.waktu || req.body?.waktu || '').trim();
    const fotoUrl = String(req.query.foto || req.body?.foto || '').trim();

    if (!nama) {
        return res.status(400).json({
            status: false,
            message: "Parameter 'nama' diperlukan."
        });
    }

    if (fotoUrl && !/^https?:\/\//i.test(fotoUrl)) {
        return res.status(400).json({
            status: false,
            message: "Parameter 'foto' harus berupa URL http/https."
        });
    }

    const waktu = waktuInput ||
        new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace(':', '.');

    try {
        await downloadAssets();
        loadFonts();

        const width = 1920;
        const height = 3413;
        const canvas = getCanvasLib().createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        const bgPath = path.join(BG_DIR, 'bg.jpg');
        if (fs.existsSync(bgPath) && fs.statSync(bgPath).size > 0) {
            const bgImg = await getCanvasLib().loadImage(bgPath);
            ctx.drawImage(bgImg, 0, 0, width, height);
        } else {
            ctx.fillStyle = '#f0ece4';
            ctx.fillRect(0, 0, width, height);
        }

        if (fotoUrl) {
            try {
                const img = await getCanvasLib().loadImage(fotoUrl);
                await drawFoto(ctx, img, safeZones.foto);
            } catch {
                return res.status(400).json({
                    status: false,
                    message: 'Gagal memuat gambar dari URL foto.'
                });
            }
        }

        const namaColor = getNextColor();
        drawText(ctx, nama, safeZones.namaAtas, namaColor);
        drawText(ctx, waktu, safeZones.waktu, safeZones.waktu.textColor || '#555555');
        drawText(ctx, nama, safeZones.namaBawah, safeZones.namaBawah.textColor || '#100e0e');

        const buffer = canvas.toBuffer('image/png');
        res.set('Content-Type', 'image/png');
        return res.send(buffer);
    } catch (error: any) {
        return res.status(500).json({
            status: false,
            message: error.message || 'Gagal membuat gambar.'
        });
    }
}
