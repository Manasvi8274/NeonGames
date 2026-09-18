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

    const TOP_N = 5;

    function collectionFor(gameId) {
        return 'leaderboard_' + gameId;
    }

    async function getTopScores(gameId, n) {
        n = n || TOP_N;
        if (!ready) return [];
        try {
            const snap = await db.collection(collectionFor(gameId)).orderBy('score', 'desc').limit(n).get();
            return snap.docs.map(d => d.data());
        } catch (e) {
            console.warn('[Leaderboard] getTopScores failed:', e);
            return [];
        }
    }

    // Table model: each game's leaderboard collection holds AT MOST 5
    // documents, at fixed IDs "1".."5" — the doc ID *is* the rank, and each
    // doc also carries { game, rank, name, score, timestamp } as real
    // fields, so both the Firestore console and any query show exactly the
    // GameName / Rank / Score table shape. Submitting re-reads the current
    // top 5, inserts the new score, re-sorts, and overwrites all 5 slots in
    // one atomic batch — that's what pushes the previous #5 out entirely
    // rather than just letting the collection grow unbounded.
    async function submitScore(gameId, name, score) {
        if (!ready) return false;
        const cleanName = String(name || 'Anonymous').trim().slice(0, 20) || 'Anonymous';
        const cleanScore = Math.max(0, Math.min(999999, Number(score) || 0));
        try {
            const col = db.collection(collectionFor(gameId));
            const snap = await col.orderBy('score', 'desc').limit(TOP_N).get();
            const entries = snap.docs.map(d => ({ name: d.data().name, score: d.data().score }));
            entries.push({ name: cleanName, score: cleanScore });
            entries.sort((a, b) => b.score - a.score);
            const top = entries.slice(0, TOP_N);

            const batch = db.batch();
            top.forEach((entry, i) => {
                batch.set(col.doc(String(i + 1)), {
                    game: gameId,
                    rank: i + 1,
                    name: entry.name,
                    score: entry.score,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                });
            });
            await batch.commit();
            return true;
        } catch (e) {
            console.warn('[Leaderboard] submitScore failed:', e);
            return false;
        }
    }

    // Call this right after a game ends with the player's final score. If it
    // would place in the top 5 for this game (fewer than 5 entries so far,
    // or it beats the current #5), prompts for a name and submits it.
    async function checkAndPromptIfRecord(gameId, finalScore) {
        if (!ready || !finalScore || finalScore <= 0) return;
        const top = await getTopScores(gameId, TOP_N);
        const makesTopN = top.length < TOP_N || finalScore > top[top.length - 1].score;
        if (makesTopN) {
            const isNewBest = !top.length || finalScore > top[0].score;
            openRecordModal(gameId, finalScore, isNewBest);
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

    function openRecordModal(gameId, finalScore, isNewBest) {
        const el = ensureModal();
        el.querySelector('.lb-modal-title').textContent = isNewBest ? '🏆 NEW RECORD!' : `🏆 TOP ${TOP_N} SCORE!`;
        const body = el.querySelector('.lb-modal-body');
        const lead = isNewBest
            ? `You set a new #1 high score of <strong>${finalScore}</strong>! Enter your name for the leaderboard:`
            : `You made the top ${TOP_N} with a score of <strong>${finalScore}</strong>! Enter your name for the leaderboard:`;
        body.innerHTML = `
            <p class="lb-lead">${lead}</p>
            <input type="text" class="lb-name-input" maxlength="20" placeholder="Your name" autocomplete="off" />
            <div class="lb-modal-actions">
                <button class="neon-btn lb-submit-btn">Submit</button>
                <button class="neon-btn lb-skip-btn">Skip</button>
            </div>`;
        el.classList.add('open');
        const input = body.querySelector('.lb-name-input');
        input.focus();
        const submitBtn = body.querySelector('.lb-submit-btn');
        const submit = () => {
            const name = input.value.trim() || 'Anonymous';
            submitBtn.disabled = true;
            submitBtn.textContent = 'Submitting…';
            submitScore(gameId, name, finalScore).then((success) => {
                if (success) {
                    showBoard(gameId, true);
                } else {
                    body.innerHTML = `
                        <p class="lb-empty">Couldn't reach the leaderboard — check your connection and try again.</p>
                        <div class="lb-modal-actions">
                            <button class="neon-btn lb-retry-btn">Try Again</button>
                            <button class="neon-btn lb-skip-btn">Skip</button>
                        </div>`;
                    body.querySelector('.lb-retry-btn').onclick = () => openRecordModal(gameId, finalScore, isNewBest);
                    body.querySelector('.lb-skip-btn').onclick = closeModal;
                }
            });
        };
        submitBtn.onclick = submit;
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

        const top = await getTopScores(gameId, TOP_N);
        body.innerHTML = (justSubmitted ? '<p class="lb-celebrate">Score submitted! 🎉</p>' : '') +
            renderList(top) +
            '<div class="lb-modal-actions"><button class="neon-btn lb-skip-btn">Close</button></div>';
        body.querySelector('.lb-skip-btn').onclick = closeModal;
    }

    return { init, submitScore, getTopScores, checkAndPromptIfRecord, showBoard };
})();
