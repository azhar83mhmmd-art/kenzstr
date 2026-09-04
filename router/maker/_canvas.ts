import { getCanvasLib } from '../../src/canvasSafe';
import type { Image, SKRSContext2D } from '@napi-rs/canvas';
import axios from 'axios';
import path from 'path';
import fs from 'fs';
import os from 'os';

/*
 * Cache generik untuk asset (font/gambar) dari URL pihak ketiga, dipakai
 * oleh endpoint maker yang butuh font/background sendiri (qcwa, igqc,
 * kalender, dst). Sama-sama disimpan di os.tmpdir() supaya aman di
 * lingkungan serverless (read-only kecuali /tmp).
 */
const REMOTE_ASSET_DIR = path.join(os.tmpdir(), 'kairoo-assets');

export async function ensureRemoteFile(url: string, filename: string): Promise<string> {
    const dest = path.join(REMOTE_ASSET_DIR, filename);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return dest;

    fs.mkdirSync(REMOTE_ASSET_DIR, { recursive: true });
    const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 20000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    fs.writeFileSync(dest, Buffer.from(response.data));
    return dest;
}

const registeredRemoteFonts = new Set<string>();

export async function ensureRemoteFont(url: string, family: string, filename: string): Promise<void> {
    const { GlobalFonts } = getCanvasLib();
    if (registeredRemoteFonts.has(family)) return;
    if (GlobalFonts.families.some((f) => f.family === family)) {
        registeredRemoteFonts.add(family);
        return;
    }

    const file = await ensureRemoteFile(url, filename);
    GlobalFonts.registerFromPath(file, family);
    registeredRemoteFonts.add(family);
}

/*
 * Helper bersama untuk semua endpoint maker berbasis canvas.
 *
 * PENTING: @napi-rs/canvas TIDAK punya font "Arial" bawaan seperti
 * browser. Font apa pun yang dipakai lewat ctx.font harus di-register
 * lebih dulu lewat GlobalFonts.registerFromPath(), kalau tidak teks
 * gagal digambar. ensureFont() di bawah menangani ini sekali saja
 * (di-cache di os.tmpdir() supaya kompatibel dengan lingkungan
 * serverless yang filesystem-nya read-only kecuali /tmp).
 */

const FONT_URL = 'https://raw.githubusercontent.com/Ditzzx-vibecoder/Assets/main/Font/ARIALN.ttf';
const FONT_DIR = path.join(os.tmpdir(), 'kairoo-canvas-fonts');
const FONT_PATH = path.join(FONT_DIR, 'ARIALN.ttf');

export const FONT_FAMILY = 'KairooSans';

let fontReady: Promise<void> | null = null;

export function ensureFont(): Promise<void> {
    if (fontReady) return fontReady;

    fontReady = (async () => {
        const { GlobalFonts } = getCanvasLib();
        if (GlobalFonts.families.some((f) => f.family === FONT_FAMILY)) return;

        if (!fs.existsSync(FONT_PATH) || fs.statSync(FONT_PATH).size === 0) {
            fs.mkdirSync(FONT_DIR, { recursive: true });
            const response = await axios.get(FONT_URL, {
                responseType: 'arraybuffer',
                timeout: 20000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            fs.writeFileSync(FONT_PATH, Buffer.from(response.data));
        }

        GlobalFonts.registerFromPath(FONT_PATH, FONT_FAMILY);
    })();

    return fontReady;
}

export async function remoteImage(url: string): Promise<Image> {
    const { loadImage } = getCanvasLib();
    const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 20000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    return loadImage(Buffer.from(response.data));
}

/*
 * Background polos sebagai fallback saat asset dari pihak ketiga
 * gagal diambil (404, timeout, host down, dsb) — supaya endpoint
 * tetap mengembalikan gambar, bukan error 500.
 */
export function drawFallbackBg(ctx: SKRSContext2D, w: number, h: number) {
    ctx.fillStyle = '#1c1c1e';
    ctx.fillRect(0, 0, w, h);
}

export async function loadBackground(
    ctx: SKRSContext2D,
    w: number,
    h: number,
    url: string
): Promise<boolean> {
    try {
        const img = await remoteImage(url);
        ctx.drawImage(img, 0, 0, w, h);
        return true;
    } catch {
        drawFallbackBg(ctx, w, h);
        return false;
    }
}

export function sendPng(res: any, canvas: any) {
    res.set('Content-Type', 'image/png');
    return res.send(canvas.toBuffer('image/png'));
}

export function wrap(ctx: SKRSContext2D, text: string, maxWidth: number, font: string) {
    ctx.font = font;
    const lines: string[] = [];

    for (const para of text.split('\n')) {
        let line = '';
        for (const word of para.split(/\s+/)) {
            const test = line ? `${line} ${word}` : word;
            if (line && ctx.measureText(test).width > maxWidth) {
                lines.push(line);
                line = word;
            } else {
                line = test;
            }
        }
        if (line) lines.push(line);
    }

    return lines.length ? lines : [''];
}

export function fitFont(
    ctx: SKRSContext2D,
    text: string,
    maxWidth: number,
    maxHeight: number,
    start = 80,
    min = 18,
    family: string = FONT_FAMILY
) {
    let size = start;

    while (size > min) {
        const lines = wrap(ctx, text, maxWidth, `700 ${size}px ${family}`);
        if (lines.length * size * 1.2 <= maxHeight) return { size, lines };
        size -= 2;
    }

    return { size: min, lines: wrap(ctx, text, maxWidth, `700 ${min}px ${family}`) };
}
