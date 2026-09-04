const form = document.getElementById('feedback-form');
const submitBtn = document.getElementById('fb-submit');
const resultEl = document.getElementById('fb-result');

form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const category = document.getElementById('fb-category').value;
    const message = document.getElementById('fb-message').value.trim();
    const name = document.getElementById('fb-name').value.trim();
    const email = document.getElementById('fb-email').value.trim();

    resultEl.textContent = '';
    resultEl.className = 'k-form-result';

    if (!category) {
        resultEl.textContent = 'Pilih kategori terlebih dahulu.';
        resultEl.classList.add('err');
        return;
    }

    if (message.length < 5) {
        resultEl.textContent = 'Pesan minimal 5 karakter.';
        resultEl.classList.add('err');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Mengirim...';

    try {
        const res = await fetch('/api/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                category,
                message,
                name: name || undefined,
                email: email || undefined
            })
        });

        const data = await res.json();

        if (!res.ok || !data.status) {
            resultEl.textContent = data.message || 'Gagal mengirim feedback.';
            resultEl.classList.add('err');
            return;
        }

        resultEl.textContent = data.message || 'Feedback berhasil dikirim. Terima kasih!';
        resultEl.classList.add('ok');
        form.reset();
    } catch (e) {
        resultEl.textContent = 'Tidak dapat terhubung ke server. Coba lagi nanti.';
        resultEl.classList.add('err');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Kirim Feedback';
    }
});
