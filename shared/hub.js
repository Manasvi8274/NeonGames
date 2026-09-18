const GAMES = [
    { id: 'snake',           folder: 'snake',           title: 'Snake',           emoji: '🐍', accent: '#00ff88', tagline: 'Classic snake with power-ups & a shield' },
    { id: 'brick_breaker',   folder: 'brick_breaker',   title: 'Brick Breaker',   emoji: '🧱', accent: '#0095ff', tagline: 'Break bricks, chase the high score' },
    { id: 'chess',           folder: 'chess',           title: 'Chess',          emoji: '♟️', accent: '#b388ff', tagline: 'Play a friend, or the computer' },
    { id: 'tic-tac-toe',     folder: 'tic-tac-toe',     title: 'Tic Tac Toe',    emoji: '⭕', accent: '#ff9500', tagline: 'PvP, or an unbeatable computer' },
    { id: 'archery',         folder: 'archery',         title: 'Archery',        emoji: '🏹', accent: '#ff3860', tagline: 'Aim, charge your shot, release' },
    { id: 'bottle-shooting', folder: 'bottle-shooting', title: 'Bottle Shooting', emoji: '🎯', accent: '#ff2fd0', tagline: 'Time your shot as the target sweeps by' },
    { id: 'tetris',          folder: 'tetris',          title: 'Tetris',         emoji: '🧱', accent: '#00e5ff', tagline: 'Stack, clear lines, chase the high score', isNew: true },
];

function getRequestedGame() {
    const params = new URLSearchParams(location.search);
    const id = params.get('game');
    return GAMES.find(g => g.id === id) ? id : GAMES[0].id;
}

function renderRail(activeId) {
    const rail = document.getElementById('gameRail');
    rail.innerHTML = GAMES.map((g, i) => `
        <button class="game-card${g.id === activeId ? ' active' : ''}"
                style="--card-accent: ${g.accent}; animation-delay: ${i * 60}ms"
                data-game="${g.id}"
                aria-label="Switch to ${g.title}">
            ${g.isNew ? '<span class="game-card-new">NEW</span>' : ''}
            <div class="game-card-top">
                <span class="game-card-icon-plate"><span class="game-card-emoji">${g.emoji}</span></span>
                <span class="game-card-title">${g.title}</span>
                <span class="game-card-dot"></span>
            </div>
            <div class="game-card-tagline">${g.tagline}</div>
        </button>
    `).join('');

    rail.querySelectorAll('.game-card').forEach(card => {
        card.addEventListener('click', () => selectGame(card.dataset.game));
    });
}

// On the stacked mobile/tablet layout (see shared/theme.css's 1024px
// breakpoint), .active-game-pane has a capped height so the rail below it
// stays reachable. The embedded game's own page is almost always TALLER
// than that cap, which used to leave the iframe as its own tiny, easy-to-
// miss scrollable box — a normal page scroll moves the outer hub instead
// of the iframe's content, so most of the game (and its start button)
// silently sat below the fold. Since the hub and every game are
// same-origin, we can read the loaded game's real content height and grow
// the iframe to match, so the WHOLE page scrolls as one — no nested
// scroll region to miss. Desktop's side-by-side layout is unaffected: it
// clears the inline height there and lets the existing CSS (100% of the
// row) handle it, since that layout was never the problem.
let frameResizeObserver = null;

function isStackedLayout() {
    return window.innerWidth <= 1024;
}

function syncFrameHeight() {
    const frame = document.getElementById('gameFrame');
    if (!isStackedLayout()) {
        frame.style.height = '';
        return;
    }
    try {
        const doc = frame.contentDocument;
        if (!doc || !doc.documentElement) return;
        const h = Math.max(doc.documentElement.scrollHeight, doc.body ? doc.body.scrollHeight : 0);
        // Games set `min-height: 100vh` on <body>, which is itself relative to
        // this iframe's height — so this update naturally converges to a
        // stable value in one step, but skip no-op writes under a couple of
        // px (sub-pixel rounding) so a ResizeObserver loop can't even start.
        const current = parseFloat(frame.style.height) || 0;
        if (h > 0 && Math.abs(h - current) > 2) frame.style.height = h + 'px';
    } catch (e) {
        // Cross-origin or not-yet-ready — leave the CSS fallback height in place.
    }
}

function watchFrameHeight(frame) {
    if (frameResizeObserver) frameResizeObserver.disconnect();
    syncFrameHeight();
    try {
        const doc = frame.contentDocument;
        if (doc && doc.body && 'ResizeObserver' in window) {
            frameResizeObserver = new ResizeObserver(() => syncFrameHeight());
            frameResizeObserver.observe(doc.body);
        }
    } catch (e) {
        // Same-origin should always allow this, but fail quietly either way.
    }
}

function selectGame(id) {
    const game = GAMES.find(g => g.id === id) || GAMES[0];
    const frame = document.getElementById('gameFrame');
    if (frame.dataset.currentGame !== game.id) {
        frame.style.height = '';
        frame.src = `${game.folder}/index.html`;
        frame.dataset.currentGame = game.id;
        frame.addEventListener('load', () => watchFrameHeight(frame), { once: true });
    }
    history.replaceState(null, '', '?game=' + game.id);
    renderRail(game.id);
}

window.addEventListener('resize', syncFrameHeight);

document.addEventListener('DOMContentLoaded', () => {
    selectGame(getRequestedGame());
});
