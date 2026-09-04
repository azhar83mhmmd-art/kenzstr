/*
 * Kairoo API | sylvatica.my.id
 * © Dandy
 */
import { Request, Response, NextFunction } from "express";
import { Redis } from "@upstash/redis";
import { logRateLimit } from "../logger";

/*
 * Bug sebelumnya: kalau salah satu env var ini tidak diset (mis. lupa
 * ditambahkan di dashboard Vercel), modul ini throw di level import —
 * artinya SELURUH aplikasi crash (FUNCTION_INVOCATION_FAILED) untuk
 * setiap request, bukan cuma rate limiter yang gagal. Sekarang fallback
 * ke nilai default yang sama seperti di .env.example, dan hanya
 * mencatat warning.
 */
const DEFAULT_MAX_REQUESTS = 15;
const DEFAULT_WINDOW_TIME = 1000;
const DEFAULT_BAN_TIME = 60000;

const MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS) || DEFAULT_MAX_REQUESTS;
const WINDOW_TIME = Number(process.env.RATE_LIMIT_WINDOW) || DEFAULT_WINDOW_TIME;
const BAN_TIME = Number(process.env.RATE_LIMIT_BAN_TIME) || DEFAULT_BAN_TIME;

if (
  !process.env.RATE_LIMIT_MAX_REQUESTS ||
  !process.env.RATE_LIMIT_WINDOW ||
  !process.env.RATE_LIMIT_BAN_TIME
) {
  console.warn(
    '[!] RATE_LIMIT_MAX_REQUESTS/WINDOW/BAN_TIME tidak lengkap di environment variable, ' +
    `memakai default (${DEFAULT_MAX_REQUESTS}/${DEFAULT_WINDOW_TIME}ms/${DEFAULT_BAN_TIME}ms).`
  );
}

type IpData = {
  requests: number[];
  bannedUntil: number;
};

const ipData = new Map<string, IpData>();

/*
 * Deteksi placeholder yang belum diganti user (mis. "xxxx.upstash.io"
 * yang dicontohkan di .env.example/dokumentasi). Kalau dibiarkan, redis
 * client tetap dibuat dan setiap request mencoba resolve DNS ke host
 * yang jelas tidak nyata -> ENOTFOUND berulang, log penuh spam, dan
 * setiap request kena latency percobaan koneksi sebelum jatuh ke
 * fallback memory. Bukan bug baru di rate limiter itu sendiri (fallback
 * memory-nya sudah aman, lihat catch di redisRateLimit), ini murni
 * validasi supaya konfigurasi yang jelas belum diisi tidak diperlakukan
 * seolah-olah sudah dikonfigurasi.
 */
const isPlaceholderUpstashUrl = (url: string): boolean => {
  const normalized = url.trim().toLowerCase();
  if (!normalized) return true;
  if (normalized.includes('xxxx')) return true;
  if (normalized === 'https://xxxx.upstash.io') return true;
  return false;
};

const upstashUrl = process.env.UPSTASH_REDIS_REST_URL || '';
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN || '';

const hasRedis =
  Boolean(upstashUrl) &&
  Boolean(upstashToken) &&
  !isPlaceholderUpstashUrl(upstashUrl);

if (Boolean(upstashUrl) && isPlaceholderUpstashUrl(upstashUrl)) {
  console.warn(
    '[!] UPSTASH_REDIS_REST_URL masih berisi nilai placeholder (' +
    upstashUrl +
    '). Rate limiter memakai fallback memory. Isi dengan URL Upstash asli dari dashboard Upstash untuk mengaktifkan Redis.'
  );
}

/*
 * PENTING (bug FUNCTION_INVOCATION_FAILED di semua route Vercel):
 * Redis.fromEnv() memvalidasi UPSTASH_REDIS_REST_URL secara synchronous
 * dan bisa throw kalau env var-nya SUDAH DIISI tapi formatnya salah
 * (bukan placeholder, jadi lolos dari isPlaceholderUpstashUrl di atas).
 * Modul ini di-import di level teratas (index.ts -> rateLimit.ts),
 * jadi exception yang tidak ditangkap di sini mematikan SELURUH proses
 * Vercel Function saat cold start, bukan cuma rate limiter. Dibungkus
 * try/catch supaya selalu fallback ke memory limiter kalau gagal.
 */
let redis: Redis | null = null;

if (hasRedis) {
    try {
        redis = Redis.fromEnv();
    } catch (error) {
        console.error(
            '[✗] Gagal membuat Upstash Redis client (UPSTASH_REDIS_REST_URL kemungkinan tidak valid). ' +
            'Rate limiter akan memakai fallback memory:',
            error instanceof Error ? error.message : error
        );
        redis = null;
    }
}

// Throttle log error Redis supaya tidak spam sekali per request kalau
// Redis sedang down/unreachable - cukup 1 log per 30 detik.
let lastRedisErrorLoggedAt = 0;
const logRedisError = (error: unknown) => {
  const now = Date.now();
  if (now - lastRedisErrorLoggedAt < 30000) return;
  lastRedisErrorLoggedAt = now;
  console.error('[RateLimit] Redis error, fallback ke memory limiter:', error);
};

const getIp = (req: Request): string => {
  const forwarded = req.headers["x-forwarded-for"];
  let ip: string;

  if (typeof forwarded === "string") {
    ip = forwarded.split(",")[0].trim();
  } else if (Array.isArray(forwarded)) {
    ip = forwarded[0]?.trim() || "unknown";
  } else {
    ip = req.ip || req.socket?.remoteAddress || "unknown";
  }

  return ip.replace("::ffff:", "").trim();
};

/*
 * Memory fallback
 */

const cleanData = () => {
  const now = Date.now();

  for (const [ip, data] of ipData) {
    data.requests = data.requests.filter(
      (time) => now - time < WINDOW_TIME
    );

    if (data.requests.length === 0 && data.bannedUntil <= now) {
      ipData.delete(ip);
    }
  }
};

setInterval(cleanData, Math.max(WINDOW_TIME, 60000)).unref();

/*
 * Redis rate limiter
 *
 * Redis key:
 * ratelimit:{ip}:{window}
 *
 * Ban key:
 * ratelimit:ban:{ip}
 */

const redisRateLimit = async (
  req: Request,
  res: Response,
  ip: string,
  now: number
): Promise<boolean> => {
  if (!redis) return false;

  const banKey = `ratelimit:ban:${ip}`;

  try {
    /*
     * Check active ban
     */

    const bannedUntil = await redis.get<number>(banKey);

    if (bannedUntil && bannedUntil > now) {
      const remaining = Math.ceil((bannedUntil - now) / 1000);
      res.setHeader("Retry-After", remaining);
      return true;
    }

    /*
     * Use a fixed window.
     *
     * Example:
     * 10:20:31.000 - 10:20:31.999
     * 10:20:32.000 - 10:20:32.999
     */

    const windowStart = Math.floor(now / WINDOW_TIME) * WINDOW_TIME;
    const windowKey = `ratelimit:${ip}:${windowStart}`;

    /*
     * Atomic increment.
     */

    const count = await redis.incr(windowKey);

    /*
     * Give the counter an expiration.
     */

    if (count === 1) {
      const ttl = Math.ceil(WINDOW_TIME / 1000);
      await redis.expire(windowKey, Math.max(ttl, 1));
    }

    /*
     * Limit exceeded.
     */

    if (count > MAX_REQUESTS) {
      const bannedUntil = now + BAN_TIME;

      await redis.set(banKey, bannedUntil, { px: BAN_TIME });
      await redis.del(windowKey);

      logRateLimit(req);

      res.setHeader("Retry-After", Math.ceil(BAN_TIME / 1000));
      res.status(429).json({
        status: false,
        message: "Too many requests. You are temporarily banned"
      });

      return true;
    }

    return false;
  } catch (error) {
    /*
     * Redis failure should not make
     * the entire API unavailable.
     *
     * Fall back to memory limiter.
     */

    logRedisError(error);
    return false;
  }
};

/*
 * Memory rate limiter
 */

const memoryRateLimit = (
  req: Request,
  res: Response,
  ip: string,
  now: number
): boolean => {
  let data = ipData.get(ip);

  if (!data) {
    data = { requests: [], bannedUntil: 0 };
    ipData.set(ip, data);
  }

  /*
   * Check active ban.
   */

  if (data.bannedUntil > now) {
    const remaining = Math.ceil((data.bannedUntil - now) / 1000);
    res.setHeader("Retry-After", remaining);

    res.status(429).json({
      status: false,
      message: "Too many requests. You are temporarily banned"
    });

    return true;
  }

  /*
   * Remove expired requests.
   */

  data.requests = data.requests.filter(
    (time) => now - time < WINDOW_TIME
  );

  /*
   * Add current request.
   */

  data.requests.push(now);

  /*
   * Check limit.
   */

  if (data.requests.length > MAX_REQUESTS) {
    data.bannedUntil = now + BAN_TIME;
    data.requests = [];

    logRateLimit(req);

    res.setHeader("Retry-After", Math.ceil(BAN_TIME / 1000));
    res.status(429).json({
      status: false,
      message: "Too many requests. You are temporarily banned"
    });

    return true;
  }

  return false;
};

/*
 * Main middleware
 */

export const rateLimit = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const ip = getIp(req);
  const now = Date.now();

  /*
   * Vercel / VPS with Upstash
   */

  if (redis) {
    const blocked = await redisRateLimit(req, res, ip, now);

    if (blocked) return;

    return next();
  }

  /*
   * Fallback when Redis
   * environment variables
   * are not configured.
   */

  if (memoryRateLimit(req, res, ip, now)) return;

  next();
};
