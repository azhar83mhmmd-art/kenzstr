fetch('/config')
    .then((res) => res.json())
    .then((config) => {
        const s = config.settings || {};
        document.getElementById('about-name').textContent = s.apiName || 'Kairoo';
        document.getElementById('about-desc').textContent = s.description || 'Tidak ada deskripsi tersedia.';
        document.getElementById('about-version').textContent = s.apiVersion || 'N/A';
        document.getElementById('about-creator').textContent = s.creator || 'N/A';
        if (s.favicon) document.getElementById('favicon').href = s.favicon;
    })
    .catch(() => {
        document.getElementById('about-desc').textContent = 'Tidak dapat memuat informasi API saat ini.';
    });
