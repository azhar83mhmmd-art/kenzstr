import { Request, Response } from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';

async function request(url: string) {
    const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 20000 });
    return data as string;
}

async function search(keyword: string) {
    const html = await request(`https://carisinyal.com/?s=${encodeURIComponent(keyword)}`);
    const $ = cheerio.load(html);
    const result: { title: string; type: string; url: string | undefined }[] = [];

    $('.oxy-post').each((_, el) => {
        const title = $(el).find('.oxy-post-title').text().trim();
        if (!title) return;

        result.push({
            title,
            type: $(el).find('.oxy-post-meta').text().trim(),
            url: $(el).find('.oxy-post-title').attr('href')
        });
    });

    return result;
}

async function detail(url: string) {
    const html = await request(url);
    const $ = cheerio.load(html);
    const specs: Record<string, string> = {};

    $('table.box-info tr.box-baris').each((_, el) => {
        const key = $(el).find('td.kolom-satu').text().trim();
        const value = $(el).find('td.kolom-dua').text().trim();
        if (key && value) specs[key] = value;
    });

    const get = (...keys: string[]) => {
        for (const key of keys) if (specs[key]) return specs[key];
        return null;
    };

    return {
        title: $('h1').first().text().trim(),
        image: $('meta[property="og:image"]').attr('content') || null,
        description: $('meta[name="description"]').attr('content') || '',
        release: get('Rilis'),
        network: get('Jaringan'),
        display: {
            type: get('Jenis'),
            size: get('Ukuran'),
            resolution: get('Resolusi'),
            refreshRate: get('Refresh Rate')
        },
        performance: {
            chipset: get('Chipset'),
            cpu: get('CPU'),
            gpu: get('GPU'),
            ram: get('RAM'),
            storage: get('Memori Internal')
        },
        battery: {
            capacity: get('Kapasitas'),
            charging: get('Daya Pengisian')
        },
        camera: {
            total: get('Jumlah Kamera'),
            configuration: get('Konfigurasi'),
            video: get('Resolusi Video')
        },
        body: {
            dimensions: get('Dimensi'),
            weight: get('Berat'),
            colors: get('Warna')
        }
    };
}

export default async function phonespecsHandler(req: Request, res: Response) {
    const query = String(req.query.q || req.query.query || '').trim();

    if (!query) {
        return res.status(400).json({ status: false, message: "Parameter 'q' diperlukan." });
    }

    const results = await search(query);
    const phone = results.find((r) => (r.type || '').toLowerCase().includes('ponsel')) || results[0];

    if (!phone || !phone.url) {
        return res.status(404).json({ status: false, message: 'Ponsel tidak ditemukan.' });
    }

    const data = await detail(phone.url);

    return res.json({ status: true, ...data });
}
