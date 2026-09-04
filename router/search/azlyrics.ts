import { Request, Response } from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';

const BASE = 'https://www.azlyrics.com';
const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36';

function cleanText(text = ''): string {
    return text
        .replace(/\r/g, '')
        .split('\n')
        .map((line) => line.trim().replace(/[ \t]{2,}/g, ' '))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function decodeHtml(html = ''): string {
    const $ = cheerio.load(`<div id="x">${html}</div>`);
    return $('#x').text();
}

function getGeoToken(js = ''): string | null {
    const match = js.match(/name["']\s*,\s*["']x["'][\s\S]*?value["']\s*,\s*["']([^"']+)/i);
    if (match) return match[1];

    const fallback = js.match(/setAttribute\(["']value["'],\s*["']([^"']+)["']\)/i);
    if (fallback) return fallback[1];

    return null;
}

function parseAutocomplete(text = ''): { title: string | null; artist: string | null } {
    const match = text.match(/^"(.+?)"\s*-\s*(.+)$/);
    return {
        title: match?.[1]?.trim() || null,
        artist: match?.[2]?.trim() || null
    };
}

function parseLyrics(html = ''): { title: string | null; artist: string | null; lyrics: string } {
    const titleMatch = html.match(/SongName\s*=\s*"([^"]+)"/);
    const artistMatch = html.match(/ArtistName\s*=\s*"([^"]+)"/);

    const lyricMatch = html.match(/<!--\s*Usage of azlyrics\.com content[\s\S]*?-->\s*([\s\S]*?)<\/div>/i);
    const rawLyrics = lyricMatch ? lyricMatch[1] : '';

    const normalizedLyrics = rawLyrics
        .replace(/\r?\n/g, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?[^>]+>/g, '');

    return {
        title: titleMatch?.[1] || null,
        artist: artistMatch?.[1] || null,
        lyrics: cleanText(decodeHtml(normalizedLyrics))
    };
}

function makeClient() {
    const jar = new CookieJar();
    return wrapper(
        axios.create({
            jar,
            withCredentials: true,
            timeout: 20000,
            decompress: true,
            validateStatus: () => true,
            headers: {
                'user-agent': UA,
                'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
            }
        })
    );
}

async function getToken(client: ReturnType<typeof makeClient>): Promise<string> {
    await client.get(BASE, {
        headers: { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' }
    });

    const geo = await client.get(`${BASE}/geo.js`, {
        headers: { accept: '*/*', referer: `${BASE}/` }
    });

    if (geo.status !== 200) throw new Error(`Gagal ambil geo.js: ${geo.status}`);

    const token = getGeoToken(String(geo.data));
    if (!token) throw new Error('Token tidak ditemukan dari geo.js');

    return token;
}

async function searchTop(client: ReturnType<typeof makeClient>, query: string) {
    const token = await getToken(client);
    const url = `${BASE}/suggest/?q=${encodeURIComponent(query)}&x=${encodeURIComponent(token)}`;

    const res = await client.get(url, {
        headers: {
            accept: 'application/json, text/javascript, */*; q=0.01',
            'x-requested-with': 'XMLHttpRequest',
            referer: `${BASE}/`
        }
    });

    if (res.status !== 200) throw new Error(`Search gagal: ${res.status}`);

    let json: any;
    try {
        json = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    } catch {
        throw new Error('Response search bukan JSON valid');
    }

    const top = json?.songs?.[0] || json?.lyrics?.[0];
    if (!top?.url) return null;

    return {
        url: String(top.url).replace(/\\\//g, '/'),
        ...parseAutocomplete(top.autocomplete)
    };
}

export default async function azlyricsHandler(req: Request, res: Response) {
    const query = String(req.query.q || req.query.query || '').trim();

    if (!query) {
        return res.status(400).json({ status: false, message: "Parameter 'q' diperlukan." });
    }

    const client = makeClient();

    const top = await searchTop(client, query);
    if (!top) {
        return res.status(404).json({ status: false, message: 'Lirik tidak ditemukan.' });
    }

    const page = await client.get(top.url, {
        headers: {
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            referer: `${BASE}/`
        }
    });

    if (page.status !== 200) {
        return res.status(502).json({ status: false, message: `Gagal ambil halaman lirik: ${page.status}` });
    }

    const parsed = parseLyrics(String(page.data));
    if (!parsed.lyrics) {
        return res.status(502).json({ status: false, message: 'Lirik tidak ditemukan atau struktur halaman berubah.' });
    }

    return res.json({
        status: true,
        title: parsed.title || top.title || '-',
        artist: parsed.artist || top.artist || '-',
        lyrics: parsed.lyrics
    });
}
