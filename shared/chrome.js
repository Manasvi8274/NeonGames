// Shared "game chrome": a loading screen (waits for everything to be in
// place before the game becomes interactive), a start screen (shows
// controls, gated behind a real user gesture so audio can unlock), and an
// optional end-screen helper. Games call GameChrome.boot({...}) once.
const GameChrome = (function () {
    function el(tag, cls, html) {
        const e = document.createElement('div');
        if (cls) e.className = cls;
        if (html != null) e.innerHTML = html;
        e.dataset.role = tag;
        return e;
    }

    function mountMuteButton(container) {
        const btn = document.createElement('button');
        btn.className = 'chrome-mute-btn';
        btn.type = 'button';
        btn.title = 'Toggle sound';
        const sync = () => { btn.textContent = SFX.isMuted() ? '🔇' : '🔊'; };
        sync();
        btn.addEventListener('click', () => { SFX.toggleMuted(); sync(); SFX.play('click'); });
        container.appendChild(btn);
        return btn;
    }

    function boot(opts) {
        const container = document.querySelector(opts.container || '.game-area');
        if (!container) { if (opts.onStart) opts.onStart(); return; }
        container.style.position = container.style.position || 'relative';

        mountMuteButton(container);

        const loading = el('loading', 'chrome-overlay');
        loading.innerHTML = `
            <div class="chrome-icon">${opts.icon || '🕹️'}</div>
            <div class="chrome-spinner"></div>
            <div class="chrome-loading-text">Loading ${opts.title || 'game'}…</div>
            <div class="chrome-loading-bar-track"><div class="chrome-loading-bar-fill"></div></div>
        `;
        container.appendChild(loading);
        const fill = loading.querySelector('.chrome-loading-bar-fill');
        requestAnimationFrame(() => { fill.style.width = '35%'; });

        const minWait = new Promise(res => setTimeout(res, 500));
        const pageReady = document.readyState === 'complete'
            ? Promise.resolve()
            : new Promise(res => window.addEventListener('load', res, { once: true }));

        Promise.all([minWait, pageReady]).then(() => {
            fill.style.width = '100%';
            setTimeout(() => {
                loading.classList.add('hidden');
                setTimeout(() => loading.remove(), 400);
                showStart(container, opts);
            }, 180);
        });
    }

    function showStart(container, opts) {
        const start = el('start', 'chrome-overlay');
        const instructionsHtml = (opts.instructions || []).map(line => `<span>${line}</span>`).join('');
        start.innerHTML = `
            <div class="chrome-icon">${opts.icon || '🕹️'}</div>
            <div class="chrome-title">${opts.title || ''}</div>
            <div class="chrome-subtitle">${opts.subtitle || ''}</div>
            <div class="chrome-instructions">${instructionsHtml}</div>
            <div class="chrome-prompt">${opts.promptText || 'Press Space / Click to Start'}</div>
        `;
        container.appendChild(start);

        let started = false;
        const begin = () => {
            if (started) return;
            started = true;
            SFX.unlock();
            SFX.play('go');
            start.classList.add('hidden');
            setTimeout(() => start.remove(), 350);
            window.removeEventListener('keydown', onKey);
            start.removeEventListener('click', begin);
            if (opts.onStart) opts.onStart();
        };
        const onKey = (e) => {
            if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); begin(); }
        };
        window.addEventListener('keydown', onKey);
        start.addEventListener('click', begin);
    }

    // Optional reusable end-screen card. Returns the overlay element; caller
    // removes it (e.g. on restart) via overlay.remove().
    function showEnd(opts) {
        const container = document.querySelector(opts.container || '.game-area');
        if (!container) return null;
        const linesHtml = (opts.lines || []).map(l =>
            `<div class="chrome-result-line${l.record ? ' new-record' : ''}">${l.label}: <strong>${l.value}</strong></div>`
        ).join('');
        const end = el('end', 'chrome-overlay');
        end.innerHTML = `
            <div class="chrome-icon">${opts.icon || (opts.win ? '🏆' : '💀')}</div>
            <div class="chrome-title">${opts.title || 'Game Over'}</div>
            ${opts.badge ? `<div class="chrome-badge">${opts.badge}</div>` : ''}
            <div class="chrome-result-lines">${linesHtml}</div>
            <div class="chrome-prompt">${opts.promptText || 'Click / Press Space to play again'}</div>
        `;
        container.appendChild(end);
        requestAnimationFrame(() => end.classList.add('visible'));

        SFX.play(opts.sound || (opts.win ? 'win' : 'lose'));

        let done = false;
        const trigger = () => {
            if (done) return;
            done = true;
            window.removeEventListener('keydown', onKey);
            end.removeEventListener('click', trigger);
            end.remove();
            if (opts.onRestart) opts.onRestart();
        };
        const onKey = (e) => {
            if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); trigger(); }
        };
        window.addEventListener('keydown', onKey);
        end.addEventListener('click', trigger);
        return end;
    }

    return { boot, showEnd, mountMuteButton };
})();
