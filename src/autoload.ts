/*
 * Kairoo API | sylvatica.my.id
 * © Dandy
 */

import { Application, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { logRouterRequest } from './logger';
import { routerRegistry, endpointsRegistry, baseConfig } from './registry';

const registeredRoutes = new Set<string>();
let app: Application;
let config: any;

const methods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head']; // metode

const readJson = (filePath: string) => JSON.parse(fs.readFileSync(filePath, 'utf-8'));

/*
 * buildConfig sekarang mengambil settings & endpoints dari registry statis
 * (src/registry.ts) yang di-import langsung, BUKAN dari fs.readFileSync /
 * fs.readdirSync saat runtime. Ini memastikan config.json dan setiap
 * src/endpoints/*.json selalu ikut ter-bundle & ter-deploy ke Vercel,
 * karena `import` statis dilacak oleh bundler saat build — tidak seperti
 * pembacaan file dinamis yang sebelumnya sering gagal di lingkungan
 * serverless (lihat komentar panjang di src/registry.ts).
 *
 * `configPath`/`cwd` masih diterima supaya index.ts tidak perlu diubah
 * signature-nya, dan supaya `settings` tetap bisa dioverride dari file
 * config.json lokal (mis. saat development, tanpa perlu rebuild) kalau
 * memang ditemukan di disk.
 */
export const buildConfig = (configPath: string, cwd: string) => {
    let data: any = baseConfig;

    if (configPath && fs.existsSync(configPath)) {
        try {
            data = { ...baseConfig, ...readJson(configPath) };
        } catch {
            data = baseConfig;
        }
    }

    data = { ...data };
    data.tags = { ...endpointsRegistry, ...(data.tags || {}) };

    console.log(
        `[i] Loaded endpoints from static registry: ${Object.keys(endpointsRegistry)
            .map((name) => `${name} (${endpointsRegistry[name].length} routes)`)
            .join(', ')}`
    );

    return data;
};

const getRouteHandler = (category: string, filename: string) => {
    return routerRegistry[category]?.[filename] || null;
};

const getRouteKey = (route: any) =>
    `${String(route.method).toLowerCase()}:${route.endpoint}`;

const registerRoute = (
    route: any,
    category: string,
    creator: string,
    targetApp: Application
) => {
    const method = String(route.method || '').toLowerCase();
    const routeKey = getRouteKey(route);

    if (registeredRoutes.has(routeKey)) return;

    if (!methods.includes(method)) {
        console.error(`[!] Unsupported method: ${route.method} ${route.endpoint}`);
        return;
    }

    if (!route.endpoint || !route.filename) {
        console.error('[!] Invalid route configuration:', route);
        return;
    }

    const handler = getRouteHandler(category, route.filename);

    if (typeof handler !== 'function') {
        console.error(`[!] Handler not found in registry: ${category}/${route.filename}`);
        return;
    }

    try {
        const routeHandler = async (req: Request, res: Response, next: NextFunction) => {
            logRouterRequest(req, res);

            const oldJson = res.json.bind(res);

            res.json = (body: any) => {
                if (body && typeof body === 'object' && !Array.isArray(body)) {
                    return oldJson({ creator, ...body });
                }

                return oldJson(body);
            };

            try {
                await handler(req, res, next);
            } catch (error) {
                next(error);
            }
        };

        (targetApp as any)[method](route.endpoint, routeHandler);
        registeredRoutes.add(routeKey);

        console.log(`[+] Loaded: ${route.method} ${route.endpoint} -> ${category}/${route.filename}`);
    } catch (error) {
        console.error(`[!] Failed to load ${route.endpoint}:`, error);
    }
};

export const loadRouter = (targetApp: Application, targetConfig: any) => {
    app = targetApp;
    config = targetConfig;

    if (!config.tags) {
        console.error('[!] tags not found in config.json');
        return;
    }

    const creator = config.settings?.creator || '';

    for (const category of Object.keys(config.tags)) {
        const routes = config.tags[category];
        if (!Array.isArray(routes)) continue;

        for (const route of routes) {
            registerRoute(route, category, creator, targetApp);
        }
    }
};

const reloadRouter = () => {
    if (!app || !config) return;
    loadRouter(app, config);
};

export const initAutoLoad = (
    targetApp: Application,
    targetConfig: any,
    configPath: string
) => {
    app = targetApp;
    config = targetConfig;

    console.log('[✓] Auto Load Activated');

    /*
     * fs.watch untuk hot-reload HANYA berguna & aman di lingkungan lokal
     * (Termux/VPS) yang mendukung inotify dan filesystem read-write.
     * Di Vercel (serverless, read-only, tanpa inotify) ini langsung
     * di-skip, dan sekarang juga tidak lagi relevan untuk memuat
     * endpoint karena endpoint selalu berasal dari registry statis yang
     * sudah ter-bundle sejak build time.
     */
    if (process.env.VERCEL) {
        return;
    }

    if (configPath && fs.existsSync(configPath)) {
        try {
            fs.watch(configPath, (event, filename) => {
                if (event !== 'change' || !filename) return;

                try {
                    config = buildConfig(configPath, process.cwd());
                    reloadRouter();
                    console.log('[✓] Config reloaded');
                } catch (error) {
                    console.error('[!] Failed to reload config:', error);
                }
            });
        } catch (error) {
            console.warn('[!] fs.watch tidak didukung di environment ini, hot-reload config dimatikan:', error);
        }
    }
};
