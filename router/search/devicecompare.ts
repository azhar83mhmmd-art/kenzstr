import { Request, Response } from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';

async function request(url: string) {
    const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 20000 });
    return data as string;
}

function normalize(text = ''): string {
    return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function score(title: string, query: string): number {
    const t = normalize(title);
    const q = normalize(query);
    let s = 0;
    if (t === q) s += 100;
    if (t.includes(q)) s += 80;
    if (q.includes(t)) s += 60;
    const words = q.match(/[a-z]+|\d+/g) || [];
    for (const w of words) if (t.includes(w)) s += 10;
    return s;
}

async function getPhoneList() {
    const html = await request('https://carisinyal.com/compare/');
    const $ = cheerio.load(html);
    const list: { id: string; title: string }[] = [];

    $('select[name="hp_1"] option').each((_, el) => {
        const id = $(el).attr('value');
        const title = $(el).text().trim();
        if (id && title) list.push({ id, title });
    });

    return list;
}

function bestMatch(list: { id: string; title: string }[], query: string) {
    let best: { id: string; title: string } | null = null;
    let bestScore = -1;
    for (const item of list) {
        const s = score(item.title, query);
        if (s > bestScore) {
            bestScore = s;
            best = item;
        }
    }
    return best;
}

function extractCell($: cheerio.CheerioAPI, cell: any): string | null {
    const img = cell.find('img').first();
    if (img.length) return img.attr('src') || img.attr('data-src') || null;

    const items = cell.find('li');
    if (items.length) {
        return items
            .map((_: number, li: any) => $(li).text().replace(/\s+/g, ' ').trim())
            .get()
            .join('; ');
    }

    return cell.text().replace(/\s+/g, ' ').trim();
}

async function fetchCompare(id1: string, id2: string) {
    const html = await request(`https://carisinyal.com/compare/?hp_1=${id1}&hp_2=${id2}`);
    const $ = cheerio.load(html);

    const sections: { section: string; rows: any[] }[] = [];
    let current = { section: 'UMUM', rows: [] as any[] };

    $('.ct-text-block, .ct-new-columns').each((_, el) => {
        const node = $(el);

        if (node.hasClass('ct-text-block')) {
            if (node.closest('.ct-new-columns').length > 0) return;
            const title = node.text().trim();
            if (!title) return;
            if (current.rows.length) sections.push(current);
            current = { section: title, rows: [] };
            return;
        }

        const cells = node.children('.ct-div-block');
        if (cells.length < 3) return;

        const label = cells.eq(0).text().replace(/\s+/g, ' ').trim();
        const value1 = extractCell($, cells.eq(1));
        const value2 = extractCell($, cells.eq(2));

        if (!value1 && !value2) return;

        current.rows.push({ label: label || null, value1, value2 });
    });

    if (current.rows.length) sections.push(current);

    return sections;
}

export default async function devicecompareHandler(req: Request, res: Response) {
    const phone1Query = String(req.query.hp1 || req.query.a || '').trim();
    const phone2Query = String(req.query.hp2 || req.query.b || '').trim();

    if (!phone1Query || !phone2Query) {
        return res.status(400).json({
            status: false,
            message: "Parameter 'hp1' dan 'hp2' diperlukan (nama HP yang ingin dibandingkan)."
        });
    }

    const list = await getPhoneList();

    const phone1 = bestMatch(list, phone1Query);
    const phone2 = bestMatch(list, phone2Query);

    if (!phone1 || !phone2) {
        return res.status(404).json({ status: false, message: 'Salah satu atau kedua HP tidak ditemukan.' });
    }

    const sections = await fetchCompare(phone1.id, phone2.id);

    return res.json({
        status: true,
        phone1: { title: phone1.title },
        phone2: { title: phone2.title },
        sections
    });
}
