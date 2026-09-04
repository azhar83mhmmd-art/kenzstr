import { Request, Response } from 'express';
import axios from 'axios';
import FormData from 'form-data';

const API = 'https://api.ocr.space/parse/image';
// Free-tier public demo key milik OCR.space (bukan credential milik Kairoo).
// Untuk penggunaan produksi disarankan daftar API key sendiri lewat
// OCR_SPACE_API_KEY di environment variable.
const DEFAULT_KEY = 'OCRonFrontpageOnly_26';

function cleanOcrText(text: string): string {
    return String(text || '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\t+/g, ' ')
        .replace(/[ ]{2,}/g, ' ')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .join('\n');
}

export default async function ocrHandler(req: Request, res: Response) {
    const imageUrl = String(req.query.url || req.body?.url || '').trim();

    if (!imageUrl) {
        return res.status(400).json({ status: false, message: "Parameter 'url' (link gambar struk/dokumen) diperlukan." });
    }

    const apiKey = process.env.OCR_SPACE_API_KEY || DEFAULT_KEY;

    const form = new FormData();
    form.append('url', imageUrl);
    form.append('language', String(req.query.lang || 'eng'));
    form.append('isOverlayRequired', 'false');
    form.append('FileType', 'Auto');
    form.append('detectOrientation', 'true');
    form.append('isTable', 'true');
    form.append('scale', 'true');
    form.append('OCREngine', '5');

    const response = await axios.post(API, form, {
        timeout: 60000,
        maxBodyLength: Infinity,
        validateStatus: () => true,
        headers: {
            ...form.getHeaders(),
            apikey: apiKey,
            accept: 'application/json'
        }
    });

    if (response.status !== 200) {
        return res.status(502).json({ status: false, message: `OCR gagal (HTTP ${response.status}).` });
    }

    const data = response.data;

    if (data?.IsErroredOnProcessing) {
        const errorMessage =
            data?.ParsedResults?.[0]?.ErrorMessage || data?.ErrorMessage?.join?.(', ') || 'OCR gagal.';
        return res.status(422).json({ status: false, message: errorMessage });
    }

    const parsedResults = data?.ParsedResults || [];
    const text = parsedResults.map((item: any) => cleanOcrText(item?.ParsedText || '')).join('\n\n');

    return res.json({
        status: true,
        input: imageUrl,
        result: text
    });
}
