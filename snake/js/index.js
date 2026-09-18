//variables
let InputDir = { x: 0, y: 0 };
let musicStarted = false;
const food_sound = new Audio('js/food.mp3');
const gameover_sound = new Audio('js/gameover.mp3');
const move_sound = new Audio('js/move.mp3');
const music_sound = new Audio('js/music.mp3');

let speed = 5;
const baseSpeed = 5;
let lastPaintTime = 0;
let snakearr = [{ x: 13, y: 15 }];
let food = { x: 6, y: 7 };
let score = 0;
let hiscore = 0;

// Power-up system
let powerup = null;      // {x, y, type, color, label, spawnTime}
let activePower = null;  // {type, endTime}
let scoreMultiplier = 1;
let shieldActive = false;
let foodEaten = 0;

let paused = false;
let started = false;
let gameOver = false;

const POWERS = [
    { type: 'speed',   color: '#ffcc00', label: 'FAST'    },
    { type: 'slow',    color: '#00ccff', label: 'SLOW'    },
    { type: 'score2x', color: '#ff88ff', label: 'x2 SCORE' },
    { type: 'shield',  color: '#00ff88', label: 'SHIELD'  },
    { type: 'shrink',  color: '#ff6600', label: 'SHRINK'  },
];

function randomCell() {
    const a = 2, b = 16;
    return { x: Math.round(a + (b - a) * Math.random()), y: Math.round(a + (b - a) * Math.random()) };
}

function spawnPowerup() {
    const p = POWERS[Math.floor(Math.random() * POWERS.length)];
    powerup = { ...randomFreeCell(snakearr), ...p, spawnTime: Date.now() };
}

function applyPower(type) {
    // Clear existing timed power
    if (activePower) {
        speed = baseSpeed;
        scoreMultiplier = 1;
        activePower = null;
    }
    switch (type) {
        case 'speed':
            speed = baseSpeed * 2;
            activePower = { type, endTime: Date.now() + 5000 };
            break;
        case 'slow':
            speed = Math.max(2, Math.floor(baseSpeed * 0.5));
            activePower = { type, endTime: Date.now() + 5000 };
            break;
        case 'score2x':
            scoreMultiplier = 2;
            activePower = { type, endTime: Date.now() + 8000 };
            break;
        case 'shield':
            shieldActive = true;
            document.getElementById('board').classList.add('shield-on');
            break;
        case 'shrink':
            if (snakearr.length > 2) snakearr = snakearr.slice(0, Math.ceil(snakearr.length / 2));
            break;
    }
}

function reset_hiscore() {
    hiscore = 0;
    localStorage.setItem("snake-hiscore", JSON.stringify(hiscore));
}

// Manual restart from the sidebar button — mirrors the game-over reset in
// gameEngine() so the mid-game state always ends up consistent either way.
function restartGame() {
    speed = baseSpeed;
    scoreMultiplier = 1;
    shieldActive = false;
    document.getElementById('board').classList.remove('shield-on');
    activePower = null;
    foodEaten = 0;
    powerup = null;
    musicStarted = false;
    InputDir = { x: 0, y: 0 };
    snakearr = [{ x: 13, y: 15 }];
    score = 0;
    scoreBox.innerHTML = score;
    if (paused) togglePause();
}

function togglePause() {
    if (!started || gameOver) return;
    paused = !paused;
    const btn = document.getElementById('pauseBtn');
    const overlay = document.getElementById('pauseOverlay');
    if (btn) {
        btn.textContent = paused ? '▶ Resume' : '⏸ Pause';
        btn.classList.toggle('paused', paused);
    }
    if (overlay) overlay.style.display = paused ? 'flex' : 'none';
    if (paused) music_sound.pause();
    else if (musicStarted) music_sound.play();
}

function updatePowerHUD() {
    const hud = document.getElementById('powerHUD');
    if (!hud) return;
    if (activePower) {
        const p = POWERS.find(p => p.type === activePower.type);
        const sec = Math.max(0, Math.ceil((activePower.endTime - Date.now()) / 1000));
        hud.innerHTML = `<span>${p.label}</span><small>${sec}s</small>`;
        hud.style.color = p.color;
        hud.style.borderColor = p.color;
        hud.style.display = 'flex';
    } else if (shieldActive) {
        hud.innerHTML = `<span>SHIELD</span>`;
        hud.style.color = '#00ff88';
        hud.style.borderColor = '#00ff88';
        hud.style.display = 'flex';
    } else {
        hud.style.display = 'none';
    }
}

function main(ctime) {
    window.requestAnimationFrame(main);
    hiscoreBox.innerHTML = hiscore;

    // Expire active power
    if (activePower && Date.now() > activePower.endTime) {
        speed = baseSpeed;
        scoreMultiplier = 1;
        activePower = null;
    }
    // Expire on-board powerup after 7s
    if (powerup && Date.now() - powerup.spawnTime > 7000) powerup = null;

    updatePowerHUD();

    if (paused || !started || gameOver) return;
    if ((ctime - lastPaintTime) / 1000 < 1 / speed) return;
    lastPaintTime = ctime;
    gameEngine();
}

function isCollide(snakearr) {
    for (let i = 1; i < snakearr.length; i++) {
        if (snakearr[i].x === snakearr[0].x && snakearr[i].y === snakearr[0].y) return true;
    }
    if (snakearr[0].x >= 18 || snakearr[0].x <= 0 || snakearr[0].y >= 18 || snakearr[0].y <= 0) return true;
    return false;
}

function isFreeCell(x, y, snakearr) {
    if (x >= 18 || x <= 0 || y >= 18 || y <= 0) return false;
    for (let i = 0; i < snakearr.length; i++) {
        if (snakearr[i].x === x && snakearr[i].y === y) return false;
    }
    return true;
}

const DIRECTIONS = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];

// Picks a direction out of a shield-save that avoids reversing 180 into the
// path just travelled, preferring a perpendicular cell that's actually free.
function pickShieldEscapeDir(head, failedDir, snakearr) {
    const reverseDir = { x: -failedDir.x, y: -failedDir.y };
    const candidates = DIRECTIONS.filter(d =>
        !(d.x === failedDir.x && d.y === failedDir.y) &&
        !(d.x === reverseDir.x && d.y === reverseDir.y)
    );
    for (const d of candidates) {
        if (isFreeCell(head.x + d.x, head.y + d.y, snakearr)) return d;
    }
    // Dead end: only the reverse direction is free
    if (isFreeCell(head.x + reverseDir.x, head.y + reverseDir.y, snakearr)) return reverseDir;
    return { x: 0, y: 0 };
}

function randomFreeCell(snakearr) {
    const occupied = new Set(snakearr.map(s => `${s.x},${s.y}`));
    const free = [];
    for (let x = 2; x <= 16; x++) {
        for (let y = 2; y <= 16; y++) {
            if (!occupied.has(`${x},${y}`)) free.push({ x, y });
        }
    }
    if (free.length === 0) return randomCell();
    return free[Math.floor(Math.random() * free.length)];
}

function gameEngine() {
    if (isCollide(snakearr)) {
        if (shieldActive) {
            // Use shield: undo the colliding move, then auto-steer onto a free path
            shieldActive = false;
            document.getElementById('board').classList.remove('shield-on');
            const failedDir = { x: InputDir.x, y: InputDir.y };
            snakearr[0].x -= failedDir.x;
            snakearr[0].y -= failedDir.y;
            InputDir = pickShieldEscapeDir(snakearr[0], failedDir, snakearr);
        } else {
            gameover_sound.play();
            music_sound.pause();
            gameOver = true;
            InputDir = { x: 0, y: 0 };
            const finalScore = score;
            const isRecord = finalScore > 0 && finalScore >= hiscore;
            GameChrome.showEnd({
                container: '.game-area',
                icon: isRecord ? '🏆' : '🐍',
                title: 'GAME OVER',
                win: isRecord,
                sound: isRecord ? 'record' : undefined,
                badge: isRecord ? 'NEW HIGH SCORE!' : '',
                lines: [
                    { label: 'Score', value: finalScore, record: isRecord },
                    { label: 'Hi Score', value: hiscore },
                ],
                onRestart: () => { gameOver = false; restartGame(); },
            });
            if (window.Leaderboard) Leaderboard.checkAndPromptIfRecord('snake', finalScore);
        }
    }

    // Food collision
    if (snakearr[0].y === food.y && snakearr[0].x === food.x) {
        food_sound.play();
        score += 1 * scoreMultiplier;
        foodEaten++;
        if (score > hiscore) {
            hiscore = score;
            localStorage.setItem("snake-hiscore", JSON.stringify(hiscore));
            hiscoreBox.innerHTML = hiscore;
        }
        scoreBox.innerHTML = score;
        snakearr.unshift({ x: snakearr[0].x + InputDir.x, y: snakearr[0].y + InputDir.y });
        food = randomFreeCell(snakearr);
        if (foodEaten % 5 === 0) spawnPowerup();
    }

    // Power-up pickup
    if (powerup && snakearr[0].x === powerup.x && snakearr[0].y === powerup.y) {
        applyPower(powerup.type);
        powerup = null;
    }

    // Move snake
    for (let i = snakearr.length - 2; i >= 0; i--) snakearr[i + 1] = { ...snakearr[i] };
    snakearr[0].x += InputDir.x;
    snakearr[0].y += InputDir.y;

    // Render board
    const board = document.getElementById('board');
    board.innerHTML = "";

    snakearr.forEach((e, index) => {
        const el = document.createElement('div');
        el.style.gridRowStart = e.y;
        el.style.gridColumnStart = e.x;
        if (index === 0) {
            el.classList.add('head');
            if (shieldActive) el.classList.add('shielded');
            // Direction for eyes
            if (InputDir.x === 1)       el.classList.add('dir-right');
            else if (InputDir.x === -1) el.classList.add('dir-left');
            else if (InputDir.y === -1) el.classList.add('dir-up');
            else                        el.classList.add('dir-down');
        } else {
            el.classList.add('snake');
        }
        board.appendChild(el);
    });

    // Food — apple emoji
    const fe = document.createElement('div');
    fe.style.gridRowStart = food.y;
    fe.style.gridColumnStart = food.x;
    fe.classList.add('food');
    fe.innerHTML = '🍎';
    board.appendChild(fe);

    // Powerup on board
    if (powerup) {
        const pe = document.createElement('div');
        pe.style.gridRowStart = powerup.y;
        pe.style.gridColumnStart = powerup.x;
        pe.classList.add('powerup-cell');
        pe.style.setProperty('--pu-color', powerup.color);
        board.appendChild(pe);
    }
}

// Init hiscore
hiscore = localStorage.getItem("snake-hiscore");
if (hiscore === null) {
    hiscore = 0;
    localStorage.setItem("snake-hiscore", JSON.stringify(hiscore));
} else {
    hiscore = JSON.parse(localStorage.getItem("snake-hiscore"));
}

window.requestAnimationFrame(main);

window.addEventListener('keydown', e => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
    if (e.key === "Escape") { togglePause(); return; }
    if (!started || gameOver || paused) return;
    move_sound.play();
    if (!musicStarted) { music_sound.play(); musicStarted = true; }
    switch (e.key) {
        case "ArrowUp":    InputDir.x = 0;  InputDir.y = -1; break;
        case "ArrowDown":  InputDir.x = 0;  InputDir.y = 1;  break;
        case "ArrowLeft":  InputDir.x = -1; InputDir.y = 0;  break;
        case "ArrowRight": InputDir.x = 1;  InputDir.y = 0;  break;
        case "p":
        case "P":          togglePause(); return;
    }
});

GameChrome.boot({
    container: '.game-area',
    icon: '🐍',
    title: 'SNAKE',
    subtitle: 'Classic snake with power-ups and a shield.',
    instructions: [
        '<kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> to move',
        'Grab glowing power-ups for speed, shields & more',
        '<kbd>P</kbd> / <kbd>ESC</kbd> to pause',
    ],
    promptText: 'Press Space / Click to Start',
    onStart: () => { started = true; },
});
