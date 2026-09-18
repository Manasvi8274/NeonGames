// Bottle Shooting — real shooting-gallery mechanic:
// A glowing reticle sweeps the shelf automatically (you never aim it by
// hand). Press SPACE (or click) to fire — a bullet flies from the cannon
// straight to wherever the reticle is *at that instant*. If it was hovering
// a live bottle, the bottle shatters for points; otherwise it's a miss and
// costs a life. Chain hits fast enough to keep your combo multiplier alive.
//
// Spawn design unchanged from the original: bottles are placed into a FIXED
// grid of shelf slots (computed once from canvas size), and each wave
// randomly SELECTS which slots are occupied (Fisher-Yates + take-first-N)
// rather than generating raw coordinates and rejecting on overlap.

const ROUND_TIME = 45;       // seconds
const COMBO_WINDOW = 2500;   // ms between hits to keep the combo alive
const MAX_COMBO = 5;
const START_LIVES = 3;
const WAVE_ROWS = 2;
const WAVE_COLS = 5;
const FIRE_COOLDOWN = 170;   // ms between shots
const BULLET_SPEED = 1500;   // px/s
const HIT_TOLERANCE = 6;     // px of extra slack around a bottle's hitbox

let board, context;
let boardwidth, boardheight;

let slots = [];
let bottles = [];
let particles = [];
let bullets = [];
let muzzleFlash = 0;

let score = 0;
let hiscore = 0;
let combo = 1;
let lives = START_LIVES;
let lastHitTime = 0;
let timeLeft = ROUND_TIME;
let waveNumber = 0;
let roundOver = false;
let started = false;
let paused = false;
let lastFrameTime = 0;
let lastFireTime = -Infinity;
let waveDeadline = 0;
let accentColor = '#ff2fd0';

let gunX, gunY;

const reticle = { x: 0, y: 0, dir: 1, row: 0, speed: 220 };

function lm() { return document.body.classList.contains('light-mode'); }

function buildSlots() {
    slots = [];
    const marginX = boardwidth * 0.10;
    const marginY = boardheight * 0.16;
    const shelfHeight = boardheight * 0.5;
    const cellW = (boardwidth - marginX * 2) / WAVE_COLS;
    const cellH = shelfHeight / WAVE_ROWS;
    for (let r = 0; r < WAVE_ROWS; r++) {
        for (let c = 0; c < WAVE_COLS; c++) {
            slots.push({
                row: r,
                x: marginX + c * cellW + cellW * 0.20,
                y: marginY + r * cellH + cellH * 0.08,
                w: cellW * 0.60,
                h: cellH * 0.82,
            });
        }
    }
}

function rowCenterY(row) {
    const rowSlots = slots.filter(s => s.row === row);
    if (!rowSlots.length) return boardheight * 0.3;
    return rowSlots[0].y + rowSlots[0].h * 0.35;
}

function spawnWave() {
    waveNumber++;
    const occupancy = Math.min(1, 0.55 + waveNumber * 0.06);
    const indices = slots.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const count = Math.max(3, Math.round(slots.length * occupancy));
    bottles = indices.slice(0, count).map((i) => ({
        slotIndex: i,
        x: slots[i].x, y: slots[i].y, w: slots[i].w, h: slots[i].h,
        wobble: Math.random() * Math.PI * 2,
    }));
    reticle.speed = 200 + waveNumber * 22;
    const deadlineMs = Math.max(5000, 9000 - waveNumber * 300);
    waveDeadline = performance.now() + deadlineMs;
}

function makeShatter(x, y) {
    for (let i = 0; i < 14; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 90 + Math.random() * 220;
        particles.push({
            x, y,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd - 60,
            born: performance.now(),
            life: 550 + Math.random() * 250,
            size: 2 + Math.random() * 4,
            shard: true,
        });
    }
}

function makeSpark(x, y) {
    for (let i = 0; i < 6; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 40 + Math.random() * 80;
        particles.push({
            x, y,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            born: performance.now(),
            life: 260,
            size: 2,
            shard: false,
        });
    }
}

function updateScoreDisplay() { document.getElementById('scoreBox').textContent = score; }
function updateHiscoreDisplay() { document.getElementById('hiscoreBox').textContent = hiscore; }
function updateComboDisplay() { document.getElementById('comboBox').textContent = 'x' + combo; }
function updateLivesDisplay() { document.getElementById('livesBox').textContent = '❤'.repeat(Math.max(0, lives)) + '🖤'.repeat(START_LIVES - Math.max(0, lives)); }
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
    roundOver = true;
    if (score > hiscore) {
        hiscore = score;
        localStorage.setItem('bottle-shooting-hiscore', JSON.stringify(hiscore));
        updateHiscoreDisplay();
    }
    GameChrome.showEnd({
        container: '.game-area',
        icon: lives <= 0 ? '💥' : '⏱️',
        title: lives <= 0 ? 'OUT OF LIVES' : "TIME'S UP",
        win: score > 0 && score >= hiscore,
        sound: score > 0 && score >= hiscore ? 'record' : undefined,
        badge: score > 0 && score >= hiscore ? 'NEW HIGH SCORE!' : '',
        lines: [
            { label: 'Score', value: score, record: score >= hiscore },
            { label: 'Best combo', value: 'x' + Math.max(combo, 1) },
            { label: 'Wave reached', value: waveNumber },
        ],
        onRestart: resetRound,
    });
    if (window.Leaderboard) Leaderboard.checkAndPromptIfRecord('bottle-shooting', score);
}

function resetRound() {
    score = 0;
    combo = 1;
    lives = START_LIVES;
    timeLeft = ROUND_TIME;
    waveNumber = 0;
    roundOver = false;
    started = true;
    particles = [];
    bullets = [];
    reticle.row = 0;
    reticle.x = slots.length ? slots[0].x : 0;
    reticle.dir = 1;
    updateScoreDisplay();
    updateComboDisplay();
    updateLivesDisplay();
    updateTimeDisplay();
    spawnWave();
    lastFrameTime = 0;
}

function togglePause() {
    if (roundOver || !started) return;
    paused = !paused;
    const btn = document.getElementById('pauseBtn');
    const overlay = document.getElementById('pauseOverlay');
    if (btn) {
        btn.textContent = paused ? '▶ Resume' : '⏸ Pause';
        btn.classList.toggle('paused', paused);
    }
    if (overlay) overlay.style.display = paused ? 'flex' : 'none';
    SFX.play('pause');
    if (!paused) lastFrameTime = 0;
}

function hexToRgb(hex) {
    const n = parseInt(hex.replace('#', ''), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// Returns the bottle object under (x, y), or null. Callers that need to hold
// on to the result across a delay (e.g. a bullet's travel time) must keep the
// object reference itself, not an index — bottles.splice() during that delay
// would otherwise silently shift indices out from under them.
function bottleUnderPoint(x, y) {
    for (let i = 0; i < bottles.length; i++) {
        const b = bottles[i];
        if (x >= b.x - HIT_TOLERANCE && x <= b.x + b.w + HIT_TOLERANCE &&
            y >= b.y - HIT_TOLERANCE && y <= b.y + b.h + HIT_TOLERANCE) {
            return b;
        }
    }
    return null;
}

function fire() {
    if (paused || roundOver || !started) return;
    const now = performance.now();
    if (now - lastFireTime < FIRE_COOLDOWN) return;
    lastFireTime = now;
    muzzleFlash = now;

    const targetX = reticle.x;
    const targetY = reticle.y;
    const dist = Math.hypot(targetX - gunX, targetY - gunY);
    const dur = Math.max(60, (dist / BULLET_SPEED) * 1000);
    const hitBottle = bottleUnderPoint(targetX, targetY);

    bullets.push({
        x0: gunX, y0: gunY, x1: targetX, y1: targetY,
        t0: now, dur,
        hitBottle,
        resolved: false,
    });
    SFX.play('shoot');
}

function resolveBullet(bullet) {
    bullet.resolved = true;
    const now = performance.now();
    const idx = bullet.hitBottle ? bottles.indexOf(bullet.hitBottle) : -1;
    if (idx >= 0) {
        const b = bottles[idx];
        combo = (now - lastHitTime <= COMBO_WINDOW) ? Math.min(MAX_COMBO, combo + 1) : 1;
        lastHitTime = now;
        score += 10 * combo;
        makeShatter(b.x + b.w / 2, b.y + b.h / 2);
        bottles.splice(idx, 1);
        updateScoreDisplay();
        updateComboDisplay();
        SFX.play('smash');
        if (bottles.length === 0) spawnWave();
    } else {
        combo = 1;
        updateComboDisplay();
        lives--;
        updateLivesDisplay();
        makeSpark(bullet.x1, bullet.y1);
        SFX.play('miss');
        if (lives <= 0) endRound();
    }
}

function drawBottle(b, now) {
    const rgb = hexToRgb(accentColor);
    const glow = `rgba(${rgb.r},${rgb.g},${rgb.b},0.6)`;
    const hot = bottleUnderPoint(reticle.x, reticle.y) === b;
    context.save();
    context.shadowBlur = hot ? 26 : 14;
    context.shadowColor = hot ? '#ffe566' : glow;

    const bodyY = b.y + b.h * 0.28;
    const bodyH = b.h * 0.72;

    // body
    context.fillStyle = lm() ? '#5533aa' : accentColor;
    roundRect(b.x, bodyY, b.w, bodyH, Math.min(8, b.w * 0.2));
    context.fill();
    // glossy highlight
    context.globalAlpha = 0.25;
    context.fillStyle = '#ffffff';
    roundRect(b.x + b.w * 0.14, bodyY + b.h * 0.06, b.w * 0.16, bodyH * 0.7, 4);
    context.fill();
    context.globalAlpha = 1;
    // label band
    context.fillStyle = 'rgba(255,255,255,0.85)';
    context.fillRect(b.x, bodyY + bodyH * 0.38, b.w, bodyH * 0.18);
    // neck + cap
    context.fillStyle = lm() ? '#5533aa' : accentColor;
    context.fillRect(b.x + b.w * 0.32, b.y, b.w * 0.36, b.h * 0.32);
    context.fillStyle = '#3a3a44';
    context.fillRect(b.x + b.w * 0.30, b.y - b.h * 0.06, b.w * 0.40, b.h * 0.1);
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
        if (age > p.life) { particles.splice(i, 1); continue; }
        const t = age / p.life;
        const dt = age / 1000;
        const px = p.x + p.vx * dt;
        const py = p.y + p.vy * dt + 260 * dt * dt;
        context.save();
        context.globalAlpha = 1 - t;
        if (p.shard) {
            context.fillStyle = lm() ? '#5533aa' : accentColor;
            context.translate(px, py);
            context.rotate(t * 6);
            context.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        } else {
            context.fillStyle = '#ffcf4d';
            context.beginPath();
            context.arc(px, py, p.size, 0, Math.PI * 2);
            context.fill();
        }
        context.restore();
    }
}

function drawReticle(now) {
    const overBottle = bottleUnderPoint(reticle.x, reticle.y) !== null;
    const color = overBottle ? '#ffe566' : accentColor;
    const pulse = 1 + Math.sin(now / 120) * 0.12;
    context.save();
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.shadowBlur = overBottle ? 20 : 10;
    context.shadowColor = color;
    context.beginPath();
    context.arc(reticle.x, reticle.y, 14 * pulse, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.moveTo(reticle.x - 20, reticle.y);
    context.lineTo(reticle.x - 8, reticle.y);
    context.moveTo(reticle.x + 8, reticle.y);
    context.lineTo(reticle.x + 20, reticle.y);
    context.moveTo(reticle.x, reticle.y - 20);
    context.lineTo(reticle.x, reticle.y - 8);
    context.moveTo(reticle.x, reticle.y + 8);
    context.lineTo(reticle.x, reticle.y + 20);
    context.stroke();
    context.restore();
}

function drawGun(now) {
    const flashAge = now - muzzleFlash;
    const recoil = flashAge < 90 ? (1 - flashAge / 90) * 6 : 0;
    const ang = Math.atan2(reticle.y - gunY, reticle.x - gunX);

    context.save();
    context.translate(gunX, gunY);
    context.rotate(ang);
    context.translate(recoil * -1, 0);

    context.fillStyle = lm() ? '#333' : '#cfd2de';
    context.shadowBlur = 8;
    context.shadowColor = accentColor;
    roundRect(-6, -8, 34, 16, 5);
    context.fill();
    context.fillStyle = accentColor;
    context.beginPath();
    context.arc(0, 0, 12, 0, Math.PI * 2);
    context.fill();
    context.restore();

    if (flashAge < 70) {
        context.save();
        context.globalAlpha = 1 - flashAge / 70;
        context.fillStyle = '#fff8d0';
        context.shadowBlur = 20;
        context.shadowColor = '#fff8d0';
        context.beginPath();
        context.arc(gunX + Math.cos(ang) * 30, gunY + Math.sin(ang) * 30, 9, 0, Math.PI * 2);
        context.fill();
        context.restore();
    }
}

function drawBullets(now) {
    for (const bl of bullets) {
        const t = Math.min(1, (now - bl.t0) / bl.dur);
        const x = bl.x0 + (bl.x1 - bl.x0) * t;
        const y = bl.y0 + (bl.y1 - bl.y0) * t;
        context.save();
        context.strokeStyle = '#fff8d0';
        context.lineWidth = 3;
        context.shadowBlur = 10;
        context.shadowColor = '#ffe566';
        context.beginPath();
        context.moveTo(x - (bl.x1 - bl.x0) * 0.05, y - (bl.y1 - bl.y0) * 0.05);
        context.lineTo(x, y);
        context.stroke();
        context.restore();
    }
}

function drawBackdrop() {
    const g = context.createLinearGradient(0, 0, 0, boardheight);
    if (lm()) {
        g.addColorStop(0, '#eae6f8');
        g.addColorStop(1, '#f4f0fb');
    } else {
        g.addColorStop(0, '#150a20');
        g.addColorStop(1, '#0a0a12');
    }
    context.fillStyle = g;
    context.fillRect(0, 0, boardwidth, boardheight);

    // Curtain drape along the top
    context.save();
    context.globalAlpha = lm() ? 0.12 : 0.22;
    context.fillStyle = accentColor;
    for (let i = 0; i < 10; i++) {
        const x = (boardwidth / 10) * i;
        context.beginPath();
        context.moveTo(x, 0);
        context.quadraticCurveTo(x + boardwidth / 20, boardheight * 0.09, x + boardwidth / 10, 0);
        context.fill();
    }
    context.restore();

    // Shelf lines
    context.strokeStyle = lm() ? 'rgba(80,60,120,0.25)' : 'rgba(255,255,255,0.08)';
    context.lineWidth = 2;
    for (let r = 0; r <= WAVE_ROWS; r++) {
        const y = boardheight * 0.16 + r * (boardheight * 0.5 / WAVE_ROWS) + (boardheight * 0.5 / WAVE_ROWS);
        context.beginPath();
        context.moveTo(boardwidth * 0.05, y);
        context.lineTo(boardwidth * 0.95, y);
        context.stroke();
    }
}

function render(now) {
    drawBackdrop();
    bottles.forEach(b => drawBottle(b, now));
    drawBullets(now);
    drawParticles(now);
    if (started) drawGun(now);
    if (started && !roundOver) drawReticle(now);
}

function update(ctime) {
    requestAnimationFrame(update);
    if (paused) { render(ctime); return; }
    const dt = lastFrameTime ? (ctime - lastFrameTime) : 0;
    lastFrameTime = ctime;

    // Reticle sweep (runs even before the round starts, as gentle attract motion)
    if (slots.length) {
        reticle.x += reticle.dir * reticle.speed * (dt / 1000);
        const minX = slots[0].x + 6;
        const maxX = slots[WAVE_COLS - 1].x + slots[WAVE_COLS - 1].w - 6;
        if (reticle.x > maxX) { reticle.x = maxX; reticle.dir = -1; }
        if (reticle.x < minX) {
            reticle.x = minX; reticle.dir = 1;
            reticle.row = (reticle.row + 1) % WAVE_ROWS;
        }
        reticle.y = rowCenterY(reticle.row);
    }

    for (const bl of bullets) {
        if (!bl.resolved && ctime - bl.t0 >= bl.dur) resolveBullet(bl);
    }
    bullets = bullets.filter(bl => ctime - bl.t0 < bl.dur + 40);

    if (started && !roundOver) {
        timeLeft -= dt / 1000;
        updateTimeDisplay();
        if (timeLeft <= 0) {
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

function onCanvasClick() {
    if (!started) return;
    fire();
}

function onKeyDown(e) {
    if (e.code === 'Space') {
        e.preventDefault();
        if (started) fire();
    } else if (e.key === 'Escape') {
        e.preventDefault();
        togglePause();
    }
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
    updateLivesDisplay();

    gunX = boardwidth / 2;
    gunY = boardheight - 14;

    buildSlots();
    spawnWave();
    reticle.x = slots[0].x;
    reticle.y = rowCenterY(0);

    board.addEventListener('click', onCanvasClick);
    window.addEventListener('keydown', onKeyDown);

    requestAnimationFrame(update);

    GameChrome.boot({
        container: '.game-area',
        icon: '🎯',
        title: 'BOTTLE SHOOTING',
        subtitle: 'Watch the glowing reticle sweep the shelf on its own.',
        instructions: [
            '<kbd>SPACE</kbd> or click to fire when it glows gold over a bottle',
            'Chain hits fast to build your combo multiplier',
            'You have 3 lives — a miss costs one',
        ],
        promptText: 'Press Space / Click to Start',
        onStart: () => { resetRound(); },
    });
}

init();
