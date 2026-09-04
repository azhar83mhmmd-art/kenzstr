/*
 * Entry point untuk Vercel Serverless Functions.
 *
 * Kenapa lewat sini, bukan langsung index.ts?
 * Beberapa bagian project (autoload.ts) me-require file router secara
 * dinamis berdasarkan path yang dihitung saat runtime (bukan `import`
 * statis). Bundler Vercel (@vercel/node / nft) tidak bisa melacak
 * require dinamis semacam itu, dan runtime Node di Vercel juga tidak
 * bisa langsung require file .ts tanpa ts-node. Karena itu Vercel
 * HARUS menjalankan hasil build (dist/**, JS biasa) — bukan source TS
 * mentah — supaya semua router ikut ter-bundle dan bisa di-require
 * saat runtime. Lihat vercel.json ("buildCommand" + "includeFiles").
 *
 * File ini TIDAK memanggil app.listen() — index.ts hanya listen kalau
 * dijalankan sebagai entry point langsung (lihat require.main check di
 * index.ts). Express app di-export apa adanya; @vercel/node bisa
 * memanggil Express app langsung sebagai request handler (req, res).
 */
/*
 * PENTING (bug FUNCTION_INVOCATION_FAILED di SEMUA route, termasuk "/"
 * dan "/favicon.ico"): sebelum ini, require('../dist/index.js') tidak
 * dibungkus apa pun. Kalau ADA saja satu modul yang throw saat di-load
 * (mis. dependency native/binary yang gagal ter-bundle dengan benar ke
 * Vercel Function, atau env var yang membuat sebuah client library
 * throw secara synchronous saat inisialisasi), exception itu terjadi
 * SEBELUM Express app sempat dibuat — sehingga @vercel/node tidak
 * punya request handler valid sama sekali dan Vercel menampilkan
 * halaman crash generik "500: INTERNAL_SERVER_ERROR /
 * FUNCTION_INVOCATION_FAILED" tanpa detail apa pun ke semua request,
 * dan detail errornya cuma bisa dilihat lewat Vercel Function Logs.
 *
 * Sekarang require() dibungkus try/catch. Kalau gagal, module ini tetap
 * meng-export sebuah Express-compatible handler (bukan crash saat
 * di-load), yang membalas 500 dengan pesan error ASLI-nya supaya bisa
 * langsung ketahuan penyebabnya dari response, tanpa harus bongkar
 * Vercel dashboard dulu.
 */
let app;
let bootError = null;

try {
    app = require('../dist/index.js').default;

    if (typeof app !== 'function') {
        throw new Error(
            "dist/index.js berhasil di-require tapi tidak meng-export Express app yang valid " +
            "(export default kosong/bukan function). Cek apakah 'npm run build' benar-benar " +
            "menghasilkan dist/index.js terbaru sebelum deploy."
        );
    }
} catch (error) {
    bootError = error;
    console.error('[✗] FATAL: gagal memuat dist/index.js saat cold start:', error && error.stack || error);
}

module.exports = bootError
    ? (req, res) => {
        res.status(500).json({
            status: false,
            message: 'Server gagal start (cold start crash) — bukan error per-request.',
            error: {
                name: bootError.name,
                message: bootError.message
            },
            hint: 'Detail lengkap (stack trace) ada di Vercel Function Logs untuk deployment ini.'
        });
    }
    : app;
