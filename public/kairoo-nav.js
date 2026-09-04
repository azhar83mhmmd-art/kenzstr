/*
 * Kairoo API — Shared Navbar + Footer (Dark Minimal)
 *
 * Kenapa di-generate lewat JS, bukan ditulis manual di tiap .html:
 * ada 8+ halaman (beranda, docs, logs, status, feedback, about, privacy,
 * terms) yang semuanya butuh navbar & footer IDENTIK. Menulis ulang HTML
 * yang sama di 8 file bikin gampang out-of-sync (mis. lupa update 1
 * halaman saat linknya berubah). Nama halaman & judul tab tetap diatur
 * per-file lewat <title>, komponen ini hanya menyuntik navbar/footer.
 *
 * Sesuai prompt poin 2: navbar TIDAK menampilkan GitHub / Harga & Paket.
 * Privacy & Terms hanya di footer, bukan navbar utama.
 */
(function () {
    'use strict';

    var NAV_ITEMS = [
        { href: '/', label: 'Beranda', key: 'home', icon: 'M3 11.5L12 4l9 7.5M5 10v9a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1v-9' },
        { href: '/docs', label: 'Dokumentasi API', key: 'docs', icon: 'M4 5.5C4 4.67 4.67 4 5.5 4H12v16H5.5A1.5 1.5 0 014 18.5v-13zM20 5.5c0-.83-.67-1.5-1.5-1.5H12v16h6.5a1.5 1.5 0 001.5-1.5v-13z' },
        { href: '/logs', label: 'Live Request Logs', key: 'logs', icon: 'M13 2L3 14h7l-1 8 10-12h-7l1-8z' },
        { href: '/status', label: 'Status Server Realtime', key: 'status', icon: 'M3 3v18h18M7 15l3-4 3 3 5-7' },
        { href: '/feedback', label: 'Pusat Feedback & Laporan', key: 'feedback', icon: 'M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z' },
        { href: '/about', label: 'Tentang Kami', key: 'about', icon: 'M12 16v-4M12 8h.01M22 12a10 10 0 11-20 0 10 10 0 0120 0z' }
    ];

    var FOOTER_LINKS = [
        { href: '/docs', label: 'Dokumentasi' },
        { href: '/status', label: 'Status' },
        { href: '/feedback', label: 'Feedback' },
        { href: '/about', label: 'Tentang Kami' },
        { href: '/privacy', label: 'Kebijakan Privasi' },
        { href: '/terms', label: 'Syarat & Ketentuan' }
    ];

    function icon(d, size) {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="' + (size || 15) + '" height="' + (size || 15) + '"><path d="' + d + '"/></svg>';
    }

    function buildNav(activeKey) {
        var links = NAV_ITEMS.map(function (item) {
            var active = item.key === activeKey ? ' active' : '';
            return '<a href="' + item.href + '" class="k-nav-link' + active + '">' + icon(item.icon) + '<span>' + item.label + '</span></a>';
        }).join('');

        var drawerLinks = NAV_ITEMS.map(function (item) {
            var active = item.key === activeKey ? ' active' : '';
            return '<a href="' + item.href + '" class="k-nav-drawer-link' + active + '">' + icon(item.icon, 18) + '<span>' + item.label + '</span></a>';
        }).join('');

        var nav = document.createElement('header');
        nav.className = 'k-navbar';
        nav.innerHTML =
            '<div class="k-navbar-inner">' +
                '<a href="/" class="k-brand"><span class="k-brand-dot"></span><span id="k-brand-name">KAIROO</span></a>' +
                '<nav class="k-nav-links">' + links + '</nav>' +
                '<button type="button" class="k-nav-hamburger" id="k-nav-toggle" aria-label="Buka menu" aria-expanded="false" aria-controls="k-nav-drawer">' +
                    icon('M4 7h16M4 12h16M4 17h16', 18) +
                '</button>' +
            '</div>';

        var overlay = document.createElement('div');
        overlay.className = 'k-nav-drawer-overlay';
        overlay.id = 'k-nav-overlay';

        var drawer = document.createElement('aside');
        drawer.className = 'k-nav-drawer';
        drawer.id = 'k-nav-drawer';
        drawer.setAttribute('aria-hidden', 'true');
        drawer.innerHTML =
            '<div class="k-nav-drawer-head">' +
                '<span class="k-brand"><span class="k-brand-dot"></span>KAIROO</span>' +
                '<button type="button" class="k-nav-hamburger" id="k-nav-close" aria-label="Tutup menu">' + icon('M6 6l12 12M18 6L6 18', 16) + '</button>' +
            '</div>' +
            drawerLinks;

        document.body.prepend(nav);
        document.body.appendChild(overlay);
        document.body.appendChild(drawer);

        var toggle = document.getElementById('k-nav-toggle');
        var closeBtn = document.getElementById('k-nav-close');

        function open() {
            drawer.classList.add('open');
            overlay.classList.add('show');
            drawer.setAttribute('aria-hidden', 'false');
            toggle.setAttribute('aria-expanded', 'true');
            document.body.style.overflow = 'hidden';
        }
        function close() {
            drawer.classList.remove('open');
            overlay.classList.remove('show');
            drawer.setAttribute('aria-hidden', 'true');
            toggle.setAttribute('aria-expanded', 'false');
            document.body.style.overflow = '';
        }

        toggle.addEventListener('click', open);
        closeBtn.addEventListener('click', close);
        overlay.addEventListener('click', close);
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') close();
        });
    }

    function buildFooter() {
        var links = FOOTER_LINKS.map(function (l) {
            return '<a href="' + l.href + '" class="k-footer-link">' + l.label + '</a>';
        }).join('');

        var footer = document.createElement('footer');
        footer.className = 'k-footer';
        footer.innerHTML =
            '<div class="k-footer-inner">' +
                '<div>' +
                    '<div class="k-footer-brand-name">KAIROO API</div>' +
                    '<p class="k-footer-brand-desc">API Platform untuk aplikasi modern.</p>' +
                '</div>' +
                '<nav class="k-footer-links">' + links + '</nav>' +
            '</div>' +
            '<p class="k-footer-bottom">&copy; <span id="k-footer-year"></span> Kairoo API. Dibangun untuk developer.</p>';

        document.body.appendChild(footer);
        var yearEl = document.getElementById('k-footer-year');
        if (yearEl) yearEl.textContent = new Date().getFullYear();
    }

    function init() {
        var activeKey = document.body.getAttribute('data-page') || '';
        buildNav(activeKey);
        buildFooter();

        // set brand name dari /config kalau tersedia (apiName nyata,
        // bukan hardcode "KAIROO" permanen) - best effort, silent fail.
        fetch('/config').then(function (r) { return r.json(); }).then(function (cfg) {
            var name = cfg && cfg.settings && cfg.settings.apiName;
            if (!name) return;
            var el = document.getElementById('k-brand-name');
            if (el) el.textContent = name.toUpperCase();
        }).catch(function () {});
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
