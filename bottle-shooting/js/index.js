// Bottle Shooting — timed hitscan shooting gallery.
//
// Spawn design: bottles are placed into a FIXED array of shelf slots
// (computed once from the canvas size) built in buildSlots(). Each wave
// randomly SELECTS which of those slots are occupied (Fisher-Yates shuffle
// + take-first-N) rather than generating raw x/y coordinates and rejecting
// on overlap. That guarantees no overlap and no retry loop by construction,
// mirroring the fix applied to Snake's food/power-up spawning this session.

const ROUND_TIME = 45;       // seconds
const COMBO_WINDOW = 1500;   // ms between hits to keep the combo alive
const MAX_COMBO = 5;
const WAVE_ROWS = 3;
const WAVE_COLS = 4;

let board, context;
let boardwidth, boardheight;

let slots = [];
let bottles = [];
let particles = [];

let score = 0;
let hiscore = 0;
let combo = 1;
let lastHitTime = 0;
let timeLeft = ROUND_TIME;
let roundOver = false;
let paused = false;
let lastFrameTime = 0;
let waveDeadline = 0;
let mouseX = -100, mouseY = -100;
let accentColor = '#ff2fd0';

function lm() { return document.body.classList.contains('light-mode'); }

function buildSlots() {
    slots = [];
    const marginX = boardwidth * 0.08;
    const marginY = boardheight * 0.18;
    const shelfHeight = boardheight * 0.62;
    const cellW = (boardwidth - marginX * 2) / WAVE_COLS;
    const cellH = shelfHeight / WAVE_ROWS;
    for (let r = 0; r < WAVE_ROWS; r++) {
        for (let c = 0; c < WAVE_COLS; c++) {
            slots.push({
                x: marginX + c * cellW + cellW * 0.18,
                y: marginY + r * cellH + cellH * 0.1,
                w: cellW * 0.64,
                h: cellH * 0.8,
            });
        }
    }
}

function spawnWave() {
    const elapsed = ROUND_TIME - timeLeft;
    const occupancy = Math.min(0.9, 0.5 + (elapsed / ROUND_TIME) * 0.4); // ramps 50% -> 90%
    const indices = slots.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const count = Math.max(2, Math.round(slots.length * occupancy));
    bottles = indices.slice(0, count).map((i) => ({
        slotIndex: i,
        x: slots[i].x, y: slots[i].y, w: slots[i].w, h: slots[i].h,
    }));
    const deadlineMs = Math.max(2500, 6000 - elapsed * 40);
    waveDeadline = performance.now() + deadlineMs;
}

function makeParticle(x, y) {
    particles.push({ x, y, born: performance.now() });
}

function updateScoreDisplay() {
    document.getElementById('scoreBox').textContent = score;
}
function updateHiscoreDisplay() {
    document.getElementById('hiscoreBox').textContent = hiscore;
}
function updateComboDisplay() {
    document.getElementById('comboBox').textContent = 'x' + combo;
}
function updateTimeDisplay() {
    const box = document.getElementById('timeBox');
    const t = Math.max(0, Math.ceil(timeLeft));
    const m = Math.floor(t / 60);
    const s = t % 60;
    box.textContent = m + ':' + String(s).padStart(2, '0');
    box.parentElement.classList.toggle('low-time', t <= 10 && t > 0);
}

function resetHiscore() {
    hiscore = 0;
    localStorage.setItem('bottle-shooting-hiscore', JSON.stringify(hiscore));
    updateHiscoreDisplay();
}

function endRound() {
    // Guarded at the call site by `!roundOver` — this body runs exactly once per round.
    roundOver = true;
    if (score > hiscore) {
        hiscore = score;
        localStorage.setItem('bottle-shooting-hiscore', JSON.stringify(hiscore));
        updateHiscoreDisplay();
    }
    if (window.Leaderboard) Leaderboard.checkAndPromptIfRecord('bottle-shooting', score);
}

function resetRound() {
    score = 0;
    combo = 1;
    timeLeft = ROUND_TIME;
    roundOver = false;
    particles = [];
    updateScoreDisplay();
    updateComboDisplay();
    updateTimeDisplay();
    spawnWave();
}

function togglePause() {
    paused = !paused;
    const btn = document.getElementById('pauseBtn');
    const overlay = document.getElementById('pauseOverlay');
    if (btn) {
        btn.textContent = paused ? '▶ Resume' : '⏸ Pause';
        btn.classList.toggle('paused', paused);
    }
    if (overlay) overlay.style.display = paused ? 'flex' : 'none';
    if (!paused) {
        // Avoid a huge dt jump on the first frame after resuming.
        lastFrameTime = 0;
    }
}

function hexToRgb(hex) {
    const n = parseInt(hex.replace('#', ''), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function drawBottle(b) {
    const rgb = hexToRgb(accentColor);
    const glow = `rgba(${rgb.r},${rgb.g},${rgb.b},0.6)`;
    context.save();
    context.shadowBlur = 14;
    context.shadowColor = glow;
    // Body
    context.fillStyle = lm() ? '#5533aa' : accentColor;
    const bodyY = b.y + b.h * 0.28;
    const bodyH = b.h * 0.72;
    roundRect(b.x, bodyY, b.w, bodyH, Math.min(8, b.w * 0.2));
    context.fill();
    // Neck
    context.fillRect(b.x + b.w * 0.32, b.y, b.w * 0.36, b.h * 0.32);
    context.restore();
}

function roundRect(x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
}

function drawParticles(now) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        const age = now - p.born;
        if (age > 400) { particles.splice(i, 1); continue; }
        const t = age / 400;
        context.save();
        context.globalAlpha = 1 - t;
        context.strokeStyle = accentColor;
        context.lineWidth = 3;
        context.beginPath();
        context.arc(p.x, p.y, 6 + t * 24, 0, Math.PI * 2);
        context.stroke();
        context.restore();
    }
}

function drawCrosshair() {
    context.save();
    context.strokeStyle = accentColor;
    context.lineWidth = 2;
    context.shadowBlur = 8;
    context.shadowColor = accentColor;
    context.beginPath();
    context.moveTo(mouseX - 12, mouseY);
    context.lineTo(mouseX + 12, mouseY);
    context.moveTo(mouseX, mouseY - 12);
    context.lineTo(mouseX, mouseY + 12);
    context.stroke();
    context.beginPath();
    context.arc(mouseX, mouseY, 8, 0, Math.PI * 2);
    context.stroke();
    context.restore();
}

function render(now) {
    context.fillStyle = lm() ? '#f4f0fb' : '#0a0a12';
    context.fillRect(0, 0, boardwidth, boardheight);

    // Shelf line
    context.strokeStyle = lm() ? 'rgba(80,60,120,0.25)' : 'rgba(255,255,255,0.08)';
    context.lineWidth = 2;
    for (let r = 0; r <= WAVE_ROWS; r++) {
        const y = boardheight * 0.18 + r * (boardheight * 0.62 / WAVE_ROWS) + (boardheight * 0.62 / WAVE_ROWS);
        context.beginPath();
        context.moveTo(boardwidth * 0.04, y);
        context.lineTo(boardwidth * 0.96, y);
        context.stroke();
    }

    bottles.forEach(drawBottle);
    drawParticles(now);

    if (roundOver) {
        context.fillStyle = 'rgba(0,0,0,0.55)';
        context.fillRect(0, 0, boardwidth, boardheight);
        context.textAlign = 'center';
        context.fillStyle = accentColor;
        context.shadowBlur = 20;
        context.shadowColor = accentColor;
        context.font = "bold 28px Orbitron, monospace";
        context.fillText('ROUND OVER', boardwidth / 2, boardheight / 2 - 10);
        context.shadowBlur = 0;
        context.fillStyle = '#fff';
        context.font = "13px Orbitron, monospace";
        context.fillText('Final score: ' + score, boardwidth / 2, boardheight / 2 + 20);
        context.fillText('Click to play again', boardwidth / 2, boardheight / 2 + 44);
        context.textAlign = 'left';
    } else {
        drawCrosshair();
    }
}

function update(ctime) {
    requestAnimationFrame(update);
    if (paused) return;
    const dt = lastFrameTime ? (ctime - lastFrameTime) : 0;
    lastFrameTime = ctime;

    if (!roundOver) {
        timeLeft -= dt / 1000;
        updateTimeDisplay();
        if (timeLeft <= 0 && !roundOver) {
            timeLeft = 0;
            updateTimeDisplay();
            endRound();
        } else if (performance.now() > waveDeadline) {
            spawnWave();
        }
        if (combo > 1 && performance.now() - lastHitTime > COMBO_WINDOW) {
            combo = 1;
            updateComboDisplay();
        }
    }

    render(ctime);
}

function onCanvasClick(e) {
    if (paused) return;
    const rect = board.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (roundOver) { resetRound(); return; }

    let hitIndex = -1;
    for (let i = bottles.length - 1; i >= 0; i--) {
        const b = bottles[i];
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { hitIndex = i; break; }
    }

    const now = performance.now();
    if (hitIndex >= 0) {
        const b = bottles[hitIndex];
        combo = (now - lastHitTime <= COMBO_WINDOW) ? Math.min(MAX_COMBO, combo + 1) : 1;
        lastHitTime = now;
        score += 10 * combo;
        makeParticle(b.x + b.w / 2, b.y + b.h / 2);
        bottles.splice(hitIndex, 1);
        updateScoreDisplay();
        updateComboDisplay();
        if (bottles.length === 0) spawnWave();
    } else {
        combo = 1;
        updateComboDisplay();
    }
}

function onCanvasMove(e) {
    const rect = board.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
}

function init() {
    board = document.getElementById('board');
    boardwidth = window.innerWidth / 2.3;
    boardheight = window.innerHeight / 1.3;
    board.width = boardwidth;
    board.height = boardheight;
    context = board.getContext('2d');

    accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || accentColor;

    const stored = localStorage.getItem('bottle-shooting-hiscore');
    hiscore = stored === null ? 0 : JSON.parse(stored);
    updateHiscoreDisplay();
    updateTimeDisplay();

    buildSlots();
    spawnWave();

    board.addEventListener('click', onCanvasClick);
    board.addEventListener('mousemove', onCanvasMove);

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); togglePause(); }
    });

    requestAnimationFrame(update);
}

init();
