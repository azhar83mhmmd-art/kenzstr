/*
 * Kairoo API | sylvatica.my.id
 * © Dandy
 */
import 'dotenv/config';
import express, {
    Request,
    Response,
    NextFunction
} from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import os from 'os';
import axios from 'axios';

/*
 * Batasi default axios secara global agar respons dari sumber eksternal
 * yang tidak terduga besar (mis. halaman HTML/JSON raksasa) tidak
 * ditahan penuh di memori proses sampai membuat server kehabisan RAM.
 * Setiap handler search/download tetap bisa override per-request kalau
 * memang butuh (mis. timeout lebih panjang), ini hanya nilai default.
 */
axios.defaults.timeout = 25000;
axios.defaults.maxContentLength = 25 * 1024 * 1024; // 25MB
axios.defaults.maxBodyLength = 25 * 1024 * 1024; // 25MB
import { rateLimit } from './src/middleware/rateLimit';
import { errorHandler } from './src/middleware/errorHandler';
import {
    loadRouter,
    initAutoLoad,
    buildConfig
} from './src/autoload';
import { monitorTracking } from './src/supabase/tracking';
import {
    monitorStatsHandler,
    monitorEndpointsHandler,
    monitorRecentHandler,
    monitorResourcesHandler,
    monitorDebugHandler
} from './src/routes/monitor';
import { statusHealthHandler } from './src/routes/health';
import { submitFeedbackHandler } from './src/routes/feedback';

const app = express();
/*
 * PORT hanya relevan untuk menjalankan server lokal (Termux/VPS) lewat
 * app.listen(). Vercel Serverless Functions TIDAK menyediakan/menggunakan
 * PORT sama sekali — proses tidak boleh crash hanya karena variable ini
 * tidak ada. Default 3000 dipakai untuk kebutuhan lokal saja.
 */
const port = Number(process.env.PORT) || 3000;
const recentRequests: string[] = [];
app.set('trust proxy', true);
const configPaths = [
    path.join(__dirname, 'src', 'config.json'),
    path.join(__dirname, '..', 'src', 'config.json'),
    path.join(process.cwd(), 'src', 'config.json'),
    path.join(process.cwd(), 'dist', 'src', 'config.json'),
    '/var/task/src/config.json'
];

/*
 * Bug sebelumnya: kalau config.json tidak ketemu di salah satu kandidat
 * path (mis. gara-gara langkah "copy-assets" saat build tidak
 * ke-include dengan benar di bundle Vercel), fungsi ini memanggil
 * process.exit(1). Di lingkungan serverless, process.exit() dipanggil
 * saat module di-load pertama kali (cold start) — ini MEMATIKAN seluruh
 * proses Lambda/Vercel Function sebelum request apa pun sempat
 * ditangani, sehingga SETIAP endpoint (termasuk "/") langsung crash
 * dengan FUNCTION_INVOCATION_FAILED. Sekarang function ini hanya
 * mengembalikan null kalau tidak ketemu, dan pemanggilnya memakai
 * fallback config supaya aplikasi tetap bisa boot & melayani request
 * (walau endpoint dinamis dari config.tags tidak ter-load).
 */
const findConfig = () => {
    for (const file of configPaths) {
        if (fs.existsSync(file)) return file;
    }

    return null;
};

/*
 * buildConfig sekarang SELALU berhasil menghasilkan config lengkap
 * (settings + tags) walaupun configPath null/tidak ketemu, karena
 * settings & endpoints dasarnya berasal dari src/registry.ts yang
 * di-import statis (ikut ter-bundle ke Vercel, tidak bergantung pada
 * file config.json ditemukan di disk saat runtime). configPath di sini
 * hanya dipakai sebagai override opsional (mis. edit config.json lokal
 * tanpa rebuild).
 */
const configPath = findConfig();

// Waktu boot proses ini - dipakai untuk info "Server Started" di dashboard.
// Ini nilai nyata (real), BUKAN "terakhir di-deploy/update", karena project
// tidak melacak timestamp build/deploy di mana pun.
const serverStartedAt = new Date().toISOString();

let config: any;
try {
    config = buildConfig(configPath ?? '', process.cwd());
} catch (error) {
    console.error('[✗] Failed to build config, endpoints may be incomplete:', error);
    config = { settings: { creator: 'Kairoo' }, tags: {} };
}

/*
 * Resolusi folder 'public' & 'src' yang aman untuk semua environment:
 * - lokal via `ts-node index.ts` (cwd = root project)
 * - lokal via `node dist/index.js` (cwd = root project, __dirname = dist)
 * - Vercel Serverless Function (cwd tidak selalu sama dengan root project)
 */
const findDir = (name: string) => {
    const candidates = [
        path.join(__dirname, name),
        path.join(__dirname, '..', name),
        path.join(process.cwd(), name),
        path.join(process.cwd(), 'dist', name)
    ];

    for (const dir of candidates) {
        if (fs.existsSync(dir)) return dir;
    }

    // fallback: pertahankan perilaku lama walau folder belum ditemukan
    return path.join(process.cwd(), name);
};

const publicCandidates = [
    path.join(process.cwd(), 'public'),
    path.join(__dirname, '..', 'public'),
    path.join(__dirname, 'public'),
    path.join(process.cwd(), 'dist', 'public')
];
const publicDir = publicCandidates.find((dir) => fs.existsSync(dir)) || path.join(process.cwd(), 'public');
const srcDir = findDir('src');

const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.floor(Math.log(bytes) / Math.log(1024));

    return `${(bytes / Math.pow(1024, index)).toFixed(2)} ${units[index]}`;
};

const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    return `${days}d ${hours}h ${minutes}m ${secs}s`;
};

const logRequest = (req: Request, res: Response) => {
    const ignoredPaths = [
        '/stats',
        '/stats/data',
        '/src',
        '/docs',
        '/config',
        '/favicon.ico',
        '/',
        '/landing'
    ];

    if (ignoredPaths.some((item) => req.path.startsWith(item))) {
        return;
    }

    const cleanUrl = req.originalUrl.replace(/(=)[^&]+/g, '$1');
    const url = `${req.protocol}://${req.get('host')}${cleanUrl}`;

    recentRequests.push(`[${req.method}] [${res.statusCode}] ${url}`);

    if (recentRequests.length > 50) recentRequests.shift();
};

app.use(cors());
// Batasi ukuran body request supaya payload besar tidak membengkakkan
// memori proses (default express tanpa limit eksplisit bisa menerima
// body sangat besar dan menahannya di RAM sampai request selesai).
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

app.use((req: Request, res: Response, next: NextFunction) => {
    res.on('finish', () => logRequest(req, res));
    next();
});

app.use(express.static(publicDir));
app.use('/src', express.static(srcDir));

/*
 * Request tracking untuk Server Monitor (/monitor). Dipasang SEBELUM
 * rate limiter supaya request yang di-block 429 pun tetap tercatat.
 * monitorTracking sendiri fire-and-forget dan tidak pernah melempar
 * error ke pipeline express (lihat src/supabase/tracking.ts) — jadi
 * aman dipasang lebih awal tanpa mengubah perilaku endpoint lama.
 */
app.use(monitorTracking);

app.use(rateLimit); // rate limiter
loadRouter(app, config); // endpoints router

/*
 * Server Monitor API (poin 22-23 prompt update). Endpoint ini sengaja
 * DIDAFTARKAN LANGSUNG di sini (bukan lewat registry endpoints biasa)
 * karena bukan "produk" API publik seperti /api/ai atau /api/search —
 * ini backend internal untuk dashboard /monitor. Tidak menimpa/mengubah
 * endpoint /stats/data lama yang sudah ada di bawah.
 */
app.get('/api/monitor/stats', monitorStatsHandler);
app.get('/api/monitor/endpoints', monitorEndpointsHandler);
app.get('/api/monitor/recent', monitorRecentHandler);
app.get('/api/monitor/resources', monitorResourcesHandler);
app.get('/api/monitor/debug', monitorDebugHandler);

/*
 * Redesign Dark Minimal + Bento Grid (lihat prompt update redesign).
 * Endpoint & halaman baru: /api/status/health, /status, /logs,
 * /feedback (+ POST /api/feedback), /about, /privacy, /terms.
 * Semua endpoint LAMA di atas (monitor, stats, config, docs, dst)
 * TIDAK diubah/dihapus - halaman baru murni menambah, bukan mengganti.
 */
app.get('/api/status/health', statusHealthHandler);
app.post('/api/feedback', submitFeedbackHandler);

app.get('/monitor', (req: Request, res: Response) => {
    return res.sendFile(path.join(publicDir, 'monitor', 'monitor.html'));
});

app.get('/status', (req: Request, res: Response) => {
    return res.sendFile(path.join(publicDir, 'status', 'status.html'));
});

app.get('/logs', (req: Request, res: Response) => {
    return res.sendFile(path.join(publicDir, 'logs', 'logs.html'));
});

app.get('/feedback', (req: Request, res: Response) => {
    return res.sendFile(path.join(publicDir, 'feedback', 'feedback.html'));
});

app.get('/about', (req: Request, res: Response) => {
    return res.sendFile(path.join(publicDir, 'about', 'about.html'));
});

app.get('/privacy', (req: Request, res: Response) => {
    return res.sendFile(path.join(publicDir, 'privacy', 'privacy.html'));
});

app.get('/terms', (req: Request, res: Response) => {
    return res.sendFile(path.join(publicDir, 'terms', 'terms.html'));
});

app.get('/stats/data', (req: Request, res: Response) => {
    try {
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const usedMemory = totalMemory - freeMemory;
        const cpus = os.cpus();
        return res.json({
            status: true,
            server: {
                platform: os.platform(),
                arch: os.arch(),
                hostname: os.hostname(),
                uptime: formatUptime(os.uptime()),
                node_version: process.version,
                memory: {
                    total: formatBytes(totalMemory),
                    used: formatBytes(usedMemory),
                    free: formatBytes(freeMemory),
                    percent: Math.round((usedMemory / totalMemory) * 100)
                },
                cpu: {
                    model: cpus[0]?.model || 'Unknown',
                    speed: `${cpus[0]?.speed || 0} MHz`,
                    cores: cpus.length,
                    load: os.loadavg()[0].toFixed(2)
                }
            },
            requests: recentRequests
        });
    } catch {
        return res.status(500).json({ status: false });
    }
});

app.get('/stats', (req: Request, res: Response) => {
    return res.sendFile(
        path.join(publicDir, 'stats', 'stats.html')
    );
});

app.get('/config', (req: Request, res: Response) => {
    try {
        return res.json({
            creator: config.settings.creator,
            ...config,
            runtime: {
                // Data nyata dari proses berjalan, bukan angka dikarang -
                // dipakai kartu "API Information" di dashboard.
                node: process.version,
                environment: process.env.VERCEL
                    ? `Production (Vercel${process.env.VERCEL_ENV ? ` - ${process.env.VERCEL_ENV}` : ''})`
                    : (process.env.NODE_ENV || 'development'),
                platform: os.platform(),
                startedAt: serverStartedAt
            }
        });
    } catch {
        return res.status(500).json({
            creator: config.settings.creator,
            error: 'Internal Server Error'
        });
    }
});

app.get('/', (req: Request, res: Response) => {
    const landingFile = path.join(publicDir, 'landing', 'landing.html');

    // Vercel/serverless: jangan biarkan API crash hanya karena asset landing
    // tidak ikut ter-bundle. Jika file ada, tetap tampilkan landing page;
    // jika tidak ada, kembalikan status API dalam JSON.
    if (fs.existsSync(landingFile)) {
        return res.sendFile(landingFile);
    }

    return res.status(200).json({
        status: true,
        creator: config.settings.creator,
        message: 'Kairoo API is running'
    });
});

app.get('/docs', (req: Request, res: Response) => {
    return res.sendFile(
        path.join(publicDir, 'docs', 'docs.html')
    );
});

app.use((req: Request, res: Response) => {
    if (req.accepts('html')) {
        const files = [
            path.join(publicDir, '404.html'),
            path.join(__dirname, 'public', '404.html')
        ];

        for (const file of files) {
            if (fs.existsSync(file)) {
                return res.status(404).sendFile(file);
            }
        }
    }

    return res.status(404).json({
        status: false,
        creator: config.settings.creator,
        message: 'Route not found'
    });
});

app.use(errorHandler);
initAutoLoad(app, config, configPath ?? '');

/*
 * app.listen() HANYA dijalankan kalau file ini adalah entry point yang
 * langsung dieksekusi (mis. `node dist/index.js` / `ts-node index.ts`
 * lokal atau di VPS/Termux). Kalau file ini di-require oleh file lain
 * (mis. wrapper serverless function Vercel), require.main !== module,
 * sehingga listener TIDAK dibuat — sesuai kebutuhan Vercel Serverless
 * Functions yang tidak memakai/menyediakan PORT sama sekali.
 */
if (require.main === module) {
    app.listen(port, () => {
        console.log(`Server running on port ${port}`);
    });
}

export default app;