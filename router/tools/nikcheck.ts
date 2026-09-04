import { Request, Response } from 'express';
import axios from 'axios';

/*
 * NIK Checker
 *
 * Menerjemahkan struktur NIK (Nomor Induk Kependudukan) Indonesia:
 * kode wilayah (provinsi/kab-kota/kecamatan) + tanggal lahir + nomor urut.
 * Struktur ini bersifat publik (diatur lewat Permendagri 72/2019), jadi
 * endpoint ini murni parsing angka — tidak mengambil/menyimpan data
 * pribadi siapa pun. Nama wilayah diambil live dari API wilayah publik
 * (wilayah.id) memakai kode Kemendagri yang sama dengan kode di NIK,
 * jadi tidak perlu dataset wilayah lokal yang ikut di-deploy.
 */

const WILAYAH_BASE = 'https://wilayah.id/api';

interface WilayahItem {
    code: string;
    name: string;
}

const extractList = (data: any): WilayahItem[] => {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.data)) return data.data;
    return [];
};

const findByCode = (list: WilayahItem[], code: string) =>
    list.find((item) => item.code === code)?.name;

async function getRegionNames(idProv: string, idKabKota: string, idKec: string) {
    const provCode = idProv;
    const kabCode = `${idProv}.${idKabKota.slice(2)}`;
    const kecCode = `${kabCode}.${idKec.slice(4)}`;

    const result = {
        provinsi: 'Tidak diketahui',
        kabupatenKota: 'Tidak diketahui',
        kecamatan: 'Tidak diketahui'
    };

    try {
        const { data } = await axios.get(`${WILAYAH_BASE}/provinces.json`, { timeout: 8000 });
        result.provinsi = findByCode(extractList(data), provCode) || result.provinsi;
    } catch {
        // API wilayah tidak terjangkau — biarkan fallback "Tidak diketahui"
    }

    try {
        const { data } = await axios.get(`${WILAYAH_BASE}/regencies/${provCode}.json`, { timeout: 8000 });
        result.kabupatenKota = findByCode(extractList(data), kabCode) || result.kabupatenKota;
    } catch {}

    try {
        const { data } = await axios.get(`${WILAYAH_BASE}/districts/${kabCode}.json`, { timeout: 8000 });
        result.kecamatan = findByCode(extractList(data), kecCode) || result.kecamatan;
    } catch {}

    return result;
}

export default async function nikCheckHandler(req: Request, res: Response) {
    const nik = String(req.query.nik || req.body?.nik || '').trim();

    if (!/^\d{16}$/.test(nik)) {
        return res.status(400).json({
            status: false,
            message: "Parameter 'nik' harus terdiri dari 16 digit angka."
        });
    }

    const idProv = nik.substring(0, 2);
    const idKabKota = nik.substring(0, 4);
    const idKec = nik.substring(0, 6);

    let rawDay = parseInt(nik.substring(6, 8), 10);
    const month = parseInt(nik.substring(8, 10), 10);
    const rawYear = parseInt(nik.substring(10, 12), 10);
    const nomorUrut = nik.substring(12, 16);

    let jenisKelamin = 'LAKI-LAKI';
    if (rawDay > 40) {
        jenisKelamin = 'PEREMPUAN';
        rawDay -= 40;
    }

    if (month < 1 || month > 12 || rawDay < 1 || rawDay > 31) {
        return res.status(400).json({
            status: false,
            message: 'NIK tidak valid (segmen tanggal lahir tidak masuk akal).'
        });
    }

    const currentYY = parseInt(String(new Date().getFullYear()).slice(-2), 10);
    const tahunLahir = rawYear > currentYY ? 1900 + rawYear : 2000 + rawYear;

    const pad = (n: number) => String(n).padStart(2, '0');
    const tanggalLahir = `${pad(rawDay)}/${pad(month)}/${tahunLahir}`;

    const lahir = new Date(tahunLahir, month - 1, rawDay);
    const now = new Date();
    let usia = now.getFullYear() - lahir.getFullYear();
    const belumUlangTahun =
        now.getMonth() < lahir.getMonth() ||
        (now.getMonth() === lahir.getMonth() && now.getDate() < lahir.getDate());
    if (belumUlangTahun) usia -= 1;

    const wilayah = await getRegionNames(idProv, idKabKota, idKec);

    return res.json({
        status: true,
        result: {
            nik,
            ...wilayah,
            jenisKelamin,
            tanggalLahir,
            usia: usia >= 0 ? usia : null,
            nomorUrut
        }
    });
}
