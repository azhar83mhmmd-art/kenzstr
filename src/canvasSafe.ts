/*
 * Kairoo API | sylvatica.my.id
 * © Dandy
 *
 * WRAPPER LAZY-LOAD UNTUK @napi-rs/canvas — INTI PERBAIKAN BUG
 * FUNCTION_INVOCATION_FAILED DI SEMUA ROUTE VERCEL.
 *
 * Sebelum ini, 17 file di router/maker/*.ts + router/maker/_canvas.ts
 * melakukan `import { createCanvas, ... } from '@napi-rs/canvas'` di
 * BARIS PALING ATAS file. Karena semua file itu di-import STATIS oleh
 * src/registry.ts (yang di-import oleh index.ts sejak awal, sebelum
 * app Express bahkan selesai dibuat), '@napi-rs/canvas' otomatis
 * ikut di-require SAAT COLD START — bukan saat endpoint maker/canvas
 * benar-benar dipanggil.
 *
 * '@napi-rs/canvas' adalah native addon (Rust/N-API): package utamanya
 * memilih & me-require satu dari 10+ package platform-specific
 * (mis. @napi-rs/canvas-linux-x64-gnu) berdasarkan process.platform /
 * process.arch / glibc-vs-musl saat runtime. Kalau paket platform yang
 * cocok TIDAK ikut ter-bundle dengan benar ke Vercel Function
 * (skenario umum untuk native module di lingkungan serverless — bisa
 * karena tracing bundler meleset, mismatch versi Node runtime Vercel,
 * dsb), require() itu THROW. Karena terjadi di cold start lewat rantai
 * import statis, SATU kegagalan ini mematikan SELURUH aplikasi untuk
 * SEMUA route (termasuk "/" dan "/favicon.ico") — persis gejala di
 * screenshot: FUNCTION_INVOCATION_FAILED tanpa outgoing request sama
 * sekali, gagal dalam hitungan milidetik sebelum request diproses.
 *
 * Solusi: jangan pernah require('@napi-rs/canvas') di top-level module
 * mana pun. Modul ini menunda require() sampai getCanvasLib() dipanggil
 * DARI DALAM HANDLER (saat endpoint canvas benar-benar diakses), dan
 * membungkusnya try/catch. Kalau native binding gagal load, HANYA
 * endpoint canvas yang bersangkutan yang mengembalikan 503 dengan
 * pesan jelas — 44 endpoint lain (termasuk semua endpoint non-canvas,
 * halaman statis, /config, /docs, dst) tetap berjalan normal.
 */

type CanvasLib = typeof import('@napi-rs/canvas');

let cached: CanvasLib | null = null;
let cachedError: Error | null = null;

export function getCanvasLib(): CanvasLib {
    if (cached) return cached;

    if (cachedError) {
        throw cachedError;
    }

    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        cached = require('@napi-rs/canvas') as CanvasLib;
        return cached;
    } catch (error) {
        cachedError =
            error instanceof Error
                ? error
                : new Error(`Gagal memuat @napi-rs/canvas: ${String(error)}`);

        console.error(
            '[✗] @napi-rs/canvas gagal di-load di environment ini (native binding tidak tersedia). ' +
            'Endpoint berbasis canvas akan mengembalikan 503, endpoint lain tetap normal:',
            cachedError.message
        );

        throw cachedError;
    }
}

/*
 * Helper untuk dipakai di setiap handler maker/*.ts: bungkus body
 * handler dengan ini supaya kegagalan load canvas otomatis jadi 503
 * yang rapi, bukan 500 generik / unhandled rejection.
 */
export async function withCanvas<T>(
    res: { status: (code: number) => { json: (body: any) => any } },
    fn: (lib: CanvasLib) => Promise<T>
): Promise<T | void> {
    let lib: CanvasLib;

    try {
        lib = getCanvasLib();
    } catch (error) {
        res.status(503).json({
            status: false,
            message:
                'Fitur canvas/image-generation sedang tidak tersedia di server ini ' +
                '(native module gagal dimuat). Endpoint lain tetap berfungsi normal.'
        });
        return;
    }

    return fn(lib);
}
