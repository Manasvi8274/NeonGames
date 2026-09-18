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
let started = false;
let roundEnded = false;
let waitingForNext = false;
let streak = 0;
let bestStreak = 0;

let target = null;
let wind = 0;
let arrow = null;        // {x,y,vx,vy}
let trail = [];
let hitMarker = null;    // {x,y,value,miss,time}
let bullseyeFlash = null;
let shake = 0;
let stars = [];
let particles = [];      // impact sparks/feathers

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
    if (roundEnded || !started) return;
    paused = !paused;
    const btn = document.getElementById('pauseBtn');
    btn.textContent = paused ? '▶ Resume' : '⏸ Pause';
    btn.classList.toggle('paused', paused);
    document.getElementById('pauseOverlay').style.display = paused ? 'flex' : 'none';
    SFX.play('pause');
}

function startNewGame() {
    score = 0;
    arrowIndex = 0;
    roundEnded = false;
    streak = 0;
    bestStreak = 0;
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
    SFX.play('bowshot');
}

function spawnImpactParticles(x, y, miss) {
    const n = miss ? 6 : 14;
    for (let i = 0; i < n; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = miss ? 30 + Math.random() * 60 : 60 + Math.random() * 160;
        particles.push({
            x, y,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd - 40,
            born: performance.now(),
            life: 450 + Math.random() * 250,
            miss,
        });
    }
}

function resolveShot(landingY) {
    let value = 0;
    if (landingY !== null) {
        const dist = Math.abs(landingY - target.y);
        const hitRing = target.radii.find(rr => dist <= rr.r);
        value = hitRing ? hitRing.v : 0;
    }
    const landX = target.x;
    const landY = landingY === null ? groundY : landingY;
    hitMarker = { x: landX, y: landY, value, miss: value === 0, time: performance.now() };
    spawnImpactParticles(landX, landY, value === 0);

    if (value >= 8) {
        streak++;
        bestStreak = Math.max(bestStreak, streak);
        bullseyeFlash = performance.now();
        SFX.play('powerup');
        shake = 10;
    } else if (value > 0) {
        streak = 0;
        SFX.play('hit');
        shake = 4;
    } else {
        streak = 0;
        SFX.play('miss');
    }

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
    const isRecord = score >= hiscore && score > 0;
    GameChrome.showEnd({
        container: '.game-area',
        icon: '🏹',
        title: 'ROUND OVER',
        win: isRecord,
        sound: isRecord ? 'record' : (score > 0 ? 'win' : 'lose'),
        badge: isRecord ? 'NEW HIGH SCORE!' : '',
        lines: [
            { label: 'Score', value: score, record: isRecord },
            { label: 'Best streak', value: bestStreak },
        ],
        onRestart: startNewGame,
    });
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

function initStars() {
    stars = [];
    for (let i = 0; i < 40; i++) {
        stars.push({
            x: Math.random() * boardwidth,
            y: Math.random() * boardheight * 0.55,
            r: Math.random() * 1.4 + 0.3,
            tw: Math.random() * Math.PI * 2,
        });
    }
}

function drawSky(accent, now) {
    const g = context.createLinearGradient(0, 0, 0, groundY);
    if (lm()) {
        g.addColorStop(0, '#bcd6ff');
        g.addColorStop(1, '#f0f4ff');
    } else {
        g.addColorStop(0, '#150a1e');
        g.addColorStop(0.6, '#1d0f2c');
        g.addColorStop(1, '#0a0510');
    }
    context.fillStyle = g;
    context.fillRect(0, 0, boardwidth, groundY);

    if (!lm()) {
        context.save();
        stars.forEach(s => {
            context.globalAlpha = 0.35 + Math.sin(now / 500 + s.tw) * 0.35;
            context.fillStyle = '#fff';
            context.beginPath();
            context.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            context.fill();
        });
        context.restore();
    }

    // Sun / moon glow, upper-left, subtle parallax with accent tint
    context.save();
    const sunX = boardwidth * 0.14, sunY = boardheight * 0.16, sunR = 30;
    const sg = context.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 3);
    sg.addColorStop(0, lm() ? 'rgba(255,220,140,0.9)' : 'rgba(255,150,200,0.55)');
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = sg;
    context.beginPath();
    context.arc(sunX, sunY, sunR * 3, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = lm() ? '#fff3d0' : '#ffd9ec';
    context.beginPath();
    context.arc(sunX, sunY, sunR * 0.55, 0, Math.PI * 2);
    context.fill();
    context.restore();

    // Distant hills
    context.save();
    context.fillStyle = lm() ? 'rgba(90,120,180,0.18)' : `color-mix(in srgb, ${accent} 14%, #0a0510)`;
    context.beginPath();
    context.moveTo(0, groundY);
    context.quadraticCurveTo(boardwidth * 0.25, groundY - 60, boardwidth * 0.5, groundY - 15);
    context.quadraticCurveTo(boardwidth * 0.75, groundY - 55, boardwidth, groundY - 5);
    context.lineTo(boardwidth, groundY);
    context.closePath();
    context.fill();
    context.restore();
}

function drawGround(accent) {
    const g = context.createLinearGradient(0, groundY, 0, boardheight);
    g.addColorStop(0, lm() ? '#dfe8c8' : '#241226');
    g.addColorStop(1, lm() ? '#c8d8a8' : '#160a1a');
    context.fillStyle = g;
    context.fillRect(0, groundY, boardwidth, boardheight - groundY);

    context.strokeStyle = lm() ? 'rgba(90,120,50,0.35)' : `color-mix(in srgb, ${accent} 30%, transparent)`;
    context.lineWidth = 1;
    for (let i = 0; i < boardwidth; i += 14) {
        const h = 4 + Math.sin(i * 0.7) * 2;
        context.beginPath();
        context.moveTo(i, groundY + 4);
        context.lineTo(i + 3, groundY + 4 - h);
        context.stroke();
    }
}

function draw(now) {
    context.save();
    if (shake > 0) {
        const dx = (Math.random() - 0.5) * shake;
        const dy = (Math.random() - 0.5) * shake;
        context.translate(dx, dy);
        shake *= 0.85;
        if (shake < 0.4) shake = 0;
    }

    const accent = lm() ? '#a8123a' : '#ff3860';
    drawSky(accent, now);
    drawGround(accent);

    // Grounding shadows — the archer and target post read as standing IN
    // the scene rather than pasted flat on top of it.
    context.save();
    context.globalAlpha = lm() ? 0.18 : 0.35;
    context.fillStyle = '#000';
    context.beginPath();
    context.ellipse(archerX, archerY + 3, 16, 4, 0, 0, Math.PI * 2);
    context.fill();
    if (target) {
        context.beginPath();
        context.ellipse(target.x, groundY + 3, 14, 4, 0, 0, Math.PI * 2);
        context.fill();
    }
    context.restore();

    // Archer
    context.strokeStyle = accent;
    context.lineWidth = 3;
    context.shadowBlur = lm() ? 4 : 12;
    context.shadowColor = accent;
    context.beginPath();
    context.moveTo(archerX, archerY);
    context.lineTo(archerX, archerY - 46);
    context.stroke();
    context.beginPath();
    context.arc(archerX, archerY - 54, 8, 0, Math.PI * 2);
    context.stroke();
    // bow arc
    context.beginPath();
    context.arc(bowTipX - 8, bowTipY, 20, -Math.PI / 2.6, Math.PI / 2.6);
    context.stroke();
    // bowstring
    if (!arrow && !roundEnded) {
        context.beginPath();
        context.moveTo(bowTipX - 8, bowTipY - 19);
        context.lineTo(aiming ? bowTipX - 8 - power / 12 : bowTipX - 10, bowTipY);
        context.lineTo(bowTipX - 8, bowTipY + 19);
        context.strokeStyle = 'rgba(255,255,255,0.5)';
        context.lineWidth = 1;
        context.stroke();
        context.strokeStyle = accent;
        context.lineWidth = 3;
    }
    context.shadowBlur = 0;

    // Target post + target
    if (target) {
        context.strokeStyle = lm() ? 'rgba(90,70,40,0.6)' : 'rgba(200,170,140,0.35)';
        context.lineWidth = 4;
        context.beginPath();
        context.moveTo(target.x, target.y + target.radii[target.radii.length - 1].r + 4);
        context.lineTo(target.x, groundY);
        context.stroke();

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
    if (started && !arrow && !roundEnded && !waitingForNext) {
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
            power = currentPower(now);
            const barX = 24, barY = boardheight - 90, barW = 16, barH = 70;
            const fillH = (power / 100) * barH;
            const meterG = context.createLinearGradient(0, barY + barH, 0, barY);
            meterG.addColorStop(0, '#39d98a');
            meterG.addColorStop(0.6, '#ffd23f');
            meterG.addColorStop(1, '#ff3860');
            context.save();
            context.shadowBlur = 10;
            context.shadowColor = accent;
            context.strokeStyle = accent;
            context.strokeRect(barX, barY, barW, barH);
            context.fillStyle = meterG;
            context.fillRect(barX, barY + barH - fillH, barW, fillH);
            context.restore();
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

    // Impact particles (sparks for a hit, dust puffs for a miss)
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        const age = now - p.born;
        if (age > p.life) { particles.splice(i, 1); continue; }
        const t = age / p.life;
        const dt = age / 1000;
        const px = p.x + p.vx * dt;
        const py = p.y + p.vy * dt + 220 * dt * dt;
        context.save();
        context.globalAlpha = 1 - t;
        context.fillStyle = p.miss ? '#8a8a90' : '#ffd23f';
        context.beginPath();
        context.arc(px, py, p.miss ? 2 : 2.4, 0, Math.PI * 2);
        context.fill();
        context.restore();
    }

    // Hit marker feedback
    if (hitMarker) {
        const age = now - hitMarker.time;
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

    // Bullseye flash banner
    if (bullseyeFlash) {
        const age = now - bullseyeFlash;
        if (age < 650) {
            context.save();
            context.globalAlpha = Math.max(0, 1 - age / 650);
            context.textAlign = 'center';
            context.fillStyle = '#ffd23f';
            context.shadowBlur = 18;
            context.shadowColor = '#ffd23f';
            context.font = 'bold 24px Orbitron, monospace';
            context.fillText(streak > 1 ? `BULLSEYE x${streak}!` : 'BULLSEYE!', boardwidth / 2, 40);
            context.textAlign = 'left';
            context.restore();
        } else {
            bullseyeFlash = null;
        }
    }

    context.restore();
}

function loop(now) {
    requestAnimationFrame(loop);
    if (paused) { draw(now); return; }
    updateFlight();
    draw(now);
}

function onMouseMove(e) {
    const rect = board.getBoundingClientRect();
    mouseY = e.clientY - rect.top;
}

function onMouseDown() {
    if (!started || paused || roundEnded || waitingForNext || arrow) return;
    aiming = true;
    chargeStart = performance.now();
}

function onMouseUp() {
    if (!aiming) return;
    aiming = false;
    fireArrow();
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

    initStars();
    updateScoreDisplay();
    setupRound();

    board.addEventListener('mousemove', onMouseMove);
    board.addEventListener('mousedown', onMouseDown);
    board.addEventListener('mouseup', onMouseUp);

    requestAnimationFrame(loop);

    GameChrome.boot({
        container: '.game-area',
        icon: '🏹',
        title: 'ARCHERY',
        subtitle: 'Aim with your mouse, hold to charge power, release to fire.',
        instructions: [
            'Move the mouse up/down to set your angle',
            'Hold the mouse button — power oscillates, time your release',
            'Wind drifts the arrow sideways each shot',
        ],
        promptText: 'Press Space / Click to Start',
        onStart: () => { started = true; },
    });
};
