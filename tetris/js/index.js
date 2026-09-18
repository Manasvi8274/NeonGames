// Tetris — 10x20 well, 7-bag randomizer (every 7 pieces contains one of
// each shape exactly once, so you're never starved of a piece), basic wall
// kicks on rotation, hold, ghost piece, and standard-ish scoring.

const COLS = 10;
const ROWS = 20;
const HI_KEY = 'tetris-hiscore';

const COLORS = {
    I: '#00e5ff', O: '#ffd23f', T: '#b388ff',
    S: '#39d98a', Z: '#ff3860', J: '#2979ff', L: '#ff9500',
};

// Each shape: 4 rotation states, each a list of [x,y] cell offsets in a 4x4 box.
const SHAPES = {
    I: [
        [[0, 1], [1, 1], [2, 1], [3, 1]],
        [[2, 0], [2, 1], [2, 2], [2, 3]],
        [[0, 2], [1, 2], [2, 2], [3, 2]],
        [[1, 0], [1, 1], [1, 2], [1, 3]],
    ],
    O: [
        [[1, 0], [2, 0], [1, 1], [2, 1]],
        [[1, 0], [2, 0], [1, 1], [2, 1]],
        [[1, 0], [2, 0], [1, 1], [2, 1]],
        [[1, 0], [2, 0], [1, 1], [2, 1]],
    ],
    T: [
        [[1, 0], [0, 1], [1, 1], [2, 1]],
        [[1, 0], [1, 1], [2, 1], [1, 2]],
        [[0, 1], [1, 1], [2, 1], [1, 2]],
        [[1, 0], [0, 1], [1, 1], [1, 2]],
    ],
    S: [
        [[1, 0], [2, 0], [0, 1], [1, 1]],
        [[1, 0], [1, 1], [2, 1], [2, 2]],
        [[1, 1], [2, 1], [0, 2], [1, 2]],
        [[0, 0], [0, 1], [1, 1], [1, 2]],
    ],
    Z: [
        [[0, 0], [1, 0], [1, 1], [2, 1]],
        [[2, 0], [1, 1], [2, 1], [1, 2]],
        [[0, 1], [1, 1], [1, 2], [2, 2]],
        [[1, 0], [0, 1], [1, 1], [0, 2]],
    ],
    J: [
        [[0, 0], [0, 1], [1, 1], [2, 1]],
        [[1, 0], [2, 0], [1, 1], [1, 2]],
        [[0, 1], [1, 1], [2, 1], [2, 2]],
        [[1, 0], [1, 1], [0, 2], [1, 2]],
    ],
    L: [
        [[2, 0], [0, 1], [1, 1], [2, 1]],
        [[1, 0], [1, 1], [1, 2], [2, 2]],
        [[0, 1], [1, 1], [2, 1], [0, 2]],
        [[0, 0], [1, 0], [1, 1], [1, 2]],
    ],
};
const KICKS = [[0, 0], [-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1], [0, 1], [-2, 0], [2, 0]];

let board, context;
let cellSize;
let grid = [];
let current = null;   // {type, rot, x, y}
let held = null;
let canHold = true;
let bag = [];
let nextQueue = [];

let score = 0, hiscore = 0, level = 1, lines = 0;
let started = false, paused = false, gameOver = false;
let dropTimer = 0, lastFrame = 0;
let clearingRows = [];
let clearFlashUntil = 0;
let softDropping = false;

let nextCtx, holdCtx;

function lm() { return document.body.classList.contains('light-mode'); }

function refillBag() {
    const types = Object.keys(SHAPES);
    for (let i = types.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [types[i], types[j]] = [types[j], types[i]];
    }
    bag.push(...types);
}

function nextFromQueue() {
    if (nextQueue.length < 4) { refillBag(); nextQueue.push(...bag.splice(0, bag.length)); }
    return nextQueue.shift();
}

function newGrid() {
    const g = [];
    for (let r = 0; r < ROWS; r++) g.push(new Array(COLS).fill(null));
    return g;
}

function spawnPiece(type) {
    return { type, rot: 0, x: 3, y: -1 };
}

function cellsFor(piece) {
    return SHAPES[piece.type][piece.rot].map(([cx, cy]) => [piece.x + cx, piece.y + cy]);
}

function collides(piece) {
    for (const [x, y] of cellsFor(piece)) {
        if (x < 0 || x >= COLS || y >= ROWS) return true;
        if (y >= 0 && grid[y][x]) return true;
    }
    return false;
}

function tryMove(dx, dy) {
    const moved = { ...current, x: current.x + dx, y: current.y + dy };
    if (collides(moved)) return false;
    current = moved;
    return true;
}

function tryRotate(dir) {
    const newRot = (current.rot + dir + 4) % 4;
    for (const [kx, ky] of KICKS) {
        const rotated = { ...current, rot: newRot, x: current.x + kx, y: current.y + ky };
        if (!collides(rotated)) {
            current = rotated;
            SFX.play('rotate');
            return true;
        }
    }
    return false;
}

function ghostY() {
    let gy = current.y;
    while (!collides({ ...current, y: gy + 1 })) gy++;
    return gy;
}

function lockPiece() {
    for (const [x, y] of cellsFor(current)) {
        if (y >= 0) grid[y][x] = COLORS[current.type];
    }
    const full = [];
    for (let r = 0; r < ROWS; r++) {
        if (grid[r].every(c => c)) full.push(r);
    }
    if (full.length) {
        clearingRows = full;
        clearFlashUntil = performance.now() + 220;
        SFX.play(full.length >= 4 ? 'line' : 'break');
        setTimeout(() => finishClear(full), 220);
    } else {
        spawnNext();
    }
    canHold = true;
}

function finishClear(full) {
    grid = grid.filter((_, r) => !full.includes(r));
    while (grid.length < ROWS) grid.unshift(new Array(COLS).fill(null));
    clearingRows = [];

    const points = [0, 100, 300, 500, 800][full.length] * level;
    score += points;
    lines += full.length;
    const newLevel = Math.floor(lines / 10) + 1;
    if (newLevel > level) { level = newLevel; SFX.play('powerup'); }
    if (score > hiscore) { hiscore = score; localStorage.setItem(HI_KEY, String(hiscore)); }
    updateHud();
    spawnNext();
}

function spawnNext() {
    const type = nextFromQueue();
    current = spawnPiece(type);
    if (collides(current)) {
        endGame();
        return;
    }
    dropTimer = 0;
}

function hold() {
    if (!canHold || gameOver || !started || paused) return;
    SFX.play('select');
    if (held === null) {
        held = current.type;
        spawnNext();
    } else {
        const t = held;
        held = current.type;
        current = spawnPiece(t);
        if (collides(current)) { endGame(); return; }
    }
    canHold = false;
    drawPreview(holdCtx, held);
}

function hardDrop() {
    let dist = 0;
    while (!collides({ ...current, y: current.y + 1 })) { current.y++; dist++; }
    score += dist * 2;
    SFX.play('drop');
    updateHud();
    lockPiece();
}

function updateHud() {
    document.getElementById('scoreBox').textContent = score;
    document.getElementById('hiscoreBox').textContent = hiscore;
    document.getElementById('levelBox').textContent = level;
    document.getElementById('linesBox').textContent = lines;
}

function resetHiscore() {
    hiscore = 0;
    localStorage.setItem(HI_KEY, '0');
    updateHud();
}

function togglePause() {
    if (!started || gameOver) return;
    paused = !paused;
    const btn = document.getElementById('pauseBtn');
    btn.textContent = paused ? '▶ Resume' : '⏸ Pause';
    btn.classList.toggle('paused', paused);
    document.getElementById('pauseOverlay').style.display = paused ? 'flex' : 'none';
    SFX.play('pause');
    lastFrame = 0;
}

function startNewGame() {
    grid = newGrid();
    bag = [];
    nextQueue = [];
    held = null;
    canHold = true;
    score = 0; level = 1; lines = 0;
    gameOver = false;
    started = true;
    paused = false;
    dropTimer = 0;
    lastFrame = 0;
    updateHud();
    spawnNext();
    drawPreview(holdCtx, null);
}

function endGame() {
    gameOver = true;
    const isRecord = score > 0 && score >= hiscore;
    GameChrome.showEnd({
        container: '.game-area',
        icon: isRecord ? '🏆' : '🧱',
        title: 'GAME OVER',
        win: isRecord,
        sound: isRecord ? 'record' : undefined,
        badge: isRecord ? 'NEW HIGH SCORE!' : '',
        lines: [
            { label: 'Score', value: score, record: isRecord },
            { label: 'Level reached', value: level },
            { label: 'Lines cleared', value: lines },
        ],
        onRestart: startNewGame,
    });
    if (typeof Leaderboard !== 'undefined') Leaderboard.checkAndPromptIfRecord('tetris', score);
}

function dropIntervalMs() {
    return Math.max(80, 1000 - (level - 1) * 75);
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

// Lightens (positive amt) or darkens (negative) a "#rrggbb" color.
function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const clamp = (v) => Math.max(0, Math.min(255, v));
    const r = clamp(((n >> 16) & 255) + amt);
    const g = clamp(((n >> 8) & 255) + amt);
    const b = clamp((n & 255) + amt);
    return `rgb(${r},${g},${b})`;
}

// Draws a beveled 3D block: a classic raised-button bevel (light top/left
// strip, dark bottom/right strip framing a flat face) rather than a flat
// fill, so locked pieces read as solid cubes instead of colored squares.
function drawCell(ctx, px, py, size, color, alpha) {
    const a = alpha != null ? alpha : 1;
    const x0 = px + 1, y0 = py + 1, s = size - 2;
    const b = Math.max(2, s * 0.18);
    const x1 = x0 + s, y1 = y0 + s;
    const ix0 = x0 + b, iy0 = y0 + b, ix1 = x1 - b, iy1 = y1 - b;

    ctx.save();
    ctx.globalAlpha = a;
    ctx.shadowBlur = 7;
    ctx.shadowColor = color;

    // Light bevel (top + left strip)
    ctx.beginPath();
    ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); ctx.lineTo(ix1, iy0);
    ctx.lineTo(ix0, iy0); ctx.lineTo(ix0, iy1); ctx.lineTo(x0, y1);
    ctx.closePath();
    ctx.fillStyle = shade(color, 60);
    ctx.fill();

    // Dark bevel (bottom + right strip)
    ctx.beginPath();
    ctx.moveTo(x1, y0); ctx.lineTo(x1, y1); ctx.lineTo(x0, y1);
    ctx.lineTo(ix0, iy1); ctx.lineTo(ix1, iy1); ctx.lineTo(ix1, iy0);
    ctx.closePath();
    ctx.fillStyle = shade(color, -55);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Flat face
    ctx.fillStyle = color;
    ctx.fillRect(ix0, iy0, ix1 - ix0, iy1 - iy0);
    ctx.globalAlpha = a * 0.4;
    ctx.fillStyle = '#fff';
    ctx.fillRect(ix0 + 1, iy0 + 1, Math.max(0, ix1 - ix0 - 2), Math.max(0, (iy1 - iy0) * 0.3));
    ctx.restore();
}

function draw(now) {
    context.fillStyle = lm() ? '#eef1fb' : '#0a0a12';
    context.fillRect(0, 0, board.width, board.height);

    // grid lines
    context.strokeStyle = lm() ? 'rgba(60,70,120,0.12)' : 'rgba(255,255,255,0.05)';
    context.lineWidth = 1;
    for (let c = 0; c <= COLS; c++) {
        context.beginPath();
        context.moveTo(c * cellSize, 0);
        context.lineTo(c * cellSize, ROWS * cellSize);
        context.stroke();
    }
    for (let r = 0; r <= ROWS; r++) {
        context.beginPath();
        context.moveTo(0, r * cellSize);
        context.lineTo(COLS * cellSize, r * cellSize);
        context.stroke();
    }

    const flashing = clearingRows.length && now < clearFlashUntil;

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const color = grid[r][c];
            if (!color) continue;
            if (flashing && clearingRows.includes(r)) {
                drawCell(context, c * cellSize, r * cellSize, cellSize, '#ffffff', 0.9);
            } else {
                drawCell(context, c * cellSize, r * cellSize, cellSize, color);
            }
        }
    }

    if (current && started && !gameOver) {
        const gy = ghostY();
        const ghostPiece = { ...current, y: gy };
        cellsFor(ghostPiece).forEach(([x, y]) => {
            if (y >= 0) drawCell(context, x * cellSize, y * cellSize, cellSize, COLORS[current.type], 0.18);
        });
        cellsFor(current).forEach(([x, y]) => {
            if (y >= 0) drawCell(context, x * cellSize, y * cellSize, cellSize, COLORS[current.type]);
        });
    }
}

function drawPreview(ctx, type) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    if (!type) return;
    const shape = SHAPES[type][0];
    const size = 14;
    const xs = shape.map(p => p[0]), ys = shape.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const w = (maxX - minX + 1) * size, h = (maxY - minY + 1) * size;
    const offX = (ctx.canvas.width - w) / 2 - minX * size;
    const offY = (ctx.canvas.height - h) / 2 - minY * size;
    shape.forEach(([x, y]) => drawCell(ctx, offX + x * size, offY + y * size, size, COLORS[type]));
}

function loop(now) {
    requestAnimationFrame(loop);
    if (!started || paused || gameOver) { draw(now); return; }
    const dt = lastFrame ? now - lastFrame : 0;
    lastFrame = now;

    if (!clearingRows.length) {
        dropTimer += dt;
        const interval = softDropping ? Math.min(dropIntervalMs(), 50) : dropIntervalMs();
        if (dropTimer >= interval) {
            dropTimer = 0;
            if (!tryMove(0, 1)) {
                lockPiece();
            } else if (softDropping) {
                score += 1;
                updateHud();
            }
        }
    }

    draw(now);
    if (nextQueue.length) drawPreview(nextCtx, nextQueue[0]);
}

// Shared by keyboard and the on-screen touch buttons.
function canAct() { return started && !paused && !gameOver && !clearingRows.length; }
function actionMoveLeft()  { if (canAct() && tryMove(-1, 0)) SFX.play('move'); }
function actionMoveRight() { if (canAct() && tryMove(1, 0)) SFX.play('move'); }
function actionRotateCW()  { if (canAct()) tryRotate(1); }
function actionRotateCCW() { if (canAct()) tryRotate(-1); }
function actionHardDrop()  { if (canAct()) hardDrop(); }
function actionHold()      { if (canAct()) hold(); }
function actionSoftDropStart() { if (canAct()) softDropping = true; }
function actionSoftDropEnd()   { softDropping = false; }

function onKeyDown(e) {
    if (e.key === 'Escape') { e.preventDefault(); togglePause(); return; }
    if (!canAct()) return;
    switch (e.code) {
        case 'ArrowLeft': e.preventDefault(); actionMoveLeft(); break;
        case 'ArrowRight': e.preventDefault(); actionMoveRight(); break;
        case 'ArrowDown': e.preventDefault(); actionSoftDropStart(); break;
        case 'ArrowUp': case 'KeyX': e.preventDefault(); actionRotateCW(); break;
        case 'KeyZ': e.preventDefault(); actionRotateCCW(); break;
        case 'Space': e.preventDefault(); actionHardDrop(); break;
        case 'KeyC': case 'ShiftLeft': case 'ShiftRight': e.preventDefault(); actionHold(); break;
    }
}
function onKeyUp(e) {
    if (e.code === 'ArrowDown') actionSoftDropEnd();
}

// Binds a touch button to an action, firing on touchstart (not click) for
// zero-latency response, and supporting press-and-hold for repeatable
// actions like moving/soft-dropping.
function bindTouchButton(id, onDown, onUp, repeatMs) {
    const el = document.getElementById(id);
    if (!el) return;
    let repeatTimer = null;
    const start = (e) => {
        e.preventDefault();
        onDown();
        if (repeatMs) {
            repeatTimer = setInterval(onDown, repeatMs);
        }
    };
    const end = (e) => {
        if (e) e.preventDefault();
        if (repeatTimer) { clearInterval(repeatTimer); repeatTimer = null; }
        if (onUp) onUp();
    };
    el.addEventListener('touchstart', start, { passive: false });
    el.addEventListener('touchend', end, { passive: false });
    el.addEventListener('touchcancel', end, { passive: false });
}

function setupTouchControls() {
    bindTouchButton('btnLeft', actionMoveLeft, null, 130);
    bindTouchButton('btnRight', actionMoveRight, null, 130);
    bindTouchButton('btnDown', actionSoftDropStart, actionSoftDropEnd);
    bindTouchButton('btnRotate', actionRotateCW);
    bindTouchButton('btnDrop', actionHardDrop);
    bindTouchButton('btnHold', actionHold);
}

function resize() {
    const tier = getScreenTier();
    const reserve = tier === 'mobile' ? 280 : tier === 'tablet' ? 220 : 140;
    const maxH = Math.min(window.innerHeight - reserve, 720);
    const maxW = window.innerWidth - 24;
    cellSize = Math.max(10, Math.floor(Math.min(maxH / ROWS, maxW / COLS)));
    board.width = cellSize * COLS;
    board.height = cellSize * ROWS;
}

function init() {
    board = document.getElementById('board');
    context = board.getContext('2d');
    resize();

    nextCtx = document.getElementById('nextCanvas').getContext('2d');
    holdCtx = document.getElementById('holdCanvas').getContext('2d');

    const stored = localStorage.getItem(HI_KEY);
    hiscore = stored === null ? 0 : parseInt(stored, 10) || 0;
    updateHud();

    grid = newGrid();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', resize);
    setupTouchControls();

    requestAnimationFrame(loop);

    GameChrome.boot({
        container: '.game-area',
        icon: '🧱',
        title: 'TETRIS',
        subtitle: 'Clear lines by filling every cell in a row.',
        instructions: [
            '<kbd>←</kbd><kbd>→</kbd> move &nbsp; <kbd>↓</kbd> soft drop &nbsp; <kbd>SPACE</kbd> hard drop',
            '<kbd>↑</kbd> / <kbd>X</kbd> rotate CW &nbsp; <kbd>Z</kbd> rotate CCW',
            '<kbd>C</kbd> hold piece &nbsp; <kbd>ESC</kbd> pause',
        ],
        promptText: 'Press Space / Click to Start',
        onStart: () => { startNewGame(); },
    });
}

init();
