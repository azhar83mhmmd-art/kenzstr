const minLoadTime = 500;
const startLoad = Date.now();

/* ===================== helpers ===================== */

function fmtNumber(n) {
    if (n === null || n === undefined) return 'N/A';
    return Number(n).toLocaleString('id-ID');
}

function fmtMs(n) {
    if (n === null || n === undefined) return 'N/A';
    return Math.round(Number(n)) + 'ms';
}

function fmtDateTime(iso) {
    if (!iso) return 'N/A';
    try {
        return new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
    } catch (e) {
        return 'N/A';
    }
}

function countEndpoints(tags) {
    if (!tags || typeof tags !== 'object') return null;
    let total = 0;
    for (const key of Object.keys(tags)) {
        if (Array.isArray(tags[key])) total += tags[key].length;
    }
    return total;
}

function setApiStatus(mode, text) {
    const el = document.getElementById('api-status');
    const textEl = document.getElementById('api-status-text');
    const termEl = document.getElementById('term-api');
    el.className = 'k-badge ' + mode;
    textEl.textContent = text;
    if (termEl) termEl.textContent = mode === 'live' ? 'online' : (mode === 'offline' ? 'offline' : 'unavailable');
}

/* ===================== render ===================== */

function renderConfig(config) {
    const name = config.settings.apiName || 'Kairoo';
    const desc = config.settings.description || '';

    document.getElementById('dash-title').innerText = name.toUpperCase();
    document.getElementById('dash-desc').innerText = desc;
    document.getElementById('about-text').innerText = desc ||
        'Kairoo menyediakan berbagai endpoint API untuk kebutuhan aplikasi, automasi, utilitas, dan media processing.';

    if (config.settings.favicon) {
        document.getElementById('favicon').href = config.settings.favicon;
    }

    document.getElementById('info-version').textContent = config.settings.apiVersion || 'N/A';

    if (config.runtime) {
        document.getElementById('info-environment').textContent = config.runtime.environment || 'N/A';
        document.getElementById('info-runtime').textContent = config.runtime.node ? ('Node.js ' + config.runtime.node) : 'N/A';
        document.getElementById('info-started').textContent = fmtDateTime(config.runtime.startedAt);
    }

    const endpointCount = countEndpoints(config.tags);
    document.getElementById('stat-active-endpoints').textContent = endpointCount !== null ? fmtNumber(endpointCount) : 'N/A';
}

function renderMonitorStats(data) {
    if (!data || data.status === 'unavailable') {
        setApiStatus('warn', 'API Status: Online (monitor belum dikonfigurasi)');
        document.getElementById('stat-total-requests').textContent = 'N/A';
        document.getElementById('stat-response-time').textContent = 'N/A';
        return;
    }

    if (data.status === 'offline') {
        setApiStatus('warn', 'API Status: Online (statistik tidak tersedia)');
        document.getElementById('stat-total-requests').textContent = 'N/A';
        document.getElementById('stat-response-time').textContent = 'N/A';
        return;
    }

    setApiStatus('live', 'API Status: Online');
    document.getElementById('stat-total-requests').textContent = fmtNumber(data.totalRequests);
    document.getElementById('stat-response-time').textContent = fmtMs(data.averageResponseTime);
}

async function renderUptime() {
    try {
        const res = await fetch('/api/monitor/resources', { headers: { accept: 'application/json' } });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        document.getElementById('stat-uptime').textContent = data.uptime || 'N/A';
    } catch (e) {
        document.getElementById('stat-uptime').textContent = 'N/A';
    }
}

/* ===================== init ===================== */

fetch('/config')
    .then(res => res.json())
    .then(config => {
        renderConfig(config);

        return fetch('/api/monitor/stats', { headers: { accept: 'application/json' } })
            .then(res => res.json())
            .then(renderMonitorStats)
            .catch(() => renderMonitorStats(null));
    })
    .then(() => renderUptime())
    .catch(() => {
        document.getElementById('dash-title').innerText = 'KAIROO API';
        document.getElementById('dash-desc').innerText = 'Tidak dapat memuat data API saat ini.';
        setApiStatus('offline', 'API Status: Tidak dapat terhubung');
    })
    .finally(() => {
        const elapsed = Date.now() - startLoad;
        const remaining = Math.max(0, minLoadTime - elapsed);

        setTimeout(() => {
            document.getElementById('loader').classList.add('hidden');
            document.getElementById('content').classList.remove('hidden');
        }, remaining);
    });
