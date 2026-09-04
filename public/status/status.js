const POLL_INTERVAL_MS = 12000;
let lastUpdatedAt = null;
let pollTimer = null;

const STATUS_LABEL = {
    operational: 'Operational',
    degraded: 'Degraded',
    down: 'Down',
    unavailable: 'Unavailable'
};

const COMPONENT_ICONS = {
    api: 'M13 2L3 14h7l-1 8 10-12h-7l1-8z',
    database: 'M4 6c0-1.66 3.58-3 8-3s8 1.34 8 3-3.58 3-8 3-8-1.34-8-3zM4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6',
    endpointSystem: 'M4 5.5C4 4.67 4.67 4 5.5 4H12v16H5.5A1.5 1.5 0 014 18.5v-13zM20 5.5c0-.83-.67-1.5-1.5-1.5H12v16h6.5a1.5 1.5 0 001.5-1.5v-13z'
};

const COMPONENT_LABEL = {
    api: 'API',
    database: 'Database',
    endpointSystem: 'Endpoint System'
};

function icon(d) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="' + d + '"/></svg>';
}

function setLiveBadge(ok) {
    const badge = document.getElementById('live-badge');
    const text = document.getElementById('live-badge-text');
    if (ok) {
        badge.className = 'k-badge live';
        text.textContent = 'LIVE';
    } else {
        badge.className = 'k-badge offline';
        text.textContent = 'OFFLINE';
    }
}

function renderOverall(data) {
    const dot = document.getElementById('overall-dot');
    const title = document.getElementById('overall-title');
    const sub = document.getElementById('overall-sub');

    const status = data.status;
    dot.className = 'k-status-big-dot ' + status;
    title.textContent = 'System ' + (STATUS_LABEL[status] || 'Unknown');
    sub.textContent = 'Terakhir diperiksa: ' + new Date(data.checkedAt).toLocaleTimeString('id-ID');
}

function renderComponents(components) {
    const grid = document.getElementById('components-grid');
    grid.innerHTML = '';

    Object.keys(components).forEach((key) => {
        const comp = components[key];
        const card = document.createElement('div');
        card.className = 'k-card k-component-card';

        const badgeClass = comp.status === 'operational' ? 'live' : (comp.status === 'unavailable' ? 'warn' : 'offline');

        card.innerHTML =
            '<div class="k-component-head">' +
                '<span class="k-stat-label">' + icon(COMPONENT_ICONS[key] || COMPONENT_ICONS.api) + (COMPONENT_LABEL[key] || key) + '</span>' +
                '<span class="k-badge ' + badgeClass + '"><span class="k-dot"></span>' + (STATUS_LABEL[comp.status] || comp.status) + '</span>' +
            '</div>' +
            '<div class="k-component-msg">' + (comp.message || '') + '</div>' +
            '<div class="k-component-meta">' + (comp.responseTime !== null && comp.responseTime !== undefined ? comp.responseTime + 'ms' : (comp.totalEndpoints !== undefined ? comp.totalEndpoints + ' endpoint' : '')) + '</div>';

        grid.appendChild(card);
    });
}

function renderTerminal(data) {
    const lines = ['api        ' + data.components.api.status];
    lines.push('database   ' + data.components.database.status);
    lines.push('endpoints  ' + data.components.endpointSystem.status + ' (' + data.components.endpointSystem.totalEndpoints + ')');
    lines.push('checked    ' + data.checkedAt);
    document.getElementById('terminal-log').textContent = lines.join('\n');
}

async function loadHealth() {
    try {
        const res = await fetch('/api/status/health', { headers: { accept: 'application/json' } });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();

        setLiveBadge(true);
        renderOverall(data);
        renderComponents(data.components);
        renderTerminal(data);
        lastUpdatedAt = Date.now();
    } catch (e) {
        setLiveBadge(false);
        document.getElementById('overall-title').textContent = 'Unable to load data';
        document.getElementById('overall-sub').textContent = 'Tidak dapat memeriksa status server saat ini.';
        document.getElementById('overall-dot').className = 'k-status-big-dot down';
    }
}

loadHealth();
pollTimer = setInterval(loadHealth, POLL_INTERVAL_MS);

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') loadHealth();
});
