/*
 * Kairoo API | sylvatica.my.id
 * © Dandy
 *
 * GET /api/monitor/stats
 * GET /api/monitor/endpoints  (top endpoints, dengan search/filter)
 * GET /api/monitor/recent     (recent requests, dipaginasi/limit)
 * GET /api/monitor/resources  (CPU/RAM/uptime proses Node — bukan VPS
 *                              fisik kalau berjalan di Vercel serverless)
 *
 * Prinsip (poin 19 & 23 di prompt update):
 * - Jangan pernah hardcode angka.
 * - Kalau Supabase tidak dikonfigurasi, kembalikan status eksplisit
 *   "unavailable" alih-alih angka 0 yang seolah-olah data nyata.
 * - Kalau berjalan di runtime serverless (Vercel), CPU/RAM proses yang
 *   dilaporkan os.cpus()/os.totalmem() adalah milik VM sementara
 *   eksekusi function, BUKAN kapasitas VPS — beri label yang jujur.
 */
import { Request, Response } from 'express';
import os from 'os';
import { supabase, hasSupabase } from '../supabase/client';

const isServerless = Boolean(process.env.VERCEL);

const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    return `${days}d ${hours}h ${minutes}m ${secs}s`;
};

export async function monitorStatsHandler(req: Request, res: Response) {
    if (!hasSupabase || !supabase) {
        return res.status(200).json({
            status: 'unavailable',
            message: 'Server Monitor belum dikonfigurasi. Set SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY untuk mengaktifkan statistik real-time.',
            totalUsers: null,
            totalRequests: null,
            totalEndpoints: null,
            activeRequests: null,
            rps: { last5s: null, last15s: null, last60s: null },
            averageResponseTime: null,
            successRate: null,
            errorRate: null,
            requestsToday: null,
            updatedAt: new Date().toISOString()
        });
    }

    try {
        const { data, error } = await supabase.rpc('get_monitor_snapshot').single();

        if (error) throw error;

        const snapshot = data as any;

        return res.status(200).json({
            status: 'online',
            totalUsers: Number(snapshot.total_users) || 0,
            totalRequests: Number(snapshot.total_requests) || 0,
            totalEndpoints: Number(snapshot.total_endpoints) || 0,
            activeRequests: 0, // request yang sedang berjalan saat ini di instance ini
            rps: {
                last5s: Number(snapshot.rps_5s) || 0,
                last15s: Number(snapshot.rps_15s) || 0,
                last60s: Number(snapshot.rps_60s) || 0
            },
            averageResponseTime: Math.round(Number(snapshot.avg_response_time) || 0),
            successRate: Number(snapshot.success_rate) || 0,
            errorRate: Number(snapshot.error_rate) || 0,
            requestsToday: Number(snapshot.requests_today) || 0,
            updatedAt: new Date().toISOString()
        });
    } catch (err: any) {
        console.error('[Monitor] Gagal ambil snapshot:', err?.message || err);
        return res.status(200).json({
            status: 'offline',
            message: 'Tidak dapat mengambil statistik saat ini. Coba lagi.',
            totalUsers: null,
            totalRequests: null,
            totalEndpoints: null,
            activeRequests: null,
            rps: { last5s: null, last15s: null, last60s: null },
            averageResponseTime: null,
            successRate: null,
            errorRate: null,
            requestsToday: null,
            updatedAt: new Date().toISOString()
        });
    }
}

export async function monitorEndpointsHandler(req: Request, res: Response) {
    if (!hasSupabase || !supabase) {
        return res.status(200).json({ status: 'unavailable', result: [] });
    }

    const search = String(req.query.q || '').trim().toLowerCase();
    const limit = Math.min(Number(req.query.limit) || 20, 100);

    try {
        let query = supabase
            .from('endpoints')
            .select('endpoint, method, total_requests, success_requests, error_requests, total_response_time, last_request_at')
            .order('total_requests', { ascending: false })
            .limit(limit);

        if (search) {
            query = query.ilike('endpoint', `%${search}%`);
        }

        const { data, error } = await query;
        if (error) throw error;

        const result = (data || []).map((row: any) => ({
            endpoint: row.endpoint,
            method: row.method,
            requests: Number(row.total_requests) || 0,
            success: Number(row.success_requests) || 0,
            error: Number(row.error_requests) || 0,
            avgResponse: row.total_requests > 0 ? Math.round(row.total_response_time / row.total_requests) : 0,
            lastRequest: row.last_request_at
        }));

        return res.status(200).json({ status: 'online', result });
    } catch (err: any) {
        console.error('[Monitor] Gagal ambil top endpoints:', err?.message || err);
        return res.status(200).json({ status: 'offline', result: [] });
    }
}

export async function monitorRecentHandler(req: Request, res: Response) {
    if (!hasSupabase || !supabase) {
        return res.status(200).json({ status: 'unavailable', result: [] });
    }

    const limit = Math.min(Number(req.query.limit) || 25, 100);

    try {
        // user_agent & ip_hash sengaja TIDAK diikutkan di response publik
        // (tidak ada API key/token/secret yang pernah ada di tabel ini).
        const { data, error } = await supabase
            .from('api_requests')
            .select('endpoint, method, status_code, response_time, created_at')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;

        const result = (data || []).map((row: any) => ({
            time: row.created_at,
            method: row.method,
            endpoint: row.endpoint,
            status: row.status_code,
            responseTime: row.response_time
        }));

        return res.status(200).json({ status: 'online', result });
    } catch (err: any) {
        console.error('[Monitor] Gagal ambil recent requests:', err?.message || err);
        return res.status(200).json({ status: 'offline', result: [] });
    }
}

export async function monitorResourcesHandler(req: Request, res: Response) {
    if (isServerless) {
        return res.status(200).json({
            status: 'limited',
            message: 'Server resource metrics tidak tersedia pada runtime serverless.',
            runtime: 'vercel-serverless',
            nodeVersion: process.version,
            // uptime proses function saat ini (bukan uptime VPS - reset tiap
            // cold start), tetap angka nyata bukan karangan.
            uptime: formatUptime(process.uptime()),
            // metrik yang memang tersedia di serverless: memory proses function
            // saat ini (bukan VPS fisik).
            processMemory: {
                rss: process.memoryUsage().rss,
                heapUsed: process.memoryUsage().heapUsed,
                heapTotal: process.memoryUsage().heapTotal
            }
        });
    }

    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const cpus = os.cpus();

    return res.status(200).json({
        status: 'online',
        runtime: 'node',
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        uptime: formatUptime(os.uptime()),
        cpu: {
            model: cpus[0]?.model || 'Unknown',
            cores: cpus.length,
            loadAvg: os.loadavg()[0].toFixed(2)
        },
        memory: {
            totalMB: Math.round(totalMemory / 1024 / 1024),
            usedMB: Math.round(usedMemory / 1024 / 1024),
            freeMB: Math.round(freeMemory / 1024 / 1024),
            percent: Math.round((usedMemory / totalMemory) * 100)
        }
    });
}
