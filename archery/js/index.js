// Archery — aim with the mouse, hold to charge a power meter (it oscillates,
// so timing the release matters), release to fire. Wind drifts the arrow
// sideways each round; both the target's exact spot and the wind strength
// are drawn from small fixed pools (never a raw random pixel/float) so a
// shot is never unfair the way an unbounded random value could be — the
// same principle behind Snake's randomFreeCell fix earlier this session.

let boardwidth = Math.max(600, Math.min(900, window.innerWidth - 320));
let boardheight = Math.max(400, Math.min(560, window.innerHeight - 160));
let board, context;

const GRAVITY = 0.32;
const ARROWS_TOTAL = 10;
const GROUND_MARGIN = 40;

// Fractional positions (of board width/height) — a small, fair, fixed pool.
const TARGET_POOL = [
    { xf: 0.60, yf: 0.55 },
    { xf: 0.68, yf: 0.30 },
    { xf: 0.75, yf: 0.62 },
    { xf: 0.82, yf: 0.28 },
    { xf: 0.70, yf: 0.45 },
    { xf: 0.85, yf: 0.50 },
];
const WIND_POOL = [-1.5, -0.75, 0, 0, 0.75, 1.5];

// Ring radii (outer→inner) and their point values, before difficulty scaling.
const RING_DEFS = [
    { r: 50, v: 2 },
    { r: 38, v: 4 },
    { r: 26, v: 6 },
    { r: 14, v: 8 },
    { r: 6,  v: 10 },
].sort((a, b) => a.r - b.r); // smallest radius first, so the first match wins

let groundY, archerX, archerY, bowTipX, bowTipY;

let score = 0;
let hiscore = localStorage.getItem('archery-hiscore');
hiscore = hiscore === null ? 0 : JSON.parse(hiscore);

let arrowIndex = 0;      // 0-based; displayed as arrowIndex+1
let paused = false;
let roundEnded = false;
let waitingForNext = false;

let target = null;
let wind = 0;
let arrow = null;        // {x,y,vx,vy}
let trail = [];
let hitMarker = null;    // {x,y,value,miss,time}

let aiming = false;
let chargeStart = 0;
let power = 0;
let mouseY = 0;

function lm() { return document.body.classList.contains('light-mode'); }

function updateScoreDisplay() {
    document.getElementById('scoreBox').innerHTML = score;
    document.getElementById('hiscoreBox').innerHTML = hiscore;
}

function updateArrowDisplay() {
    document.getElementById('arrowBox').innerHTML = `${Math.min(arrowIndex + 1, ARROWS_TOTAL)} / ${ARROWS_TOTAL}`;
}

function updateWindDisplay() {
    const arrowGlyph = wind > 0 ? '→' : wind < 0 ? '←' : '—';
    document.getElementById('windBox').innerHTML = `${arrowGlyph} ${Math.abs(wind).toFixed(1)}`;
}

function difficultyScale() {
    return Math.max(0.55, 1 - Math.floor(arrowIndex / 3) * 0.08);
}

function pickTarget() {
    const t = TARGET_POOL[Math.floor(Math.random() * TARGET_POOL.length)];
    const scale = difficultyScale();
    return {
        x: t.xf * boardwidth,
        y: t.yf * boardheight,
        radii: RING_DEFS.map(d => ({ r: d.r * scale, v: d.v })),
    };
}

function pickWind() {
    return WIND_POOL[Math.floor(Math.random() * WIND_POOL.length)];
}

function setupRound() {
    target = pickTarget();
    wind = pickWind();
    arrow = null;
    trail = [];
    hitMarker = null;
    aiming = false;
    power = 0;
    waitingForNext = false;
    updateArrowDisplay();
    updateWindDisplay();
}

function resetHiscore() {
    hiscore = 0;
    localStorage.setItem('archery-hiscore', JSON.stringify(hiscore));
    updateScoreDisplay();
}

function togglePause() {
    if (roundEnded) return;
    paused = !paused;
    const btn = document.getElementById('pauseBtn');
    btn.textContent = paused ? '▶ Resume' : '⏸ Pause';
    btn.classList.toggle('paused', paused);
    document.getElementById('pauseOverlay').style.display = paused ? 'flex' : 'none';
}

function startNewGame() {
    score = 0;
    arrowIndex = 0;
    roundEnded = false;
    updateScoreDisplay();
    setupRound();
}

function aimAngleDeg() {
    const minA = 10, maxA = 75;
    const clampedY = Math.max(0, Math.min(archerY, mouseY));
    const t = (archerY - clampedY) / archerY;
    return minA + t * (maxA - minA);
}

function currentPower(now) {
    const period = 1000;
    const elapsed = (now - chargeStart) % period;
    const phase = elapsed / period;
    return phase < 0.5 ? phase * 2 * 100 : (1 - phase) * 2 * 100;
}

function fireArrow() {
    const angleDeg = aimAngleDeg();
    const angleRad = angleDeg * Math.PI / 180;
    const speed = 7 + (power / 100) * 11;
    arrow = {
        x: bowTipX,
        y: bowTipY,
        vx: speed * Math.cos(angleRad),
        vy: -speed * Math.sin(angleRad),
    };
    trail = [];
}

function resolveShot(landingY) {
    let value = 0;
    if (landingY !== null) {
        const dist = Math.abs(landingY - target.y);
        const hitRing = target.radii.find(rr => dist <= rr.r);
        value = hitRing ? hitRing.v : 0;
    }
    hitMarker = { x: target.x, y: landingY === null ? groundY : landingY, value, miss: value === 0, time: performance.now() };
    score += value;
    if (score > hiscore) {
        hiscore = score;
        localStorage.setItem('archery-hiscore', JSON.stringify(hiscore));
    }
    updateScoreDisplay();
    arrow = null;
    waitingForNext = true;
    setTimeout(nextArrow, 750);
}

function nextArrow() {
    arrowIndex++;
    if (arrowIndex >= ARROWS_TOTAL) {
        endRound();
    } else {
        setupRound();
    }
}

function endRound() {
    roundEnded = true;
    if (window.Leaderboard) Leaderboard.checkAndPromptIfRecord('archery', score);
}

function updateFlight() {
    if (!arrow) return;
    const prevX = arrow.x;
    arrow.vy += GRAVITY;
    arrow.vx += wind * 0.03;
    arrow.x += arrow.vx;
    arrow.y += arrow.vy;
    trail.push({ x: arrow.x, y: arrow.y });
    if (trail.length > 18) trail.shift();

    if (prevX < target.x && arrow.x >= target.x) {
        resolveShot(arrow.y);
    } else if (arrow.y >= groundY || arrow.x > boardwidth + 30 || arrow.y < -60) {
        resolveShot(null);
    }
}

function draw() {
    context.fillStyle = lm() ? '#f0f4ff' : '#0a0510';
    context.fillRect(0, 0, boardwidth, boardheight);

    // Ground
    context.fillStyle = lm() ? 'rgba(120,20,50,0.15)' : 'rgba(255,56,96,0.08)';
    context.fillRect(0, groundY, boardwidth, boardheight - groundY);

    // Archer
    const accent = lm() ? '#a8123a' : '#ff3860';
    context.strokeStyle = accent;
    context.lineWidth = 3;
    context.shadowBlur = lm() ? 4 : 12;
    context.shadowColor = accent;
    context.beginPath();
    context.moveTo(archerX, archerY);
    context.lineTo(archerX, archerY - 46);
    context.stroke();
    context.beginPath();
    context.arc(bowTipX - 8, bowTipY, 20, -Math.PI / 2.6, Math.PI / 2.6);
    context.stroke();
    context.shadowBlur = 0;

    // Target
    if (target) {
        target.radii.slice().reverse().forEach((rr, i) => {
            context.beginPath();
            context.arc(target.x, target.y, rr.r, 0, Math.PI * 2);
            context.fillStyle = i % 2 === 0 ? (lm() ? '#ffffff' : '#1a0a14') : accent;
            context.globalAlpha = 0.85;
            context.fill();
            context.globalAlpha = 1;
        });
        context.beginPath();
        context.arc(target.x, target.y, target.radii[0].r, 0, Math.PI * 2);
        context.strokeStyle = accent;
        context.lineWidth = 1.5;
        context.shadowBlur = 10;
        context.shadowColor = accent;
        context.stroke();
        context.shadowBlur = 0;
    }

    // Aim guide + power meter (only while actively aiming/charging, before release)
    if (!arrow && !roundEnded && !waitingForNext) {
        const angleDeg = aimAngleDeg();
        const angleRad = angleDeg * Math.PI / 180;
        context.strokeStyle = 'rgba(255,255,255,0.25)';
        context.setLineDash([4, 6]);
        context.beginPath();
        context.moveTo(bowTipX, bowTipY);
        context.lineTo(bowTipX + Math.cos(angleRad) * 70, bowTipY - Math.sin(angleRad) * 70);
        context.stroke();
        context.setLineDash([]);

        if (aiming) {
            power = currentPower(performance.now());
            const barX = 24, barY = boardheight - 90, barW = 16, barH = 70;
            context.strokeStyle = accent;
            context.strokeRect(barX, barY, barW, barH);
            const fillH = (power / 100) * barH;
            context.fillStyle = accent;
            context.fillRect(barX, barY + barH - fillH, barW, fillH);
        }
    }

    // Arrow + trail
    if (arrow) {
        trail.forEach((p, i) => {
            context.globalAlpha = (i / trail.length) * 0.4;
            context.fillStyle = accent;
            context.beginPath();
            context.arc(p.x, p.y, 2, 0, Math.PI * 2);
            context.fill();
        });
        context.globalAlpha = 1;
        const ang = Math.atan2(arrow.vy, arrow.vx);
        context.save();
        context.translate(arrow.x, arrow.y);
        context.rotate(ang);
        context.strokeStyle = lm() ? '#111' : '#fff';
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(-10, 0);
        context.lineTo(10, 0);
        context.stroke();
        context.restore();
    }

    // Hit marker feedback
    if (hitMarker) {
        const age = performance.now() - hitMarker.time;
        if (age < 800) {
            context.globalAlpha = Math.max(0, 1 - age / 800);
            context.fillStyle = hitMarker.miss ? '#888' : '#ffd23f';
            context.font = 'bold 20px Orbitron, monospace';
            context.fillText(hitMarker.miss ? 'MISS' : `+${hitMarker.value}`, hitMarker.x - 20, hitMarker.y - 10 - age / 20);
            context.globalAlpha = 1;
        } else {
            hitMarker = null;
        }
    }

    // Round over banner
    if (roundEnded) {
        context.fillStyle = 'rgba(5,5,16,0.75)';
        context.fillRect(0, 0, boardwidth, boardheight);
        context.fillStyle = accent;
        context.font = 'bold 26px Orbitron, monospace';
        context.textAlign = 'center';
        context.fillText('ROUND OVER', boardwidth / 2, boardheight / 2 - 10);
        context.font = '13px Orbitron, monospace';
        context.fillStyle = '#fff';
        context.fillText(`Final score: ${score}`, boardwidth / 2, boardheight / 2 + 18);
        context.fillStyle = 'rgba(255,255,255,0.7)';
        context.font = '11px Orbitron, monospace';
        context.fillText('Click to play again', boardwidth / 2, boardheight / 2 + 42);
        context.textAlign = 'left';
    }
}

function loop() {
    requestAnimationFrame(loop);
    if (paused) return;
    updateFlight();
    draw();
}

function onMouseMove(e) {
    const rect = board.getBoundingClientRect();
    mouseY = e.clientY - rect.top;
}

function onMouseDown(e) {
    if (paused || roundEnded || waitingForNext || arrow) return;
    aiming = true;
    chargeStart = performance.now();
}

function onMouseUp() {
    if (!aiming) return;
    aiming = false;
    fireArrow();
}

function onClick() {
    if (roundEnded) startNewGame();
}

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        e.preventDefault();
        togglePause();
    }
});

window.onload = function () {
    board = document.getElementById('board');
    board.width = boardwidth;
    board.height = boardheight;
    context = board.getContext('2d');

    groundY = boardheight - GROUND_MARGIN;
    archerX = 60;
    archerY = groundY;
    bowTipX = archerX + 4;
    bowTipY = archerY - 40;

    updateScoreDisplay();
    setupRound();

    board.addEventListener('mousemove', onMouseMove);
    board.addEventListener('mousedown', onMouseDown);
    board.addEventListener('mouseup', onMouseUp);
    board.addEventListener('click', onClick);

    requestAnimationFrame(loop);
};
