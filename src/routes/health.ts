/*
 * Kairoo API | sylvatica.my.id
 * © Dandy
 *
 * GET /api/status/health
 *
 * Health check NYATA untuk halaman /status (poin 9 prompt update):
 * - api            : selalu "operational" kalau handler ini sempat jalan
 *                     (request berhasil masuk & diproses berarti proses
 *                     Node/serverless function hidup).
 * - database       : "operational" hanya jika Supabase benar-benar
 *                     dikonfigurasi DAN sebuah query ringan berhasil
 *                     dalam waktu wajar. "unavailable" kalau tidak
 *                     dikonfigurasi (bukan "down" — beda kondisi).
 *                     "degraded" kalau query berhasil tapi lambat.
 *                     "down" kalau query gagal/timeout.
 * - endpointSystem : dihitung dari endpointsRegistry statis yang sama
 *                     dipakai autoload.ts — bukan angka terpisah yang
 *                     bisa nyasar beda dari /docs atau Beranda.
 *
 * TIDAK PERNAH mengembalikan "operational" secara default/hardcode -
 * setiap status berasal dari pengukuran nyata di request ini.
 */
import { Request, Response } from 'express';
import { supabase, hasSupabase } from '../supabase/client';
import { endpointsRegistry } from '../registry';

type HealthStatus = 'operational' | 'degraded' | 'down' | 'unavailable';

const DEGRADED_THRESHOLD_MS = 800;

const countEndpoints = () => {
    let total = 0;
    for (const key of Object.keys(endpointsRegistry)) {
        const routes = endpointsRegistry[key];
        if (Array.isArray(routes)) total += routes.length;
    }
    return total;
};

const checkDatabase = async (): Promise<{ status: HealthStatus; responseTime: number | null; message: string }> => {
    if (!hasSupabase || !supabase) {
        return {
            status: 'unavailable',
            responseTime: null,
            message: 'Supabase belum dikonfigurasi (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY kosong).'
        };
    }

    const start = Date.now();

    try {
        // Query paling ringan yang mungkin: count tanpa mengambil baris.
        const { error } = await supabase
            .from('daily_stats')
            .select('date', { count: 'exact', head: true })
            .limit(1);

        const responseTime = Date.now() - start;

        if (error) {
            return { status: 'down', responseTime, message: error.message };
        }

        return {
            status: responseTime > DEGRADED_THRESHOLD_MS ? 'degraded' : 'operational',
            responseTime,
            message: responseTime > DEGRADED_THRESHOLD_MS ? 'Query berhasil namun lebih lambat dari biasanya.' : 'Terhubung normal.'
        };
    } catch (err: any) {
        return {
            status: 'down',
            responseTime: Date.now() - start,
            message: err?.message || 'Gagal terhubung ke database.'
        };
    }
};

export async function statusHealthHandler(req: Request, res: Response) {
    const requestStart = Date.now();

    const db = await checkDatabase();
    const endpointCount = countEndpoints();

    const apiResponseTime = Date.now() - requestStart;

    // Status keseluruhan: turunan jujur dari komponen-komponen di atas,
    // bukan nilai independen yang bisa berbeda sendiri dari detailnya.
    let overall: HealthStatus = 'operational';
    if (db.status === 'down') overall = 'degraded'; // API tetap jalan walau DB down
    else if (db.status === 'degraded') overall = 'degraded';

    return res.status(200).json({
        status: overall,
        checkedAt: new Date().toISOString(),
        components: {
            api: {
                status: 'operational' as HealthStatus,
                responseTime: apiResponseTime,
                message: 'API menerima dan memproses request.'
            },
            database: db,
            endpointSystem: {
                status: endpointCount > 0 ? 'operational' as HealthStatus : 'down' as HealthStatus,
                totalEndpoints: endpointCount,
                message: endpointCount > 0
                    ? `${endpointCount} endpoint terdaftar di registry.`
                    : 'Tidak ada endpoint terdaftar di registry.'
            }
        }
    });
}
