//musics
let gameOverMusicPlayed = false;
let gameover_music = new Audio("js/gameover.mp3");
let collide = new Audio("js/collide.wav");
let music = new Audio("js/music.mp3");

//var
let board;
let boardwidth, boardheight;
switch (getScreenTier()) {
    case 'mobile':
        boardwidth = window.innerWidth - 20;
        boardheight = window.innerHeight * 0.45;
        break;
    case 'tablet':
        boardwidth = Math.min(680, window.innerWidth - 40);
        boardheight = window.innerHeight * 0.55;
        break;
    default:
        boardwidth = window.innerWidth / 2.7;
        boardheight = window.innerHeight / 1.2;
}
let context;

//player
let playerwidth = (boardwidth - 80) / 5;
let playerheight = (boardwidth - 80) / 50;
let playervelocityX = 20;

let player = {
    x: boardwidth / 2 - playerwidth / 2,
    y: boardheight - playerheight - 5,
    width: playerwidth,
    height: playerheight,
    velocityX: playervelocityX,
}

//ball
let ballwidth = boardwidth / 50;
let ballheight = boardwidth / 50;
let ballvelocityx = 3;
let ballvelocityy = -2;
let ball = {
    x: boardwidth / 2,
    y: boardheight / 2,
    width: ballwidth,
    height: ballheight,
    velocityx: ballvelocityx,
    velocityy: ballvelocityy,
}

//blocks
let blockarray = [];
let blockwidth = (boardwidth - 100) / 8;
let blockheight = (boardwidth - 80) / 50;
let blockcolumns = 8;
let blockrows = 3;
let blockmaxrows = 10;
let blockcount = 0;

//starting block position
let blockx = 15;
let blocky = 45;

//score
let score = 0;

//highscore
let hiscore = localStorage.getItem("brickbreaker-hiscore");
if (hiscore === null) {
    hiscore = 0;
    localStorage.setItem("brickbreaker-hiscore", JSON.stringify(hiscore));
} else {
    hiscore = JSON.parse(localStorage.getItem("brickbreaker-hiscore"));
}

//game state
let gameover = false;
let paused = false;
let started = false;

// Lives system
let lives = 3;

// Power-up system
let droppingPowers = [];
let fireballActive = false;
let fireballTimer = null;
let wideTimer = null;
let slowTimer = null;

const BRICK_POWERS = [
    { type: 'wide',     color: '#0095ff', label: 'WIDE'  },
    { type: 'slow',     color: '#00ccff', label: 'SLOW'  },
    { type: 'life',     color: '#ff0066', label: '+LIFE' },
    { type: 'fireball', color: '#ff6600', label: 'FIRE'  },
];

function lm() { return document.body.classList.contains('light-mode'); }

// Lightens (positive amt) or darkens (negative) a "#rrggbb" color.
function shade(hex, amt) {
    const n = parseInt(hex.replace('#', ''), 16);
    const clamp = (v) => Math.max(0, Math.min(255, v));
    const r = clamp(((n >> 16) & 255) + amt);
    const g = clamp(((n >> 8) & 255) + amt);
    const b = clamp((n & 255) + amt);
    return `rgb(${r},${g},${b})`;
}

// Beveled 3D block: light top/left strip + dark bottom/right strip framing
// a flat face, instead of a flat fillRect — reads as a raised cube/paddle.
function drawBevelRect(x, y, w, h, color) {
    const b = Math.max(1.5, Math.min(w, h) * 0.22);
    const x1 = x + w, y1 = y + h;
    const ix0 = x + b, iy0 = y + b, ix1 = Math.max(ix0, x1 - b), iy1 = Math.max(iy0, y1 - b);

    context.beginPath();
    context.moveTo(x, y); context.lineTo(x1, y); context.lineTo(ix1, iy0);
    context.lineTo(ix0, iy0); context.lineTo(ix0, iy1); context.lineTo(x, y1);
    context.closePath();
    context.fillStyle = shade(color, 55);
    context.fill();

    context.beginPath();
    context.moveTo(x1, y); context.lineTo(x1, y1); context.lineTo(x, y1);
    context.lineTo(ix0, iy1); context.lineTo(ix1, iy1); context.lineTo(ix1, iy0);
    context.closePath();
    context.fillStyle = shade(color, -50);
    context.fill();

    context.fillStyle = color;
    context.fillRect(ix0, iy0, Math.max(0, ix1 - ix0), Math.max(0, iy1 - iy0));
}

// DOM updates
function updateScoreDisplay() {
    const s = document.getElementById('scoreBox');
    const h = document.getElementById('hiscoreBox');
    if (s) s.innerHTML = score;
    if (h) h.innerHTML = hiscore;
}

function updateLivesDisplay() {
    const lb = document.getElementById('livesBox');
    if (lb) lb.innerHTML = ('❤ '.repeat(lives)).trim();
}

function updatePowerHUD() {
    const hud = document.getElementById('powerHUD');
    if (!hud) return;
    let label = '', color = '#fff';
    if (fireballActive)  { label = '🔥 FIREBALL';    color = '#ff6600'; }
    else if (wideTimer)  { label = '↔ WIDE PADDLE';  color = '#0095ff'; }
    else if (slowTimer)  { label = '🐌 SLOW BALL';   color = '#00ccff'; }
    if (label) {
        hud.innerHTML = `<span>${label}</span>`;
        hud.style.color = color;
        hud.style.borderColor = color;
        hud.style.display = 'flex';
    } else {
        hud.style.display = 'none';
    }
}

// Pause
function togglePause() {
    if (!started || gameover) return;
    paused = !paused;
    const btn = document.getElementById('pauseBtn');
    if (btn) {
        btn.textContent = paused ? '▶ Resume' : '⏸ Pause';
        btn.classList.toggle('paused', paused);
    }
    if (paused) music.pause();
    else music.play();
}

function drawPauseOverlay() {
    context.fillStyle = lm() ? 'rgba(238,242,255,0.92)' : 'rgba(5,5,16,0.92)';
    context.fillRect(0, 0, board.width, board.height);
    context.shadowBlur = lm() ? 0 : 20;
    context.shadowColor = lm() ? 'transparent' : '#0095ff';
    context.fillStyle = lm() ? '#0044aa' : '#0095ff';
    context.font = "bold 40px Orbitron, monospace";
    context.fillText("PAUSED", board.width / 2 - 90, board.height / 2 - 10);
    context.shadowBlur = 0;
    context.fillStyle = lm() ? 'rgba(40,40,80,0.8)' : 'rgba(160,180,220,0.8)';
    context.font = "12px Orbitron, monospace";
    context.fillText("Press P to resume", board.width / 2 - 72, board.height / 2 + 32);
}

// Power-up drops
function dropPower(bx, by) {
    if (Math.random() > 0.28) return;
    const def = BRICK_POWERS[Math.floor(Math.random() * BRICK_POWERS.length)];
    droppingPowers.push({ x: bx, y: by, width: 52, height: 22, vy: 2.5, ...def });
}

function applyBrickPower(type) {
    switch (type) {
        case 'wide':
            player.width = playerwidth * 1.8;
            if (wideTimer) clearTimeout(wideTimer);
            wideTimer = setTimeout(() => { player.width = playerwidth; wideTimer = null; updatePowerHUD(); }, 8000);
            break;
        case 'slow':
            ball.velocityx *= 0.55;
            ball.velocityy *= 0.55;
            if (slowTimer) clearTimeout(slowTimer);
            slowTimer = setTimeout(() => { ball.velocityx /= 0.55; ball.velocityy /= 0.55; slowTimer = null; updatePowerHUD(); }, 8000);
            break;
        case 'life':
            lives = Math.min(5, lives + 1);
            updateLivesDisplay();
            break;
        case 'fireball':
            fireballActive = true;
            if (fireballTimer) clearTimeout(fireballTimer);
            fireballTimer = setTimeout(() => { fireballActive = false; fireballTimer = null; updatePowerHUD(); }, 5000);
            break;
    }
    updatePowerHUD();
}

window.onload = function () {
    board = document.getElementById("board");
    board.height = boardheight;
    board.width = boardwidth;
    context = board.getContext("2d");

    context.shadowBlur = 20;
    context.shadowColor = '#0095ff';
    context.fillStyle = '#0095ff';
    context.fillRect(player.x, player.y, player.width, player.height);
    context.shadowBlur = 0;

    updateScoreDisplay();
    updateLivesDisplay();
    updatePowerHUD();

    requestAnimationFrame(update);
    document.addEventListener("keydown", moveplayer);
    setupTouchControls();
    createblock();

    GameChrome.boot({
        container: '.game-area',
        icon: '🧱',
        title: 'BRICK BREAKER',
        subtitle: 'Bounce the ball, clear every brick.',
        instructions: [
            '<kbd>←</kbd> <kbd>→</kbd> to move the paddle',
            'Catch falling power-ups for an edge',
            '<kbd>P</kbd> / <kbd>ESC</kbd> to pause',
        ],
        promptText: 'Press Space / Click to Start',
        onStart: () => { started = true; music.play(); },
    });
}

function update() {
    requestAnimationFrame(update);

    if (!started) return;

    if (paused) {
        drawPauseOverlay();
        return;
    }

    if (gameover) {
        if (!gameOverMusicPlayed) {
            music.pause();
            gameover_music.play();
            gameOverMusicPlayed = true;
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
                    { label: 'Hi Score', value: hiscore },
                ],
                onRestart: resetgame,
            });
            if (typeof Leaderboard !== 'undefined') Leaderboard.checkAndPromptIfRecord('brick_breaker', score);
        }
        return;
    }

    // Background
    context.fillStyle = lm() ? '#f0f4ff' : '#050510';
    context.fillRect(0, 0, board.width, board.height);

    // Paddle
    let paddleColor = lm()
        ? (wideTimer ? '#009988' : '#0055cc')
        : (wideTimer ? '#00ffcc' : '#0095ff');
    context.shadowBlur = lm() ? 8 : 20;
    context.shadowColor = paddleColor;
    drawBevelRect(player.x, player.y, player.width, player.height, paddleColor);
    context.shadowBlur = 0;

    // Ball — radial-gradient sphere shading instead of a flat disc
    ball.x += ball.velocityx;
    ball.y += ball.velocityy;
    let ballColor = fireballActive ? '#ff6600' : (lm() ? '#1a1a55' : '#ffffff');
    let ballGlow  = fireballActive ? '#ff3300' : (lm() ? '#3333aa' : '#ffffff');
    const ballCx = ball.x + ball.width / 2, ballCy = ball.y + ball.height / 2, ballR = ball.width / 2;
    context.shadowBlur = fireballActive ? 30 : (lm() ? 8 : 20);
    context.shadowColor = ballGlow;
    const ballGrad = context.createRadialGradient(
        ballCx - ballR * 0.35, ballCy - ballR * 0.35, ballR * 0.1,
        ballCx, ballCy, ballR
    );
    ballGrad.addColorStop(0, '#ffffff');
    ballGrad.addColorStop(0.5, ballColor);
    ballGrad.addColorStop(1, fireballActive ? '#cc4400' : (lm() ? '#1a1a55' : '#c8c8d8'));
    context.fillStyle = ballGrad;
    context.beginPath();
    context.arc(ballCx, ballCy, ballR, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;

    // Ball wall bouncing
    if (ball.y <= 0) {
        ball.y = 0;
        ball.velocityy = Math.abs(ball.velocityy);
    } else if (ball.x <= 0) {
        ball.x = 0;
        ball.velocityx = Math.abs(ball.velocityx);
    } else if (ball.x + ball.width >= boardwidth) {
        ball.x = boardwidth - ball.width;
        ball.velocityx = -Math.abs(ball.velocityx);
    } else if (ball.y + ball.height >= boardheight) {
        lives--;
        updateLivesDisplay();
        if (lives <= 0) {
            gameover = true;
        } else {
            ball.x = boardwidth / 2;
            ball.y = boardheight / 2;
            ball.velocityx = ballvelocityx;
            ball.velocityy = ballvelocityy;
        }
    }

    // Ball vs paddle
    if (detectcollision(ball, player)) {
        resolveBounce(ball, player);
        collide.play();
    }

    // Blocks
    const blockColors = ['#ff0066', '#ff6600', '#ffcc00', '#00ff88', '#0095ff', '#cc00ff'];
    for (let i = 0; i < blockarray.length; i++) {
        let block = blockarray[i];
        if (!block.break) {
            if (detectcollision(ball, block)) {
                if (!fireballActive) resolveBounce(ball, block);
                collide.play();
                block.break = true;
                blockcount--;
                score += 100;
                if (hiscore < score) {
                    hiscore = score;
                    localStorage.setItem("brickbreaker-hiscore", JSON.stringify(hiscore));
                }
                updateScoreDisplay();
                dropPower(block.x + block.width / 2 - 26, block.y);
            }

            if (!block.break) {
                let color = blockColors[block.row % blockColors.length];
                context.shadowBlur = lm() ? 3 : 8;
                context.shadowColor = color;
                drawBevelRect(block.x, block.y, block.width, block.height, color);
                context.shadowBlur = 0;
            }
        }
    }

    // Dropping power-ups
    for (let i = droppingPowers.length - 1; i >= 0; i--) {
        const p = droppingPowers[i];
        p.y += p.vy;

        context.shadowBlur = lm() ? 4 : 10;
        context.shadowColor = p.color;
        context.fillStyle = p.color;
        context.beginPath();
        context.roundRect(p.x, p.y, p.width, p.height, 6);
        context.fill();
        context.shadowBlur = 0;

        context.fillStyle = '#000';
        context.font = "bold 10px Orbitron, monospace";
        context.fillText(p.label, p.x + 6, p.y + 15);

        if (p.x < player.x + player.width &&
            p.x + p.width > player.x &&
            p.y < player.y + player.height &&
            p.y + p.height > player.y) {
            applyBrickPower(p.type);
            droppingPowers.splice(i, 1);
        } else if (p.y > boardheight) {
            droppingPowers.splice(i, 1);
        }
    }

    // Next level
    if (blockcount === 0) {
        context.shadowBlur = lm() ? 0 : 20;
        context.shadowColor = lm() ? 'transparent' : '#00ff88';
        context.fillStyle = lm() ? '#005c27' : '#00ff88';
        context.font = "bold 22px Orbitron, monospace";
        context.fillText("LEVEL CLEARED!", board.width / 2 - 100, board.height / 2);
        context.shadowBlur = 0;
        setTimeout(() => { }, 1000);
        score += 1000;
        updateScoreDisplay();
        blockrows = Math.min(blockrows + 1, blockmaxrows);
        createblock();
    }
}

function outbound(xpos) {
    return (xpos < 0 || xpos + player.width > boardwidth);
}

function moveplayer(e) {
    if (e.code === "ArrowLeft" || e.code === "ArrowRight" || e.code === "Space") {
        e.preventDefault();
    }
    if (e.code === "KeyP" || e.code === "Escape") {
        togglePause();
        return;
    }
    if (!started || paused || gameover) return;
    if (e.code === "ArrowLeft") {
        let nextx = player.x - player.velocityX;
        if (!outbound(nextx)) player.x = nextx;
    } else if (e.code === "ArrowRight") {
        let nextx = player.x + player.velocityX;
        if (!outbound(nextx)) player.x = nextx;
    }
}

// Drag-to-follow paddle control, plus on-screen buttons, for touch devices.
function setupTouchControls() {
    board.addEventListener('touchmove', (e) => {
        if (!started || paused || gameover) return;
        e.preventDefault();
        const rect = board.getBoundingClientRect();
        const scaleX = board.width / rect.width;
        const touchX = (e.touches[0].clientX - rect.left) * scaleX;
        const nextx = touchX - player.width / 2;
        player.x = Math.max(0, Math.min(boardwidth - player.width, nextx));
    }, { passive: false });

    const bindHold = (id, dir) => {
        const el = document.getElementById(id);
        if (!el) return;
        let repeatTimer = null; // own timer per button — presses on the other button must not clobber this one
        const step = () => {
            if (!started || paused || gameover) return;
            const nextx = player.x + dir * player.velocityX;
            if (!outbound(nextx)) player.x = nextx;
        };
        el.addEventListener('touchstart', (e) => {
            e.preventDefault();
            step();
            repeatTimer = setInterval(step, 90);
        }, { passive: false });
        const stop = (e) => { if (e) e.preventDefault(); if (repeatTimer) { clearInterval(repeatTimer); repeatTimer = null; } };
        el.addEventListener('touchend', stop, { passive: false });
        el.addEventListener('touchcancel', stop, { passive: false });
    };
    bindHold('btnLeft', -1);
    bindHold('btnRight', 1);
}

function detectcollision(a, b) {
    return a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y;
}

// Resolves bounce by reflecting along the axis of least penetration
function resolveBounce(ball, rect) {
    const overlapLeft   = (ball.x + ball.width)  - rect.x;
    const overlapRight  = (rect.x + rect.width)  - ball.x;
    const overlapTop    = (ball.y + ball.height)  - rect.y;
    const overlapBottom = (rect.y + rect.height)  - ball.y;
    const minX = Math.min(overlapLeft, overlapRight);
    const minY = Math.min(overlapTop, overlapBottom);
    if (minX < minY) ball.velocityx *= -1;
    else             ball.velocityy *= -1;
}

function createblock() {
    blockarray = [];
    for (let c = 0; c < blockcolumns; c++) {
        for (let r = 0; r < blockrows; r++) {
            let block = {
                x: blockx + c * blockwidth + c * 10,
                y: blocky + r * blockheight + r * 10,
                height: blockheight,
                width: blockwidth,
                break: false,
                row: r,
            }
            blockarray.push(block);
        }
    }
    blockcount = blockarray.length;
}

function resetgame() {
    gameover = false;
    gameOverMusicPlayed = false;
    paused = false;
    const btn = document.getElementById('pauseBtn');
    if (btn) { btn.textContent = '⏸ Pause'; btn.classList.remove('paused'); }
    lives = 3;
    droppingPowers = [];
    fireballActive = false;
    if (fireballTimer) { clearTimeout(fireballTimer); fireballTimer = null; }
    if (wideTimer)     { clearTimeout(wideTimer);     wideTimer = null; }
    if (slowTimer)     { clearTimeout(slowTimer);      slowTimer = null; }
    player = {
        x: boardwidth / 2 - playerwidth / 2,
        y: boardheight - playerheight - 5,
        width: playerwidth,
        height: playerheight,
        velocityX: playervelocityX,
    }
    ball = {
        x: boardwidth / 2,
        y: boardheight / 2,
        width: ballwidth,
        height: ballheight,
        velocityx: ballvelocityx,
        velocityy: ballvelocityy,
    }
    score = 0;
    blockrows = 3;
    updateScoreDisplay();
    updateLivesDisplay();
    updatePowerHUD();
    createblock();
    music.play();
}

function resethiscore() {
    hiscore = 0;
    localStorage.setItem("brickbreaker-hiscore", JSON.stringify(hiscore));
    updateScoreDisplay();
}
