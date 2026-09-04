import { Request, Response } from 'express';
import { getCanvasLib } from '../../src/canvasSafe';
import type { SKRSContext2D } from '@napi-rs/canvas';
import { ensureRemoteFont, sendPng } from './_canvas';

/*
 * Kalender Indonesia 2026 — generate gambar kalender 1 bulan atau 12
 * bulan lengkap, berisi hari libur nasional/keagamaan/budaya/cuti
 * bersama. Diadaptasi dari referensi kalender.js.
 */

const TAHUN = 2026;

const NAMA_BULAN = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];
const NAMA_HARI = ['SEN', 'SEL', 'RAB', 'KAM', 'JUM', 'SAB', 'MIN'];

const LIBUR: Record<string, { nama: string; tipe: 'nasional' | 'keagamaan' | 'budaya' | 'cuti' }> = {
    '1-1': { nama: 'Tahun Baru Masehi', tipe: 'nasional' },
    '1-16': { nama: "Isra Mi'raj Nabi Muhammad SAW", tipe: 'keagamaan' },
    '2-16': { nama: 'Cuti Bersama Imlek', tipe: 'cuti' },
    '2-17': { nama: 'Tahun Baru Imlek 2577 Kongzili', tipe: 'budaya' },
    '3-18': { nama: 'Cuti Bersama Nyepi', tipe: 'cuti' },
    '3-19': { nama: 'Hari Raya Nyepi (Tahun Baru Saka 1948)', tipe: 'keagamaan' },
    '3-20': { nama: 'Cuti Bersama Idul Fitri', tipe: 'cuti' },
    '3-21': { nama: 'Hari Raya Idul Fitri 1447 H', tipe: 'keagamaan' },
    '3-22': { nama: 'Hari Raya Idul Fitri 1447 H', tipe: 'keagamaan' },
    '3-23': { nama: 'Cuti Bersama Idul Fitri', tipe: 'cuti' },
    '3-24': { nama: 'Cuti Bersama Idul Fitri', tipe: 'cuti' },
    '4-3': { nama: 'Wafat Yesus Kristus (Jumat Agung)', tipe: 'keagamaan' },
    '4-5': { nama: 'Kebangkitan Yesus Kristus (Paskah)', tipe: 'keagamaan' },
    '5-1': { nama: 'Hari Buruh Internasional', tipe: 'nasional' },
    '5-14': { nama: 'Kenaikan Yesus Kristus', tipe: 'keagamaan' },
    '5-15': { nama: 'Cuti Bersama Kenaikan Yesus Kristus', tipe: 'cuti' },
    '5-27': { nama: 'Hari Raya Idul Adha 1447 H', tipe: 'keagamaan' },
    '5-28': { nama: 'Cuti Bersama Idul Adha', tipe: 'cuti' },
    '5-31': { nama: 'Hari Raya Waisak 2570 BE', tipe: 'keagamaan' },
    '6-1': { nama: 'Hari Lahir Pancasila', tipe: 'nasional' },
    '6-16': { nama: 'Tahun Baru Islam 1448 H', tipe: 'keagamaan' },
    '8-17': { nama: 'Hari Kemerdekaan Republik Indonesia', tipe: 'nasional' },
    '8-25': { nama: 'Maulid Nabi Muhammad SAW', tipe: 'keagamaan' },
    '12-24': { nama: 'Cuti Bersama Natal', tipe: 'cuti' },
    '12-25': { nama: 'Hari Raya Natal', tipe: 'keagamaan' }
};

const WARNA = {
    merah: '#A6192E',
    merahTua: '#7A0F20',
    krem: '#FBF6EC',
    kremKartu: '#FFFDF9',
    tinta: '#221A17',
    emas: '#B7862C',
    emasLembut: '#EFDFB8',
    batik: '#C89B4A',
    garis: '#E7DCC6',
    abu: '#8A8078',
    minggu: '#B5473E',
    tipe: { nasional: '#A6192E', keagamaan: '#B7862C', budaya: '#5B7A6B', cuti: '#2E6E7E' },
    tipeTeks: { nasional: '#FFFFFF', keagamaan: '#3A2A05', budaya: '#FFFFFF', cuti: '#FFFFFF' }
};

const FONTS = [
    { file: 'Inter-Regular.woff2', family: 'KalInter', url: 'https://raw.githubusercontent.com/rsms/inter/master/docs/font-files/Inter-Regular.woff2' },
    { file: 'Inter-SemiBold.woff2', family: 'KalInterSemiBold', url: 'https://raw.githubusercontent.com/rsms/inter/master/docs/font-files/Inter-SemiBold.woff2' },
    { file: 'Inter-Bold.woff2', family: 'KalInterBold', url: 'https://raw.githubusercontent.com/rsms/inter/master/docs/font-files/Inter-Bold.woff2' },
    { file: 'Inter-ExtraBold.woff2', family: 'KalInterExtraBold', url: 'https://raw.githubusercontent.com/rsms/inter/master/docs/font-files/Inter-ExtraBold.woff2' },
    { file: 'Manrope-Bold.ttf', family: 'KalManropeBold', url: 'https://cdn.jsdelivr.net/npm/@expo-google-fonts/manrope@0.4.0/700Bold/Manrope_700Bold.ttf' },
    { file: 'Manrope-ExtraBold.ttf', family: 'KalManropeExtraBold', url: 'https://cdn.jsdelivr.net/npm/@expo-google-fonts/manrope@0.4.0/800ExtraBold/Manrope_800ExtraBold.ttf' }
];

/*
 * Kalau salah satu font gagal diunduh (mis. host asset lagi down),
 * fallback ke font sans-serif bawaan supaya endpoint tetap bisa
 * menghasilkan gambar, bukan error total.
 */
const FALLBACK: Record<string, string> = {
    KalInter: 'sans-serif',
    KalInterSemiBold: 'sans-serif',
    KalInterBold: 'sans-serif',
    KalInterExtraBold: 'sans-serif',
    KalManropeBold: 'sans-serif',
    KalManropeExtraBold: 'sans-serif'
};

let fontsReady = false;
async function ensureFonts() {
    if (fontsReady) return;
    for (const f of FONTS) {
        try {
            await ensureRemoteFont(f.url, f.family, f.file);
            FALLBACK[f.family] = f.family;
        } catch {
            // biarkan fallback ke sans-serif
        }
    }
    fontsReady = true;
}
const F = (family: string) => FALLBACK[family] || 'sans-serif';

function jumlahHariDiBulan(bulanNum: number) {
    return new Date(TAHUN, bulanNum, 0).getDate();
}
function offsetHariPertama(bulanNum: number) {
    const pertama = new Date(TAHUN, bulanNum - 1, 1);
    return (pertama.getDay() + 6) % 7;
}
function liburDiBulan(bulanNum: number) {
    return Object.keys(LIBUR)
        .filter((k) => parseInt(k.split('-')[0], 10) === bulanNum)
        .map((k) => ({ tgl: parseInt(k.split('-')[1], 10), ...LIBUR[k] }))
        .sort((a, b) => a.tgl - b.tgl);
}

function roundRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function gambarMotifBatik(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, opacity: number) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = WARNA.batik;
    ctx.lineWidth = 2;
    const langkah = 34;
    for (let d = -h; d < w + h; d += langkah) {
        ctx.beginPath(); ctx.moveTo(x + d, y); ctx.lineTo(x + d + h, y + h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + d, y + h); ctx.lineTo(x + d + h, y); ctx.stroke();
    }
    ctx.fillStyle = WARNA.batik;
    for (let yy = y + 17; yy < y + h; yy += 34) {
        for (let xx = x + 17; xx < x + w; xx += 34) {
            ctx.beginPath(); ctx.arc(xx, yy, 3, 0, Math.PI * 2); ctx.fill();
        }
    }
    ctx.restore();
}

function gambarHeader(
    ctx: SKRSContext2D, x: number, y: number, w: number,
    opts: { tinggi: number; judul: string; subjudulBaris?: string[]; statistik?: { angka: string; label: string }[] }
) {
    const tinggi = opts.tinggi;
    const grad = ctx.createLinearGradient(0, y, 0, y + tinggi);
    grad.addColorStop(0, WARNA.merahTua);
    grad.addColorStop(0.7, WARNA.merah);
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, tinggi);

    gambarMotifBatik(ctx, x, y, w, tinggi, 0.16);

    const tengah = x + w / 2;

    ctx.save();
    const eyebrow = "TAHUN 1948 SAKA  \u00b7  1447\u20131448 HIJRIAH";
    ctx.fillStyle = '#EFDFB8';
    ctx.textAlign = 'left';
    ctx.font = `13px ${F('KalInterBold')}`;
    const spasiEyebrow = eyebrow.split('').join(' ');
    const lebarEyebrow = ctx.measureText(spasiEyebrow).width;
    ctx.fillText(spasiEyebrow, tengah - lebarEyebrow / 2, y + 56);
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#FBF6EC';
    ctx.font = `64px ${F('KalManropeExtraBold')}`;
    ctx.fillText(opts.judul, tengah, y + 128);

    if (opts.subjudulBaris && opts.subjudulBaris.length) {
        ctx.fillStyle = '#F3D9D4';
        ctx.font = `17px ${F('KalInterBold')}`;
        let sy = y + 168;
        opts.subjudulBaris.forEach((baris) => { ctx.fillText(baris, tengah, sy); sy += 26; });
    }

    if (opts.statistik) {
        const gapAntarStat = 130;
        const totalLebar = (opts.statistik.length - 1) * gapAntarStat;
        let sx = tengah - totalLebar / 2;
        opts.statistik.forEach((s) => {
            ctx.fillStyle = '#FFFFFF';
            ctx.font = `32px ${F('KalManropeExtraBold')}`;
            ctx.fillText(s.angka, sx, y + tinggi - 62);
            ctx.fillStyle = '#F3D9D4';
            ctx.font = `11px ${F('KalInterBold')}`;
            ctx.fillText(s.label.toUpperCase(), sx, y + tinggi - 40);
            sx += gapAntarStat;
        });
    }
}

function gambarLegenda(ctx: SKRSContext2D, x: number, y: number, w: number, h: number) {
    roundRect(ctx, x, y, w, h, 16);
    ctx.fillStyle = WARNA.kremKartu;
    ctx.fill();
    ctx.strokeStyle = WARNA.garis;
    ctx.lineWidth = 1;
    ctx.stroke();

    const item = [
        { label: 'Hari Nasional', warna: WARNA.tipe.nasional },
        { label: 'Hari Besar Keagamaan', warna: WARNA.tipe.keagamaan },
        { label: 'Hari Budaya', warna: WARNA.tipe.budaya },
        { label: 'Cuti Bersama', warna: WARNA.tipe.cuti }
    ];

    ctx.font = `15px ${F('KalInterSemiBold')}`;
    ctx.textBaseline = 'middle';
    const lebarTiap = item.map((it) => 14 + 10 + ctx.measureText(it.label).width);
    const gap = 40;
    const totalLebar = lebarTiap.reduce((a, b) => a + b, 0) + gap * (item.length - 1);
    let cx = x + (w - totalLebar) / 2;
    const cy = y + h / 2;

    item.forEach((it, i) => {
        ctx.beginPath();
        ctx.arc(cx + 7, cy, 7, 0, Math.PI * 2);
        ctx.fillStyle = it.warna;
        ctx.fill();
        ctx.fillStyle = WARNA.tinta;
        ctx.textAlign = 'left';
        ctx.fillText(it.label, cx + 24, cy + 1);
        cx += lebarTiap[i] + gap;
    });
    ctx.textBaseline = 'alphabetic';
}

function hitungTinggiKartuBulan(bulanNum: number, w: number, skala: number) {
    const s = skala || 1;
    const tinggiHead = 58 * s;
    const headerHariY = tinggiHead + 20 * s;
    const offset = offsetHariPertama(bulanNum);
    const totalHari = jumlahHariDiBulan(bulanNum);
    const baris = Math.ceil((offset + totalHari) / 7);
    const tinggiSel = 34 * s;
    const grafikMulaiY = headerHariY + 16 * s;
    const yTabelSelesai = grafikMulaiY + tinggiSel * baris + 8 * s;

    const libur = liburDiBulan(bulanNum);
    const tinggiBarisDaftar = 19 * s;
    const tinggiDaftar = libur.length === 0 ? 12 * s : libur.length * tinggiBarisDaftar;

    const yDaftarMulai = yTabelSelesai + 22 * s;
    const yAkhir = yDaftarMulai + tinggiDaftar;

    return yAkhir + 16 * s;
}

function gambarKartuBulan(
    ctx: SKRSContext2D, x: number, y: number, w: number, tinggiKartu: number,
    bulanNum: number, namaBulan: string, skala: number
) {
    const s = skala || 1;
    const h = tinggiKartu;

    roundRect(ctx, x, y, w, h, 18 * s);
    ctx.fillStyle = WARNA.kremKartu;
    ctx.fill();
    ctx.strokeStyle = WARNA.garis;
    ctx.lineWidth = 1;
    ctx.stroke();

    const tinggiHead = 58 * s;
    ctx.save();
    roundRect(ctx, x, y, w, h, 18 * s);
    ctx.clip();
    ctx.fillStyle = WARNA.emasLembut;
    ctx.fillRect(x, y, w, tinggiHead);
    ctx.restore();

    const libur = liburDiBulan(bulanNum);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = WARNA.merahTua;
    ctx.font = `${22 * s}px ${F('KalManropeBold')}`;
    ctx.fillText(namaBulan, x + 18 * s, y + 36 * s);

    const labelJumlah = `${libur.length} libur`;
    ctx.font = `${11 * s}px ${F('KalInterBold')}`;
    const lebarLabel = ctx.measureText(labelJumlah).width;
    const padPill = 10 * s;
    const pillW = lebarLabel + padPill * 2;
    const pillH = 22 * s;
    const pillX = x + w - pillW - 16 * s;
    const pillY = y + 18 * s;
    roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.fillStyle = WARNA.emas;
    ctx.textAlign = 'center';
    ctx.fillText(labelJumlah, pillX + pillW / 2, pillY + pillH / 2 + 4 * s);

    const kolLebar = w / 7;
    const headerHariY = y + tinggiHead + 20 * s;
    ctx.font = `${11 * s}px ${F('KalInterBold')}`;
    ctx.fillStyle = WARNA.abu;
    ctx.textAlign = 'center';
    NAMA_HARI.forEach((h2, i) => ctx.fillText(h2, x + kolLebar * i + kolLebar / 2, headerHariY));

    const offset = offsetHariPertama(bulanNum);
    const totalHari = jumlahHariDiBulan(bulanNum);
    const baris = Math.ceil((offset + totalHari) / 7);
    const tinggiSel = 34 * s;
    const grafikMulaiY = headerHariY + 16 * s;

    const liburMap: Record<number, { nama: string; tipe: 'nasional' | 'keagamaan' | 'budaya' | 'cuti' }> = {};
    libur.forEach((l) => { liburMap[l.tgl] = l; });

    for (let i = 0; i < totalHari; i++) {
        const tgl = i + 1;
        const posisi = offset + i;
        const barisI = Math.floor(posisi / 7);
        const kolom = posisi % 7;
        const cx = x + kolLebar * kolom + kolLebar / 2;
        const cy = grafikMulaiY + tinggiSel * barisI + tinggiSel / 2;

        const info = liburMap[tgl];
        if (info) {
            ctx.beginPath();
            ctx.arc(cx, cy, 13 * s, 0, Math.PI * 2);
            ctx.fillStyle = WARNA.tipe[info.tipe];
            ctx.fill();
            ctx.fillStyle = WARNA.tipeTeks[info.tipe];
            ctx.font = `${13 * s}px ${F('KalInterBold')}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(tgl), cx, cy + 1);
            ctx.textBaseline = 'alphabetic';
        } else {
            const dow = kolom;
            ctx.fillStyle = dow === 6 ? WARNA.minggu : WARNA.tinta;
            ctx.font = `${13 * s}px ${F('KalInter')}`;
            ctx.textAlign = 'center';
            ctx.fillText(String(tgl), cx, cy + 4 * s);
        }
    }

    const yTabelSelesai = grafikMulaiY + tinggiSel * baris + 8 * s;
    ctx.strokeStyle = WARNA.garis;
    ctx.setLineDash([4 * s, 3 * s]);
    ctx.beginPath();
    ctx.moveTo(x + 18 * s, yTabelSelesai);
    ctx.lineTo(x + w - 18 * s, yTabelSelesai);
    ctx.stroke();
    ctx.setLineDash([]);

    let yDaftar = yTabelSelesai + 22 * s;
    ctx.textAlign = 'left';
    if (libur.length === 0) {
        ctx.fillStyle = WARNA.abu;
        ctx.font = `italic ${12 * s}px ${F('KalInter')}`;
        ctx.fillText('Tidak ada tanggal merah bulan ini.', x + 18 * s, yDaftar);
    } else {
        libur.forEach((l) => {
            ctx.fillStyle = WARNA.merahTua;
            ctx.font = `${12 * s}px ${F('KalInterExtraBold')}`;
            ctx.fillText(String(l.tgl), x + 18 * s, yDaftar);
            ctx.fillStyle = '#4B4137';
            ctx.font = `${12 * s}px ${F('KalInter')}`;
            ctx.fillText(l.nama, x + 44 * s, yDaftar);
            yDaftar += 19 * s;
        });
    }
}

function renderTahun() {
    const lebarKartu = 700;
    const gap = 34;
    const kolom = 3;
    const margin = 40;
    const lebarKanvas = margin * 2 + lebarKartu * kolom + gap * (kolom - 1);
    const skalaKartu = 1.6;

    const tinggiHeader = 360;
    const tinggiLegenda = 74;
    const jumlahBaris = Math.ceil(12 / kolom);

    const tinggiTiapKartu: number[] = [];
    for (let b = 1; b <= 12; b++) tinggiTiapKartu.push(hitungTinggiKartuBulan(b, lebarKartu, skalaKartu));

    const tinggiTiapBaris: number[] = [];
    for (let brs = 0; brs < jumlahBaris; brs++) {
        const potongan = tinggiTiapKartu.slice(brs * kolom, brs * kolom + kolom);
        tinggiTiapBaris.push(Math.max(...potongan));
    }

    const totalTinggiKartu = tinggiTiapBaris.reduce((a, b) => a + b, 0) + gap * (jumlahBaris - 1);
    const tinggiKanvas = tinggiHeader + 24 + tinggiLegenda + 40 + totalTinggiKartu + 60;

    const canvas = getCanvasLib().createCanvas(lebarKanvas, tinggiKanvas);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = WARNA.krem;
    ctx.fillRect(0, 0, lebarKanvas, tinggiKanvas);

    gambarHeader(ctx, 0, 0, lebarKanvas, {
        tinggi: tinggiHeader,
        judul: `Kalender Indonesia ${TAHUN}`,
        subjudulBaris: [
            'Dua belas bulan lengkap dengan hari libur nasional, hari besar',
            'keagamaan, perayaan budaya, dan cuti bersama.'
        ],
        statistik: [
            { angka: '17', label: 'Libur Nasional' },
            { angka: '8', label: 'Cuti Bersama' },
            { angka: '25', label: 'Total Tanggal Merah' }
        ]
    });

    const legendaY = tinggiHeader - 26;
    gambarLegenda(ctx, margin, legendaY, lebarKanvas - margin * 2, tinggiLegenda);

    const mulaiY = legendaY + tinggiLegenda + 40;
    let yBaris = mulaiY;

    for (let brs = 0; brs < jumlahBaris; brs++) {
        for (let kol = 0; kol < kolom; kol++) {
            const b = brs * kolom + kol;
            if (b >= 12) continue;
            const x = margin + kol * (lebarKartu + gap);
            gambarKartuBulan(ctx, x, yBaris, lebarKartu, tinggiTiapKartu[b], b + 1, NAMA_BULAN[b], skalaKartu);
        }
        yBaris += tinggiTiapBaris[brs] + gap;
    }

    return canvas;
}

function renderBulan(bulanNum: number) {
    const margin = 40;
    const lebarKartu = 760;
    const lebarKanvas = margin * 2 + lebarKartu;
    const skalaKartu = 2.1;

    const tinggiHeader = 300;
    const tinggiLegenda = 74;
    const tinggiKartu = hitungTinggiKartuBulan(bulanNum, lebarKartu, skalaKartu);

    const tinggiKanvas = tinggiHeader + 24 + tinggiLegenda + 40 + tinggiKartu + 50;
    const canvas = getCanvasLib().createCanvas(lebarKanvas, tinggiKanvas);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = WARNA.krem;
    ctx.fillRect(0, 0, lebarKanvas, canvas.height);

    const namaBulan = NAMA_BULAN[bulanNum - 1];
    const libur = liburDiBulan(bulanNum);

    gambarHeader(ctx, 0, 0, lebarKanvas, {
        tinggi: tinggiHeader,
        judul: `${namaBulan} ${TAHUN}`,
        subjudulBaris: [
            'Kalender Indonesia dengan hari libur nasional, hari besar',
            'keagamaan, perayaan budaya, dan cuti bersama.'
        ],
        statistik: [{ angka: String(libur.length), label: 'Tanggal Merah Bulan Ini' }]
    });

    const legendaY = tinggiHeader - 26;
    gambarLegenda(ctx, margin, legendaY, lebarKanvas - margin * 2, tinggiLegenda);

    const kartuY = legendaY + tinggiLegenda + 40;
    gambarKartuBulan(ctx, margin, kartuY, lebarKartu, tinggiKartu, bulanNum, namaBulan, skalaKartu);

    return canvas;
}

const NAMA_KE_NOMOR: Record<string, number> = {
    januari: 1, februari: 2, maret: 3, april: 4, mei: 5, juni: 6,
    juli: 7, agustus: 8, september: 9, oktober: 10, november: 11, desember: 12
};

export default async function kalenderHandler(req: Request, res: Response) {
    const mode = String(req.query.mode ?? req.body?.mode ?? 'bulan').trim().toLowerCase();
    const bulanInput = String(req.query.bulan ?? req.body?.bulan ?? '').trim().toLowerCase();

    if (mode !== 'tahun' && mode !== 'bulan') {
        return res.status(400).json({ status: false, message: "Parameter 'mode' harus 'bulan' atau 'tahun'." });
    }

    let nomorBulan: number | undefined;
    if (mode === 'bulan') {
        nomorBulan = NAMA_KE_NOMOR[bulanInput];
        if (!nomorBulan) {
            return res.status(400).json({
                status: false,
                message:
                    "Parameter 'bulan' wajib diisi salah satu dari: januari, februari, maret, april, mei, juni, juli, agustus, september, oktober, november, desember."
            });
        }
    }

    try {
        await ensureFonts();
        const canvas = mode === 'tahun' ? renderTahun() : renderBulan(nomorBulan as number);
        return sendPng(res, canvas);
    } catch (error: any) {
        return res.status(500).json({
            status: false,
            message: error?.message || 'Gagal membuat gambar kalender.'
        });
    }
}
