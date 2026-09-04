import { Request, Response } from 'express';
import { getCanvasLib } from '../../src/canvasSafe';
import type { Image, SKRSContext2D } from '@napi-rs/canvas';
import { ensureRemoteFont, remoteImage, sendPng } from './_canvas';
import { drawTextWithEmojis, measureTextWithEmojis, wrapTextWithEmojis } from './_emoji';

/*
 * IG DM Screenshot — meniru tampilan pesan langsung Instagram (bubble
 * chat + kartu reaksi emoji). Diadaptasi dari referensi igqc.js.
 *
 * Catatan: file ini sebelumnya berisi implementasi lama yang memakai
 * font 'Arial' langsung tanpa didaftarkan ke @napi-rs/canvas (yang
 * TIDAK punya font bawaan seperti browser) — hasilnya teks sering tidak
 * tergambar / tidak sesuai gambar referensi. Endpoint ini sebelumnya
 * juga belum terdaftar di src/endpoints/maker.json.
 */

const BG_URL = 'https://cdn.jsdelivr.net/gh/Ditzzx-vibecoder/Assets@main/Image/igqc.png';
const FONT_URL =
    'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hiJ-Ek-_EeA.woff2';
const FONT_FAMILY = 'IgqcInterRegular';

const CANVAS_W = 878;
const CANVAS_H = 1791;

export default async function igqcHandler(req: Request, res: Response) {
    const teks = String(req.query.teks ?? req.body?.teks ?? '').trim();
    const fotoUrl = String(req.query.foto ?? req.body?.foto ?? '').trim();
    const waktu =
        String(req.query.waktu ?? req.body?.waktu ?? '').trim() ||
        new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace(':', '.');

    if (!teks && !fotoUrl) {
        return res.status(400).json({
            status: false,
            message: "Isi salah satu dari parameter 'teks' atau 'foto'."
        });
    }

    if (fotoUrl && !/^https?:\/\//i.test(fotoUrl)) {
        return res.status(400).json({
            status: false,
            message: "Parameter 'foto' harus berupa URL http/https."
        });
    }

    try {
        await ensureRemoteFont(FONT_URL, FONT_FAMILY, 'igqc-inter-regular.woff2');
        const bg = await remoteImage(BG_URL);

        const canvas = getCanvasLib().createCanvas(CANVAS_W, CANVAS_H);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bg, 0, 0, CANVAS_W, CANVAS_H);

        const menuBoxTop = 985;
        ctx.fillStyle = '#a1a4a9';
        ctx.font = `20px ${FONT_FAMILY}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(waktu, 72, menuBoxTop + 35);

        const maxWidthLimit = 530;
        const maxImgWidthLimit = 420;
        const minBubbleWidth = 280;
        const paddingX = 30;
        const paddingY = 22;
        const fixedX = 38;
        const bubbleBottom = menuBoxTop - 20;

        const emCardH = 104;
        const minEmCardY = 60;

        const hasImg = Boolean(fotoUrl);
        const hasTxt = Boolean(teks);

        let imgObj: Image | null = null;
        if (hasImg) {
            try {
                imgObj = await remoteImage(fotoUrl);
            } catch {
                return res.status(400).json({ status: false, message: 'Gagal memuat gambar dari foto.' });
            }
        }

        let chatFontSize = 30;
        const minFontSize = 12;
        let imageScale = 1.0;

        let chatLines: string[] = [];
        let lineHeight = 0;
        let textBubbleH = 0;
        let imgDrawW = 0;
        let imgDrawH = 0;
        let bubbleW = 0;
        let textBubbleTop = 0;
        let imgBubbleTop = 0;
        let emCardY = 0;
        let topmostY = 0;

        while (chatFontSize >= minFontSize) {
            if (hasImg && hasTxt && imgObj) {
                ctx.font = `${chatFontSize}px ${FONT_FAMILY}`;
                chatLines = await wrapTextWithEmojis(ctx, teks, maxWidthLimit, chatFontSize);
                lineHeight = chatFontSize + 14;
                textBubbleH = (chatLines.length - 1) * lineHeight + chatFontSize + paddingY * 2;
                textBubbleTop = bubbleBottom - textBubbleH;

                const imgAspect = imgObj.width / imgObj.height;
                const baseImgW = Math.min(Math.max(imgObj.width, minBubbleWidth), maxImgWidthLimit);
                imgDrawW = Math.round(baseImgW * imageScale);
                imgDrawH = Math.round(imgDrawW / imgAspect);

                const bubbleGap = 12;
                imgBubbleTop = textBubbleTop - imgDrawH - bubbleGap;
                topmostY = imgBubbleTop;
            } else if (hasImg && imgObj) {
                const imgAspect = imgObj.width / imgObj.height;
                const baseImgW = Math.min(Math.max(imgObj.width, minBubbleWidth), maxImgWidthLimit);
                imgDrawW = Math.round(baseImgW * imageScale);
                imgDrawH = Math.round(imgDrawW / imgAspect);
                imgBubbleTop = bubbleBottom - imgDrawH;
                topmostY = imgBubbleTop;
            } else {
                ctx.font = `${chatFontSize}px ${FONT_FAMILY}`;
                chatLines = await wrapTextWithEmojis(ctx, teks, maxWidthLimit, chatFontSize);
                lineHeight = chatFontSize + 14;
                textBubbleH = (chatLines.length - 1) * lineHeight + chatFontSize + paddingY * 2;
                textBubbleTop = bubbleBottom - textBubbleH;
                topmostY = textBubbleTop;
            }

            emCardY = topmostY - emCardH - 20;
            if (emCardY >= minEmCardY) break;

            if (hasTxt) {
                chatFontSize -= 1;
            } else if (hasImg) {
                imageScale -= 0.05;
                if (imageScale < 0.3) break;
            }
        }

        if (hasImg && imgObj) {
            const currentImgTop = hasTxt ? imgBubbleTop : topmostY;
            const radiusImage = 24;

            ctx.save();
            ctx.beginPath();
            ctx.roundRect(fixedX, currentImgTop, imgDrawW, imgDrawH, [radiusImage]);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(imgObj, fixedX, currentImgTop, imgDrawW, imgDrawH);
            ctx.restore();
        }

        if (hasTxt) {
            const currentTextTop = hasImg ? textBubbleTop : topmostY;
            const currentTextHeight = textBubbleH;

            ctx.font = `${chatFontSize}px ${FONT_FAMILY}`;
            let longestW = 0;
            for (const l of chatLines) {
                const w = await measureTextWithEmojis(ctx, l.trim(), chatFontSize);
                if (w > longestW) longestW = w;
            }

            bubbleW = Math.max(longestW + paddingX * 2, 180);

            const rad = 25;
            ctx.fillStyle = '#262628';
            ctx.beginPath();
            ctx.moveTo(fixedX + 8, currentTextTop);
            ctx.lineTo(fixedX + bubbleW - rad, currentTextTop);
            ctx.quadraticCurveTo(fixedX + bubbleW, currentTextTop, fixedX + bubbleW, currentTextTop + rad);
            ctx.lineTo(fixedX + bubbleW, currentTextTop + currentTextHeight - rad);
            ctx.quadraticCurveTo(
                fixedX + bubbleW, currentTextTop + currentTextHeight,
                fixedX + bubbleW - rad, currentTextHeight + currentTextTop
            );
            ctx.lineTo(fixedX + rad, currentTextTop + currentTextHeight);
            ctx.quadraticCurveTo(
                fixedX, currentTextTop + currentTextHeight,
                fixedX, currentTextTop + currentTextHeight - rad
            );
            ctx.lineTo(fixedX, currentTextTop + 8);
            ctx.quadraticCurveTo(fixedX, currentTextTop, fixedX + 8, currentTextTop);
            ctx.closePath();
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(fixedX + 4, currentTextTop + 20);
            ctx.quadraticCurveTo(fixedX - 10, currentTextTop + 4, fixedX - 16, currentTextTop);
            ctx.quadraticCurveTo(fixedX - 2, currentTextTop, fixedX + 14, currentTextTop + 2);
            ctx.closePath();
            ctx.fill();

            ctx.save();
            ctx.fillStyle = '#eff0f4';
            ctx.font = `${chatFontSize}px ${FONT_FAMILY}`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            for (let i = 0; i < chatLines.length; i++) {
                const lineY = currentTextTop + paddingY + i * lineHeight + chatFontSize / 2;
                await drawTextWithEmojis(ctx, chatLines[i].trim(), fixedX + paddingX, lineY, chatFontSize);
            }
            ctx.restore();
        }

        const emojis = ['❤️', '😂', '😮', '😢', '😡', '👍'];
        const emojiSize = Math.round(54 * 1.03);
        const emCardW = Math.round(530 * 1.03);
        const emCardX = fixedX - 6;

        ctx.fillStyle = '#222328';
        ctx.beginPath();
        ctx.roundRect(emCardX, emCardY, emCardW, emCardH, [emCardH / 2]);
        ctx.fill();

        const startX = emCardX + 52;
        const spacingX = 80;
        const emojiCY = emCardY + emCardH / 2;

        ctx.textBaseline = 'middle';
        for (let i = 0; i < Math.min(emojis.length, 6); i++) {
            await drawTextWithEmojis(ctx, emojis[i], startX + i * spacingX - emojiSize / 2, emojiCY, emojiSize);
        }

        ctx.fillStyle = '#8e8e93';
        ctx.font = `${Math.round(36 * 1.03)}px ${FONT_FAMILY}`;
        ctx.textAlign = 'center';
        ctx.fillText('+', startX + 6 * spacingX - 2, emCardY + emCardH / 2 - 2);

        return sendPng(res, canvas);
    } catch (error: any) {
        return res.status(500).json({
            status: false,
            message: error?.message || 'Gagal membuat gambar.'
        });
    }
}
