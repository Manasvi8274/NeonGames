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

function selectGame(id) {
    const game = GAMES.find(g => g.id === id) || GAMES[0];
    const frame = document.getElementById('gameFrame');
    if (frame.dataset.currentGame !== game.id) {
        frame.src = `${game.folder}/index.html`;
        frame.dataset.currentGame = game.id;
    }
    history.replaceState(null, '', '?game=' + game.id);
    renderRail(game.id);
}

document.addEventListener('DOMContentLoaded', () => {
    selectGame(getRequestedGame());
});
