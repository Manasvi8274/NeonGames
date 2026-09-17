// Shared cross-device leaderboard client, backed by Firebase Firestore.
// Loaded after the Firebase compat SDK + shared/firebase-config.js.
//
// Every call is defensive: if Firebase hasn't been configured yet (see
// firebase-config.js) or a request fails (offline, rules rejection, etc.),
// functions no-op or resolve to empty results instead of throwing, so a
// game never breaks because of the leaderboard.
const Leaderboard = (function () {
    let db = null;
    let ready = false;

    function init(config) {
        if (!config || !config.apiKey || config.apiKey === 'YOUR_API_KEY') {
            console.info('[Leaderboard] Firebase not configured yet — leaderboard disabled, local high scores still work.');
            return;
        }
        try {
            firebase.initializeApp(config);
            db = firebase.firestore();
            ready = true;
        } catch (e) {
            console.warn('[Leaderboard] Firebase init failed:', e);
        }
    }

    function collectionFor(gameId) {
        return 'leaderboard_' + gameId;
    }

    async function getTopScores(gameId, n) {
        n = n || 10;
        if (!ready) return [];
        try {
            const snap = await db.collection(collectionFor(gameId)).orderBy('score', 'desc').limit(n).get();
            return snap.docs.map(d => d.data());
        } catch (e) {
            console.warn('[Leaderboard] getTopScores failed:', e);
            return [];
        }
    }

    async function submitScore(gameId, name, score) {
        if (!ready) return false;
        const cleanName = String(name || 'Anonymous').trim().slice(0, 20) || 'Anonymous';
        const cleanScore = Math.max(0, Math.min(999999, Number(score) || 0));
        try {
            await db.collection(collectionFor(gameId)).add({
                name: cleanName,
                score: cleanScore,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            });
            return true;
        } catch (e) {
            console.warn('[Leaderboard] submitScore failed:', e);
            return false;
        }
    }

    // Call this right after a game ends with the player's final score.
    // If it beats the current #1 for this game, prompts for a name and submits it.
    async function checkAndPromptIfRecord(gameId, finalScore) {
        if (!ready || !finalScore || finalScore <= 0) return;
        const top = await getTopScores(gameId, 1);
        const currentBest = top.length ? top[0].score : -Infinity;
        if (finalScore > currentBest) {
            openRecordModal(gameId, finalScore);
        }
    }

    // ---- Minimal modal UI, injected on demand ----
    let modalEl = null;
    function ensureModal() {
        if (modalEl) return modalEl;
        modalEl = document.createElement('div');
        modalEl.className = 'lb-modal-backdrop';
        modalEl.innerHTML = '<div class="lb-modal"><div class="lb-modal-title"></div><div class="lb-modal-body"></div></div>';
        document.body.appendChild(modalEl);
        modalEl.addEventListener('click', (e) => {
            if (e.target === modalEl) closeModal();
        });
        return modalEl;
    }

    function closeModal() {
        if (modalEl) modalEl.classList.remove('open');
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function renderList(entries) {
        if (!entries.length) return '<p class="lb-empty">No scores yet — be the first!</p>';
        return '<ol class="lb-list">' + entries.map((e, i) =>
            `<li><span class="lb-rank">#${i + 1}</span><span class="lb-name">${escapeHtml(e.name)}</span><span class="lb-score">${e.score}</span></li>`
        ).join('') + '</ol>';
    }

    function openRecordModal(gameId, finalScore) {
        const el = ensureModal();
        el.querySelector('.lb-modal-title').textContent = '🏆 NEW RECORD!';
        const body = el.querySelector('.lb-modal-body');
        body.innerHTML = `
            <p class="lb-lead">You set a new high score of <strong>${finalScore}</strong>! Enter your name for the leaderboard:</p>
            <input type="text" class="lb-name-input" maxlength="20" placeholder="Your name" autocomplete="off" />
            <div class="lb-modal-actions">
                <button class="neon-btn lb-submit-btn">Submit</button>
                <button class="neon-btn lb-skip-btn">Skip</button>
            </div>`;
        el.classList.add('open');
        const input = body.querySelector('.lb-name-input');
        input.focus();
        const submit = () => {
            const name = input.value.trim() || 'Anonymous';
            submitScore(gameId, name, finalScore).then(() => showBoard(gameId, true));
        };
        body.querySelector('.lb-submit-btn').onclick = submit;
        body.querySelector('.lb-skip-btn').onclick = closeModal;
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    }

    async function showBoard(gameId, justSubmitted) {
        const el = ensureModal();
        el.querySelector('.lb-modal-title').textContent = '🏆 LEADERBOARD';
        const body = el.querySelector('.lb-modal-body');
        body.innerHTML = '<p class="lb-loading">Loading…</p>';
        el.classList.add('open');

        if (!ready) {
            body.innerHTML = '<p class="lb-empty">Leaderboard isn\'t connected yet.<br>Ask the site owner to add a Firebase config.</p>' +
                '<div class="lb-modal-actions"><button class="neon-btn lb-skip-btn">Close</button></div>';
            body.querySelector('.lb-skip-btn').onclick = closeModal;
            return;
        }

        const top = await getTopScores(gameId, 10);
        body.innerHTML = (justSubmitted ? '<p class="lb-celebrate">Score submitted! 🎉</p>' : '') +
            renderList(top) +
            '<div class="lb-modal-actions"><button class="neon-btn lb-skip-btn">Close</button></div>';
        body.querySelector('.lb-skip-btn').onclick = closeModal;
    }

    return { init, submitScore, getTopScores, checkAndPromptIfRecord, showBoard };
})();
