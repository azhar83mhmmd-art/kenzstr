import { Request, Response } from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';

const LANG = 'id';
const BASE = `https://${LANG}.wikipedia.org`;
const API = `${BASE}/w/api.php`;

function decodeHtml(text: string) {
    return String(text || '')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

function cleanText(text: string) {
    return decodeHtml(text)
        .replace(/<\/?[^>]+>/g, '')
        .replace(/\[\d+\]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

export default async function wikipediaHandler(req: Request, res: Response) {
    const query = String(req.query.q || req.query.query || '').trim();

    if (!query) {
        return res.status(400).json({
            status: false,
            message: "Parameter 'q' diperlukan."
        });
    }

    const { data: searchData } = await axios.get(API, {
        params: {
            action: 'query',
            list: 'search',
            srsearch: query,
            srlimit: 5,
            format: 'json',
            origin: '*'
        },
        timeout: 20000
    });

    const searchResults = searchData?.query?.search || [];

    if (!searchResults.length) {
        return res.json({
            status: false,
            message: 'Artikel tidak ditemukan',
            result: null
        });
    }

    const first = searchResults[0];
    const pageUrl = `${BASE}/wiki/${encodeURIComponent(first.title.replaceAll(' ', '_'))}`;

    const { data: html } = await axios.get(pageUrl, {
        headers: {
            'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
        },
        timeout: 20000
    });

    // Hanya parse bagian penting (title, intro, infobox terbatas) — tidak
    // memuat/mem-parsing seluruh section artikel agar tetap hemat memori
    // untuk artikel besar.
    const $ = cheerio.load(html, {}, false);

    $('script, style, sup.reference, .mw-editsection, .navbox, .metadata, .ambox, .hatnote').remove();

    const pageTitle = cleanText($('#firstHeading').text()) || first.title;
    const description = cleanText($('.shortdescription').first().text()) || null;

    const introParagraphs: string[] = [];
    $('.mw-parser-output > p').each((_, el) => {
        if (introParagraphs.length >= 3) return;
        const text = cleanText($(el).text());
        if (text.length > 40) introParagraphs.push(text);
    });

    const infobox: Record<string, string> = {};
    let infoboxCount = 0;
    $('.infobox tr').each((_, tr) => {
        if (infoboxCount >= 15) return;
        const key = cleanText($(tr).find('th').first().text());
        const value = cleanText($(tr).find('td').first().text());
        if (key && value && key.length < 100) {
            infobox[key] = value;
            infoboxCount++;
        }
    });

    const thumbnail = $('.infobox img').first().attr('src');

    return res.json({
        status: true,
        result: {
            title: pageTitle,
            description,
            url: pageUrl,
            extract: introParagraphs.join('\n\n') || null,
            infobox,
            thumbnail: thumbnail ? (thumbnail.startsWith('//') ? `https:${thumbnail}` : thumbnail) : null
        }
    });
}
