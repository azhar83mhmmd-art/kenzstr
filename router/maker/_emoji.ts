import axios from 'axios';
import { getCanvasLib } from '../../src/canvasSafe';
import type { Image, SKRSContext2D } from '@napi-rs/canvas';
import path from 'path';
import fs from 'fs';
import os from 'os';

/*
 * Helper bersama untuk menggambar emoji bergaya Apple di atas canvas
 * (dipakai oleh endpoint yang meniru tampilan chat WhatsApp/Instagram).
 * Peta emoji (JSON berisi PNG base64 per-emoji) di-cache di os.tmpdir()
 * supaya kompatibel dengan lingkungan serverless (read-only fs kecuali
 * /tmp).
 */

const EMOJI_JSON_URL =
    'https://media.githubusercontent.com/media/Ditzzx-vibecoder/entahlah/main/emoji-apple.json';
const EMOJI_DIR = path.join(os.tmpdir(), 'kairoo-emoji');
const EMOJI_JSON_PATH = path.join(EMOJI_DIR, 'emoji-apple.json');

const EMOJI_REGEX =
    /(\p{Emoji_Modifier_Base}\p{Emoji_Modifier}|\p{Emoji_Presentation}\uFE0F?|\p{Emoji}\uFE0F|[\u{1F1E0}-\u{1F1FF}]{2}|\p{Extended_Pictographic}\uFE0F?)/gu;

let emojiMap: Record<string, string> | null = null;
const emojiImageCache = new Map<string, Image | null>();

function emojiToUnicode(emoji: string) {
    return [...emoji]
        .map((c) => (c.codePointAt(0) as number).toString(16).padStart(4, '0'))
        .join('-');
}

async function loadEmojiMap(): Promise<Record<string, string>> {
    if (emojiMap) return emojiMap;

    if (!fs.existsSync(EMOJI_JSON_PATH) || fs.statSync(EMOJI_JSON_PATH).size === 0) {
        fs.mkdirSync(EMOJI_DIR, { recursive: true });
        const response = await axios.get(EMOJI_JSON_URL, {
            responseType: 'arraybuffer',
            timeout: 20000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        fs.writeFileSync(EMOJI_JSON_PATH, Buffer.from(response.data));
    }

    emojiMap = JSON.parse(fs.readFileSync(EMOJI_JSON_PATH, 'utf-8'));
    return emojiMap as Record<string, string>;
}

async function getEmojiImage(emoji: string): Promise<Image | null> {
    if (emojiImageCache.has(emoji)) return emojiImageCache.get(emoji) as Image | null;

    try {
        const map = await loadEmojiMap();
        const base = emojiToUnicode(emoji);
        const variants = [
            base,
            base.replace(/-fe0f/gi, ''),
            `${base.replace(/-fe0f/gi, '')}-fe0f`,
            base.toUpperCase(),
            base.replace(/-fe0f/gi, '').toUpperCase(),
            `${base.replace(/-fe0f/gi, '').toUpperCase()}-FE0F`
        ];

        let b64: string | null = null;
        for (const v of variants) {
            if (map[v]) {
                b64 = map[v];
                break;
            }
        }

        if (!b64) {
            emojiImageCache.set(emoji, null);
            return null;
        }

        const img = await getCanvasLib().loadImage(Buffer.from(b64, 'base64'));
        emojiImageCache.set(emoji, img);
        return img;
    } catch {
        // Peta emoji gagal diambil (mis. offline) — fallback ke ctx.fillText biasa,
        // jangan sampai membuat seluruh endpoint gagal.
        emojiImageCache.set(emoji, null);
        return null;
    }
}

/*
 * PENTING: panggil dengan ctx.textBaseline = 'middle' supaya posisi
 * vertikal emoji (gambar) sejajar dengan teks di sekitarnya.
 */
export async function drawTextWithEmojis(
    ctx: SKRSContext2D,
    text: string,
    x: number,
    y: number,
    fontSize: number
): Promise<void> {
    const parts = text.split(EMOJI_REGEX);
    let currentX = x;

    for (const part of parts) {
        if (!part) continue;
        EMOJI_REGEX.lastIndex = 0;

        if (EMOJI_REGEX.test(part)) {
            const size = fontSize * 1.05;
            const img = await getEmojiImage(part);
            if (img) {
                ctx.drawImage(img, currentX, y - size / 2, size, size);
                currentX += size;
            } else {
                ctx.fillText(part, currentX, y);
                currentX += ctx.measureText(part).width;
            }
        } else {
            ctx.fillText(part, currentX, y);
            currentX += ctx.measureText(part).width;
        }
        EMOJI_REGEX.lastIndex = 0;
    }
}

export async function measureTextWithEmojis(
    ctx: SKRSContext2D,
    text: string,
    fontSize: number
): Promise<number> {
    const parts = text.split(EMOJI_REGEX);
    let width = 0;

    for (const part of parts) {
        if (!part) continue;
        EMOJI_REGEX.lastIndex = 0;
        if (EMOJI_REGEX.test(part)) {
            width += fontSize * 1.05;
        } else {
            width += ctx.measureText(part).width;
        }
        EMOJI_REGEX.lastIndex = 0;
    }

    return width;
}

export async function wrapTextWithEmojis(
    ctx: SKRSContext2D,
    text: string,
    maxWidth: number,
    fontSize: number
): Promise<string[]> {
    const words = text.split(' ');
    const lines: string[] = [];
    let current = '';

    for (const word of words) {
        const test = current ? `${current} ${word}` : word;
        const w = await measureTextWithEmojis(ctx, test, fontSize);
        if (w > maxWidth && current) {
            lines.push(current);
            current = word;
        } else {
            current = test;
        }
    }
    if (current) lines.push(current);

    return lines;
}
