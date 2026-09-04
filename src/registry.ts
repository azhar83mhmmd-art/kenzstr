/*
 * Kairoo API | sylvatica.my.id
 * © Dandy
 *
 * REGISTRY STATIS — inti dari perbaikan "docs endpoint tidak muncul di Vercel".
 *
 * Kenapa ini dibutuhkan:
 * Sebelumnya semua router (router/**\/*.ts) dimuat lewat require(filePath)
 * dengan `filePath` dihitung saat runtime (lihat autoload.ts versi lama),
 * dan config.json / src/endpoints/*.json dibaca lewat fs.readFileSync ke
 * beberapa kandidat path. Kedua pola ini disebut "dynamic require" /
 * "dynamic fs access" — bundler Vercel (@vercel/nft) tidak bisa melacak
 * file mana saja yang benar-benar dipakai, karena path-nya baru diketahui
 * saat kode berjalan, bukan saat build. Walaupun sudah ditambal dengan
 * vercel.json > functions > includeFiles, hasilnya tetap tidak konsisten:
 * di lokal (`node dist/index.js`) semua endpoint termuat sempurna, tapi di
 * Vercel Serverless Function beberapa/semua file router & JSON endpoint
 * TIDAK ikut ter-deploy, sehingga config.tags kosong dan halaman /docs
 * cuma menampilkan animasi terminal tanpa daftar endpoint apa pun (persis
 * seperti di screenshot: "Server running on ..." muncul tapi baris
 * "[+] GET ..." tidak pernah tampil).
 *
 * Solusinya: ganti SEMUA require/fs dinamis untuk data endpoint dengan
 * `import` statis biasa. Import statis dianalisis oleh TypeScript/bundler
 * saat build, jadi setiap file di bawah ini DIJAMIN ikut ter-bundle ke
 * dist/ dan ikut ter-deploy ke Vercel — tidak bergantung lagi pada
 * includeFiles, fs.existsSync, ataupun struktur folder saat runtime.
 */

import type { Request, Response, NextFunction } from 'express';

import configJson from './config.json';

import aiEndpoints from './endpoints/ai.json';
import downloadEndpoints from './endpoints/download.json';
import makerEndpoints from './endpoints/maker.json';
import randomEndpoints from './endpoints/random.json';
import searchEndpoints from './endpoints/search.json';
import toolsEndpoints from './endpoints/tools.json';

import kuronekoHandler from '../router/ai/kuroneko';
import asyntaiHandler from '../router/ai/asyntai';
import quillbotHandler from '../router/ai/quillbot';
import qbText2imgHandler from '../router/ai/qb-text2img';
import gtranslateHandler from '../router/ai/gtranslate';
import ocrHandler from '../router/ai/ocr';

import facebookHandler from '../router/download/facebook';
import aioHandler from '../router/download/aio';

import bratHandler from '../router/maker/brat';
import brat3Handler from '../router/maker/brat3';
import bratcanvasHandler from '../router/maker/bratcanvas';
import bratgojoHandler from '../router/maker/bratgojo';
import bratvidHandler from '../router/maker/bratvid';
import iqcHandler from '../router/maker/iqc';
import drakeHandler from '../router/maker/drake';
import twobuttonsHandler from '../router/maker/twobuttons';
import beautifulHandler from '../router/maker/beautiful';
import quoteanimeHandler from '../router/maker/quoteanime';
import timpaHandler from '../router/maker/timpa';
import jarvisHandler from '../router/maker/jarvis';
import qcwaHandler from '../router/maker/qcwa';
import igqcHandler from '../router/maker/igqc';
import igstoryHandler from '../router/maker/igstory';
import kalenderHandler from '../router/maker/kalender';
import newscanvasHandler from '../router/maker/newscanvas';

import blueArchiveHandler from '../router/random/blue_archive';

import ytsHandler from '../router/search/yts';
import pinterestHandler from '../router/search/pinterest';
import pinvidHandler from '../router/search/pinvid';
import githubHandler from '../router/search/github';
import npmHandler from '../router/search/npm';
import tokopediaHandler from '../router/search/tokopedia';
import shinigamiHandler from '../router/search/shinigami';
import mcpedlHandler from '../router/search/mcpedl';
import wikipediaHandler from '../router/search/wikipedia';
import ttphotoHandler from '../router/search/ttphoto';
import ttvideoHandler from '../router/search/ttvideo';
import azlyricsHandler from '../router/search/azlyrics';
import devicecompareHandler from '../router/search/devicecompare';
import phonespecsHandler from '../router/search/phonespecs';

import shorturlHandler from '../router/tools/shorturl';
import nikcheckHandler from '../router/tools/nikcheck';
import screenshotHandler from '../router/tools/screenshot';
import webfetchHandler from '../router/tools/webfetch';
import removebgHandler from '../router/tools/removebg';

export type RouteHandler = (
    req: Request,
    res: Response,
    next: NextFunction
) => any;

/*
 * routerRegistry[category][filename] -> handler
 * Kalau menambah endpoint baru di masa depan: tambahkan import di atas,
 * lalu daftarkan di sini DAN di endpointsRegistry di bawah. Ini sengaja
 * eksplisit (bukan otomatis dari folder) supaya bundler selalu tahu
 * persis file mana yang dipakai.
 */
export const routerRegistry: Record<string, Record<string, RouteHandler>> = {
    ai: {
        kuroneko: kuronekoHandler,
        asyntai: asyntaiHandler,
        quillbot: quillbotHandler,
        'qb-text2img': qbText2imgHandler,
        gtranslate: gtranslateHandler,
        ocr: ocrHandler
    },
    download: {
        facebook: facebookHandler,
        aio: aioHandler
    },
    maker: {
        brat: bratHandler,
        brat3: brat3Handler,
        bratcanvas: bratcanvasHandler,
        bratgojo: bratgojoHandler,
        bratvid: bratvidHandler as unknown as RouteHandler,
        iqc: iqcHandler,
        drake: drakeHandler,
        twobuttons: twobuttonsHandler,
        beautiful: beautifulHandler,
        quoteanime: quoteanimeHandler,
        timpa: timpaHandler,
        jarvis: jarvisHandler,
        qcwa: qcwaHandler,
        igqc: igqcHandler,
        igstory: igstoryHandler,
        kalender: kalenderHandler,
        newscanvas: newscanvasHandler
    },
    random: {
        blue_archive: blueArchiveHandler
    },
    search: {
        yts: ytsHandler,
        pinterest: pinterestHandler,
        pinvid: pinvidHandler,
        github: githubHandler,
        npm: npmHandler,
        tokopedia: tokopediaHandler,
        shinigami: shinigamiHandler,
        mcpedl: mcpedlHandler,
        wikipedia: wikipediaHandler,
        ttphoto: ttphotoHandler,
        ttvideo: ttvideoHandler,
        azlyrics: azlyricsHandler,
        devicecompare: devicecompareHandler,
        phonespecs: phonespecsHandler
    },
    tools: {
        shorturl: shorturlHandler,
        nikcheck: nikcheckHandler,
        screenshot: screenshotHandler,
        webfetch: webfetchHandler,
        removebg: removebgHandler
    }
};

export const endpointsRegistry: Record<string, any[]> = {
    ai: aiEndpoints as any[],
    download: downloadEndpoints as any[],
    maker: makerEndpoints as any[],
    random: randomEndpoints as any[],
    search: searchEndpoints as any[],
    tools: toolsEndpoints as any[]
};

export const baseConfig: any = configJson;
