/*
 * Kairoo API - Server Monitor dashboard logic
 * Polling /api/monitor/* setiap beberapa detik, render ke DOM.
 * Tidak pernah menampilkan angka hardcode - kalau backend bilang
 * "unavailable"/"offline", UI menampilkan status itu apa adanya.
 */
(function () {
    'use strict';

    var POLL_STATS_MS = 5000;
    var POLL_TABLES_MS = 10000;
    var POLL_RESOURCES_MS = 15000;
    var MAX_CHART_POINTS = 30;

    var els = {
        skeleton: document.getElementById('skeleton-grid'),
        content: document.getElementById('monitor-content'),
        offline: document.getElementById('offline-state'),
        statusBanner: document.getElementById('status-banner'),
        statusDot: document.getElementById('status-dot'),
        statusText: document.getElementById('status-text'),
        liveBadge: document.getElementById('live-badge'),
        liveBadgeText: document.getElementById('live-badge-text'),

        users: document.getElementById('stat-users'),
        requests: document.getElementById('stat-requests'),
        endpoints: document.getElementById('stat-endpoints'),
        active: document.getElementById('stat-active'),
        avgResponse: document.getElementById('stat-avgresponse'),
        success: document.getElementById('stat-success'),
        error: document.getElementById('stat-error'),
        today: document.getElementById('stat-today'),

        rps5s: document.getElementById('rps-5s'),
        rps15s: document.getElementById('rps-15s'),
        rps60s: document.getElementById('rps-60s'),
        rpsTotalLabel: document.getElementById('rps-total-label'),
        rpsChart: document.getElementById('rps-chart'),

        endpointSearch: document.getElementById('endpoint-search'),
        endpointsBody: document.getElementById('endpoints-tbody'),
        recentBody: document.getElementById('recent-tbody'),
        resourcesBody: document.getElementById('resources-body'),

        btnRefresh: document.getElementById('btn-refresh'),
        btnRetry: document.getElementById('btn-retry'),
        offlineDetail: document.getElementById('offline-detail')
    };

    var chartHistory = [];
    var hasLoadedOnce = false;
    var endpointSearchTimer = null;

    function fmtNumber(n) {
        if (n === null || n === undefined) return '—';
        return Number(n).toLocaleString('id-ID');
    }

    function fmtStatusPill(status) {
        var cls = 'status-2xx';
        if (status >= 500) cls = 'status-5xx';
        else if (status >= 400) cls = 'status-4xx';
        return '<span class="status-pill ' + cls + '">' + status + '</span>';
    }

    function fmtTime(iso) {
        try {
            var d = new Date(iso);
            return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        } catch (e) {
            return '-';
        }
    }

    function setStatusBanner(mode, text) {
        els.statusBanner.className = 'status-banner status-banner-' + mode;
        els.statusText.textContent = text;
        els.liveBadge.style.display = mode === 'online' ? 'flex' : 'none';
    }

    async function fetchJSON(url) {
        var res = await fetch(url, { headers: { accept: 'application/json' } });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
    }

    /* ===================== STATS ===================== */

    function renderStats(data) {
        if (data.status === 'unavailable') {
            setStatusBanner('limited', data.message || 'Server Monitor belum dikonfigurasi.');
            showOffline(false);
            return;
        }

        if (data.status === 'offline') {
            setStatusBanner('offline', data.message || 'Monitor sedang offline.');
            if (!hasLoadedOnce) showOffline(true, data.detail);
            return;
        }

        setStatusBanner('online', 'API Online — data diperbarui otomatis');
        showOffline(false);

        els.users.textContent = fmtNumber(data.totalUsers);
        els.requests.textContent = fmtNumber(data.totalRequests);
        els.endpoints.textContent = fmtNumber(data.totalEndpoints);
        els.active.textContent = fmtNumber(data.activeRequests);
        els.avgResponse.textContent = (data.averageResponseTime ?? '—') + (data.averageResponseTime != null ? ' ms' : '');
        els.success.textContent = (data.successRate ?? '—') + '%';
        els.error.textContent = (data.errorRate ?? '—') + '%';
        els.today.textContent = fmtNumber(data.requestsToday);

        var r5 = data.rps?.last5s ?? 0;
        var r15 = data.rps?.last15s ?? 0;
        var r60 = data.rps?.last60s ?? 0;

        els.rps5s.textContent = r5.toFixed(2);
        els.rps15s.textContent = r15.toFixed(2);
        els.rps60s.textContent = r60.toFixed(2);
        els.rpsTotalLabel.textContent = fmtNumber(data.totalRequests) + ' total';

        chartHistory.push(r5);
        if (chartHistory.length > MAX_CHART_POINTS) chartHistory.shift();
        drawChart();

        if (!hasLoadedOnce) {
            hasLoadedOnce = true;
            els.skeleton.classList.add('hidden');
            els.content.classList.remove('hidden');
        }
    }

    function showOffline(show, detail) {
        if (show) {
            els.skeleton.classList.add('hidden');
            els.content.classList.add('hidden');
            els.offline.classList.remove('hidden');
            if (els.offlineDetail) {
                if (detail) {
                    els.offlineDetail.textContent = detail;
                    els.offlineDetail.classList.remove('hidden');
                } else {
                    els.offlineDetail.classList.add('hidden');
                }
            }
        } else {
            els.offline.classList.add('hidden');
        }
    }

    async function pollStats() {
        try {
            var data = await fetchJSON('/api/monitor/stats');
            renderStats(data);
        } catch (e) {
            setStatusBanner('offline', 'Tidak dapat terhubung ke server.');
            if (!hasLoadedOnce) showOffline(true, e && e.message);
        }
    }

    /* ===================== CHART (canvas, no deps) ===================== */

    function drawChart() {
        var canvas = els.rpsChart;
        if (!canvas || !canvas.getContext) return;

        var dpr = window.devicePixelRatio || 1;
        var rect = canvas.getBoundingClientRect();
        var width = rect.width || canvas.parentElement.clientWidth;
        var height = 120;

        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.height = height + 'px';

        var ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);

        if (chartHistory.length < 2) return;

        var max = Math.max.apply(null, chartHistory.concat([1]));
        var padding = 8;
        var stepX = (width - padding * 2) / (MAX_CHART_POINTS - 1);
        // Kairoo cuma punya satu tampilan default (dark) sekarang - tidak ada
        // toggle tema lagi, jadi warna chart tidak perlu dicek kondisional.
        var isDark = true;

        ctx.beginPath();
        chartHistory.forEach(function (val, i) {
            var x = padding + i * stepX;
            var y = height - padding - (val / max) * (height - padding * 2);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });

        ctx.lineTo(padding + (chartHistory.length - 1) * stepX, height - padding);
        ctx.lineTo(padding, height - padding);
        ctx.closePath();
        ctx.fillStyle = isDark ? 'rgba(124,77,255,.25)' : 'rgba(124,77,255,.15)';
        ctx.fill();

        ctx.beginPath();
        chartHistory.forEach(function (val, i) {
            var x = padding + i * stepX;
            var y = height - padding - (val / max) * (height - padding * 2);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = '#8B5CF6';
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        ctx.stroke();
    }

    /* ===================== TOP ENDPOINTS ===================== */

    async function pollEndpoints(query) {
        try {
            var url = '/api/monitor/endpoints?limit=15' + (query ? '&q=' + encodeURIComponent(query) : '');
            var data = await fetchJSON(url);

            if (data.status !== 'online' || !data.result || !data.result.length) {
                els.endpointsBody.innerHTML = '<tr><td colspan="6" class="table-empty">Belum ada data endpoint.</td></tr>';
                return;
            }

            els.endpointsBody.innerHTML = data.result.map(function (row) {
                return '<tr>' +
                    '<td>' + row.endpoint + '</td>' +
                    '<td>' + row.method + '</td>' +
                    '<td>' + fmtNumber(row.requests) + '</td>' +
                    '<td>' + fmtNumber(row.success) + '</td>' +
                    '<td>' + fmtNumber(row.error) + '</td>' +
                    '<td>' + row.avgResponse + ' ms</td>' +
                    '</tr>';
            }).join('');
        } catch (e) {
            els.endpointsBody.innerHTML = '<tr><td colspan="6" class="table-empty">Gagal memuat data.</td></tr>';
        }
    }

    /* ===================== RECENT REQUESTS ===================== */

    async function pollRecent() {
        try {
            var data = await fetchJSON('/api/monitor/recent?limit=20');

            if (data.status !== 'online' || !data.result || !data.result.length) {
                els.recentBody.innerHTML = '<tr><td colspan="5" class="table-empty">Belum ada request tercatat.</td></tr>';
                return;
            }

            els.recentBody.innerHTML = data.result.map(function (row) {
                return '<tr>' +
                    '<td>' + fmtTime(row.time) + '</td>' +
                    '<td>' + row.method + '</td>' +
                    '<td>' + row.endpoint + '</td>' +
                    '<td>' + fmtStatusPill(row.status) + '</td>' +
                    '<td>' + row.responseTime + ' ms</td>' +
                    '</tr>';
            }).join('');
        } catch (e) {
            els.recentBody.innerHTML = '<tr><td colspan="5" class="table-empty">Gagal memuat data.</td></tr>';
        }
    }

    /* ===================== RESOURCES ===================== */

    async function pollResources() {
        try {
            var data = await fetchJSON('/api/monitor/resources');

            if (data.status === 'limited') {
                els.resourcesBody.innerHTML =
                    '<div class="resource-note">' + data.message + ' (runtime: ' + data.runtime + ')</div>' +
                    '<div class="resource-item"><span class="r-label">HEAP USED</span><span class="r-value">' +
                    Math.round(data.processMemory.heapUsed / 1024 / 1024) + ' MB</span></div>' +
                    '<div class="resource-item"><span class="r-label">UPTIME</span><span class="r-value">' + (data.uptime || '—') + '</span></div>' +
                    '<div class="resource-item"><span class="r-label">NODE VERSION</span><span class="r-value">' + data.nodeVersion + '</span></div>';
                return;
            }

            els.resourcesBody.innerHTML =
                '<div class="resource-item"><span class="r-label">CPU CORES</span><span class="r-value">' + data.cpu.cores + '</span></div>' +
                '<div class="resource-item"><span class="r-label">LOAD AVG</span><span class="r-value">' + data.cpu.loadAvg + '</span></div>' +
                '<div class="resource-item"><span class="r-label">RAM USAGE</span><span class="r-value">' + data.memory.percent + '%</span></div>' +
                '<div class="resource-item"><span class="r-label">RAM (MB)</span><span class="r-value">' + data.memory.usedMB + ' / ' + data.memory.totalMB + '</span></div>' +
                '<div class="resource-item"><span class="r-label">UPTIME</span><span class="r-value">' + data.uptime + '</span></div>' +
                '<div class="resource-item"><span class="r-label">NODE</span><span class="r-value">' + data.nodeVersion + '</span></div>';
        } catch (e) {
            els.resourcesBody.innerHTML = '<p class="table-empty">Gagal memuat data resource.</p>';
        }
    }

    /* ===================== EVENTS ===================== */

    if (els.endpointSearch) {
        els.endpointSearch.addEventListener('input', function () {
            clearTimeout(endpointSearchTimer);
            var q = els.endpointSearch.value.trim();
            endpointSearchTimer = setTimeout(function () { pollEndpoints(q); }, 300);
        });
    }

    if (els.btnRefresh) {
        els.btnRefresh.addEventListener('click', function () {
            pollStats();
            pollEndpoints(els.endpointSearch ? els.endpointSearch.value.trim() : '');
            pollRecent();
            pollResources();
            if (window.kairooToast) window.kairooToast('Data diperbarui.');
        });
    }

    if (els.btnRetry) {
        els.btnRetry.addEventListener('click', function () {
            showOffline(false);
            els.skeleton.classList.remove('hidden');
            pollStats();
        });
    }

    window.addEventListener('resize', drawChart);

    /* ===================== INIT ===================== */

    pollStats();
    pollEndpoints('');
    pollRecent();
    pollResources();

    setInterval(pollStats, POLL_STATS_MS);
    setInterval(function () {
        pollEndpoints(els.endpointSearch ? els.endpointSearch.value.trim() : '');
        pollRecent();
    }, POLL_TABLES_MS);
    setInterval(pollResources, POLL_RESOURCES_MS);
})();
