/*
 * Kairoo API - shared frontend logic
 * Dipakai di landing, docs, stats (legacy), dan monitor.
 *
 * Berisi:
 * 1. Popup verifikasi channel WhatsApp (first visit) - localStorage: kairoo_channel_verified
 * 2. Toast notification helper - window.kairooToast(message)
 *
 * SANGAT PENTING (lihat prompt update poin 37): popup ini HANYA ajakan.
 * Tidak ada dan tidak akan pernah ada kode yang mengklaim/memverifikasi
 * bahwa user benar-benar sudah follow channel WhatsApp - WhatsApp tidak
 * menyediakan API publik untuk itu. localStorage hanya menyimpan
 * preferensi "sudah lihat popup / jangan tampilkan lagi", BUKAN status
 * follow.
 */
(function () {
    'use strict';

    var WHATSAPP_CHANNEL_URL = 'https://whatsapp.com/channel/0029VbDCEVT7DAX19uJ8YQ3a';
    var CHANNEL_SEEN_KEY = 'kairoo_channel_verified';

    var hasStorage = (function () {
        try {
            var testKey = '__kairoo_test__';
            window.localStorage.setItem(testKey, '1');
            window.localStorage.removeItem(testKey);
            return true;
        } catch (e) {
            return false;
        }
    })();

    function storageGet(key) {
        if (!hasStorage) return null;
        try { return window.localStorage.getItem(key); } catch (e) { return null; }
    }

    function storageSet(key, value) {
        if (!hasStorage) return;
        try { window.localStorage.setItem(key, value); } catch (e) { /* diabaikan, website tetap jalan */ }
    }

    /* ===================== WHATSAPP POPUP ===================== */

    function initWhatsappPopup() {
        var overlay = document.getElementById('wa-overlay');
        if (!overlay) return; // halaman ini tidak punya popup (mis. docs bisa skip)

        var followBtn = document.getElementById('wa-modal-follow');
        var continueBtn = document.getElementById('wa-modal-continue');
        var closeBtn = document.getElementById('wa-modal-close');
        var dontShowCheckbox = document.getElementById('wa-modal-dontshow');

        if (followBtn) followBtn.href = WHATSAPP_CHANNEL_URL;

        var channelLinks = document.querySelectorAll('#btn-channel, #sidebar-btn-channel, [data-whatsapp-channel]');
        channelLinks.forEach(function (el) { el.href = WHATSAPP_CHANNEL_URL; });

        function openModal() {
            overlay.classList.add('show');
            document.body.style.overflow = 'hidden';
        }

        function closeModal(markSeen) {
            overlay.classList.remove('show');
            document.body.style.overflow = '';

            if (markSeen) {
                storageSet(CHANNEL_SEEN_KEY, 'true');
            }
        }

        var alreadySeen = storageGet(CHANNEL_SEEN_KEY) === 'true';

        if (!alreadySeen) {
            // beri jeda kecil supaya tidak muncul bersamaan dengan loader
            setTimeout(openModal, 600);
        }

        if (followBtn) {
            followBtn.addEventListener('click', function () {
                // User diarahkan ke WhatsApp (target=_blank). Tidak ada klaim
                // verifikasi apa pun - popup tetap ditutup sebagai ajakan selesai,
                // bukan sebagai bukti bahwa user sudah follow.
                closeModal(true);
                if (window.kairooToast) window.kairooToast('Membuka saluran WhatsApp Kairoo...');
            });
        }

        if (continueBtn) {
            continueBtn.addEventListener('click', function () {
                var markSeen = dontShowCheckbox ? dontShowCheckbox.checked : true;
                closeModal(markSeen || true);
            });
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', function () { closeModal(true); });
        }

        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) closeModal(true);
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && overlay.classList.contains('show')) closeModal(true);
        });
    }

    /* ===================== TOAST ===================== */

    function initToast() {
        var stack = document.getElementById('toast-stack');
        if (!stack) return;

        window.kairooToast = function (message, duration) {
            var el = document.createElement('div');
            el.className = 'toast';
            el.textContent = message;
            stack.appendChild(el);

            requestAnimationFrame(function () { el.classList.add('show'); });

            setTimeout(function () {
                el.classList.remove('show');
                setTimeout(function () { el.remove(); }, 220);
            }, duration || 2600);
        };
    }

    document.addEventListener('DOMContentLoaded', function () {
        initToast();
        initWhatsappPopup();
    });
})();
