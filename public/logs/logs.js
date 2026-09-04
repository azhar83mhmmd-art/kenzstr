const POLL_INTERVAL_MS = 12000;
let allLogs = [];
let searchTerm = '';

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

function statusClass(code) {
    if (code >= 500) return 's5';
    if (code >= 400) return 's4';
    return 's2';
}

function methodClass(method) {
    return String(method || '').toLowerCase();
}

function fmtTime(iso) {
    try {
        return new Date(iso).toLocaleTimeString('id-ID', { hour12: false });
    } catch (e) {
        return '—';
    }
}

function render() {
    const tbody = document.getElementById('logs-tbody');
    const filtered = searchTerm
        ? allLogs.filter((row) => row.endpoint.toLowerCase().includes(searchTerm))
        : allLogs;

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5"><div class="k-state">' +
            '<span class="k-state-title">No data available</span>' +
            '<span class="k-state-desc">Belum ada request yang tercatat.</span>' +
            '</div></td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map((row) => (
        '<tr>' +
            '<td class="k-mono-cell">' + fmtTime(row.time) + '</td>' +
            '<td><span class="k-method ' + methodClass(row.method) + '">' + row.method + '</span></td>' +
            '<td class="k-mono-cell">' + row.endpoint + '</td>' +
            '<td><span class="k-status-code ' + statusClass(row.status) + '">' + row.status + '</span></td>' +
            '<td class="k-mono-cell">' + row.responseTime + 'ms</td>' +
        '</tr>'
    )).join('');
}

async function loadLogs() {
    try {
        const res = await fetch('/api/monitor/recent?limit=100', { headers: { accept: 'application/json' } });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();

        if (data.status === 'unavailable') {
            setLiveBadge(false);
            document.getElementById('logs-tbody').innerHTML = '<tr><td colspan="5"><div class="k-state">' +
                '<span class="k-state-title">Live logs belum dikonfigurasi</span>' +
                '<span class="k-state-desc">Server Monitor (Supabase) belum diaktifkan di server ini.</span>' +
                '</div></td></tr>';
            return;
        }

        if (data.status === 'offline') {
            setLiveBadge(false);
            document.getElementById('logs-tbody').innerHTML = '<tr><td colspan="5"><div class="k-state">' +
                '<span class="k-state-title">Unable to load data</span>' +
                '<span class="k-state-desc">Tidak dapat mengambil log saat ini.</span>' +
                '</div></td></tr>';
            return;
        }

        setLiveBadge(true);
        allLogs = data.result || [];
        document.getElementById('log-updated').textContent = 'Updated ' + new Date().toLocaleTimeString('id-ID');
        render();
    } catch (e) {
        setLiveBadge(false);
        document.getElementById('logs-tbody').innerHTML = '<tr><td colspan="5"><div class="k-state">' +
            '<span class="k-state-title">Unable to load data</span>' +
            '</div></td></tr>';
    }
}

document.getElementById('log-search').addEventListener('input', (e) => {
    searchTerm = e.target.value.trim().toLowerCase();
    render();
});

loadLogs();
setInterval(loadLogs, POLL_INTERVAL_MS);
