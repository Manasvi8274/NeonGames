const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];
const WHITE_GLYPH = { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♔' };
const BLACK_GLYPH = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' };
const DIFFICULTIES = [
    { key: 'easy', label: 'Easy', depth: 1 },
    { key: 'medium', label: 'Medium', depth: 2 },
    { key: 'hard', label: 'Hard', depth: 3 },
];

let game = new Chess();
let mode = 'pvp'; // 'pvp' | 'pvc'
let playerColor = 'w'; // used only in 'pvc' mode
let difficultyIndex = 1;
let selectedSquare = null;
let legalTargets = [];
let lastMove = null;
let paused = false;
let started = false;
let aiThinking = false;
let currentStreak = 0;
let pendingPromotion = null; // {from, to}

const boardEl = document.getElementById('board');
const turnBox = document.getElementById('turnBox');
const hiscoreBox = document.getElementById('hiscoreBox');
const statusBox = document.getElementById('statusBox');
const modeBtn = document.getElementById('modeBtn');
const colorBtn = document.getElementById('colorBtn');
const difficultyBtn = document.getElementById('difficultyBtn');

function glyphFor(piece) {
    return (piece.color === 'w' ? WHITE_GLYPH : BLACK_GLYPH)[piece.type];
}

function setStatus(text) {
    statusBox.textContent = text || '';
}

function renderBoard() {
    boardEl.innerHTML = '';
    const boardState = game.board(); // row 0 = rank 8
    const inCheck = game.in_check();
    const turn = game.turn();

    for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
            const square = FILES[f] + RANKS[r];
            const cell = document.createElement('div');
            cell.className = 'square ' + (((f + r) % 2 === 0) ? 'light' : 'dark');
            cell.dataset.square = square;

            const piece = boardState[r][f];
            if (piece) {
                cell.textContent = glyphFor(piece);
                cell.classList.add('piece-' + piece.color);
                if (inCheck && piece.type === 'k' && piece.color === turn) {
                    cell.classList.add('in-check');
                }
            }
            if (selectedSquare === square) cell.classList.add('selected');
            if (legalTargets.includes(square)) cell.classList.add('legal-target');
            if (lastMove && (square === lastMove.from || square === lastMove.to)) cell.classList.add('last-move');

            cell.addEventListener('click', () => onSquareClick(square));
            boardEl.appendChild(cell);
        }
    }

    turnBox.textContent = turn === 'w' ? 'White' : 'Black';
}

function isPromotionMove(square) {
    const piece = game.get(selectedSquare);
    return piece && piece.type === 'p' && (square[1] === '8' || square[1] === '1');
}

function showPromotionPicker(from, to) {
    pendingPromotion = { from, to };
    const overlay = document.getElementById('promoOverlay');
    const choices = document.getElementById('promoChoices');
    const color = game.get(from).color;
    const glyphs = color === 'w' ? WHITE_GLYPH : BLACK_GLYPH;
    choices.innerHTML = '';
    ['q', 'r', 'b', 'n'].forEach(type => {
        const btn = document.createElement('button');
        btn.className = 'neon-btn';
        btn.style.width = '54px';
        btn.style.fontSize = '26px';
        btn.style.padding = '10px 0';
        btn.textContent = glyphs[type];
        btn.onclick = () => completePromotion(type);
        choices.appendChild(btn);
    });
    overlay.classList.remove('hidden');
}

function completePromotion(type) {
    document.getElementById('promoOverlay').classList.add('hidden');
    const { from, to } = pendingPromotion;
    const captured = !!game.get(to);
    pendingPromotion = null;
    const result = game.move({ from, to, promotion: type });
    selectedSquare = null;
    legalTargets = [];
    if (result) {
        lastMove = { from: result.from, to: result.to };
        SFX.play(captured ? 'capture' : 'move');
        afterMove();
    } else {
        renderBoard();
    }
}

function onSquareClick(square) {
    if (!started || paused || aiThinking || game.game_over() || pendingPromotion) return;
    if (mode === 'pvc' && game.turn() !== playerColor) return;

    if (selectedSquare) {
        if (legalTargets.includes(square)) {
            if (isPromotionMove(square)) {
                showPromotionPicker(selectedSquare, square);
                selectedSquare = null;
                legalTargets = [];
                renderBoard();
                return;
            }
            const captured = !!game.get(square);
            const result = game.move({ from: selectedSquare, to: square });
            selectedSquare = null;
            legalTargets = [];
            if (result) {
                lastMove = { from: result.from, to: result.to };
                SFX.play(captured ? 'capture' : 'move');
                afterMove();
            } else {
                renderBoard();
            }
            return;
        }
        selectedSquare = null;
        legalTargets = [];
    }

    const piece = game.get(square);
    if (piece && piece.color === game.turn()) {
        selectedSquare = square;
        legalTargets = game.moves({ square: square, verbose: true }).map(m => m.to);
        SFX.play('select');
    }
    renderBoard();
}

function afterMove() {
    renderBoard();
    const ended = checkGameEnd();
    if (!ended && game.in_check()) SFX.play('check');
    if (!ended && mode === 'pvc' && game.turn() !== playerColor) {
        aiThinking = true;
        setStatus('Computer is thinking…');
        const delay = 350 + Math.random() * 250;
        setTimeout(function tryAiMove() {
            if (paused) { setTimeout(tryAiMove, 300); return; }
            const depth = DIFFICULTIES[difficultyIndex].depth;
            const move = ChessAI.bestMove(game, depth);
            if (move) {
                const result = game.move(move);
                if (result) {
                    lastMove = { from: result.from, to: result.to };
                    SFX.play(result.captured ? 'capture' : 'move');
                }
            }
            aiThinking = false;
            renderBoard();
            const stillGoing = !checkGameEnd();
            if (stillGoing && game.in_check()) SFX.play('check');
        }, delay);
    }
}

// Returns true if the game ended (checkmate/stalemate/draw).
function checkGameEnd() {
    if (!game.game_over()) {
        setStatus(game.in_check() ? 'Check!' : '');
        return false;
    }

    let vsComputerWin = false;
    let resultTitle = 'Game Over';
    let resultText = '';

    if (game.in_checkmate()) {
        const loserColor = game.turn(); // side to move is the one checkmated
        const winnerName = loserColor === 'w' ? 'Black' : 'White';
        resultText = winnerName + ' wins by checkmate!';
        setStatus(resultText);
        if (mode === 'pvc') {
            const winnerColor = loserColor === 'w' ? 'b' : 'w';
            vsComputerWin = winnerColor === playerColor;
            resultTitle = vsComputerWin ? 'YOU WIN' : 'YOU LOSE';
        } else {
            resultTitle = winnerName.toUpperCase() + ' WINS';
        }
    } else if (game.in_stalemate()) {
        resultText = 'Stalemate — draw.';
        resultTitle = 'STALEMATE';
        setStatus(resultText);
    } else if (game.in_threefold_repetition()) {
        resultText = 'Draw by repetition.';
        resultTitle = 'DRAW';
        setStatus(resultText);
    } else if (game.insufficient_material()) {
        resultText = 'Draw — insufficient material.';
        resultTitle = 'DRAW';
        setStatus(resultText);
    } else if (game.in_draw()) {
        resultText = 'Draw.';
        resultTitle = 'DRAW';
        setStatus(resultText);
    } else {
        resultText = 'Game over.';
        setStatus(resultText);
    }

    let isRecord = false;
    if (mode === 'pvc') {
        if (vsComputerWin) {
            currentStreak++;
            const best = parseInt(localStorage.getItem('chess-hiscore'), 10) || 0;
            if (currentStreak > best) {
                localStorage.setItem('chess-hiscore', String(currentStreak));
                hiscoreBox.textContent = currentStreak;
                isRecord = true;
                if (window.Leaderboard) Leaderboard.checkAndPromptIfRecord('chess', currentStreak);
            }
        } else {
            // Loss or draw against the computer resets the current streak.
            currentStreak = 0;
        }
    }

    const lines = [{ label: 'Result', value: resultText.replace(/\.$/, '') }];
    if (mode === 'pvc') lines.push({ label: 'Win streak', value: currentStreak, record: isRecord });

    GameChrome.showEnd({
        container: '.game-area',
        icon: mode === 'pvc' ? (vsComputerWin ? '🏆' : (game.in_checkmate() ? '💀' : '🤝')) : '♟️',
        title: resultTitle,
        win: mode === 'pvc' ? vsComputerWin : true,
        sound: isRecord ? 'record' : undefined,
        badge: isRecord ? 'NEW BEST STREAK!' : '',
        lines,
        onRestart: resetBoard,
    });

    return true;
}

function toggleMode() {
    mode = mode === 'pvp' ? 'pvc' : 'pvp';
    modeBtn.textContent = 'Mode: ' + (mode === 'pvp' ? 'PvP' : 'vs Computer');
    colorBtn.style.display = mode === 'pvc' ? 'block' : 'none';
    difficultyBtn.style.display = mode === 'pvc' ? 'block' : 'none';
    currentStreak = 0;
    SFX.play('click');
    resetBoard();
}

function toggleColor() {
    playerColor = playerColor === 'w' ? 'b' : 'w';
    colorBtn.textContent = 'You play: ' + (playerColor === 'w' ? 'White' : 'Black');
    SFX.play('click');
    resetBoard();
}

function cycleDifficulty() {
    difficultyIndex = (difficultyIndex + 1) % DIFFICULTIES.length;
    difficultyBtn.textContent = 'Difficulty: ' + DIFFICULTIES[difficultyIndex].label;
    localStorage.setItem('chess-difficulty', DIFFICULTIES[difficultyIndex].key);
    SFX.play('click');
}

function resetBoard() {
    game.reset();
    selectedSquare = null;
    legalTargets = [];
    lastMove = null;
    aiThinking = false;
    pendingPromotion = null;
    document.getElementById('promoOverlay').classList.add('hidden');
    setStatus('');
    renderBoard();
    if (started && mode === 'pvc' && playerColor === 'b') {
        afterMove();
    }
}

function togglePause() {
    if (!started) return;
    paused = !paused;
    const btn = document.getElementById('pauseBtn');
    btn.textContent = paused ? '▶ Resume' : '⏸ Pause';
    btn.classList.toggle('paused', paused);
    document.getElementById('pauseOverlay').style.display = paused ? 'flex' : 'none';
    SFX.play('pause');
}

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') togglePause();
});

// Init
hiscoreBox.textContent = parseInt(localStorage.getItem('chess-hiscore'), 10) || 0;
const storedDifficulty = localStorage.getItem('chess-difficulty');
const storedIdx = DIFFICULTIES.findIndex(d => d.key === storedDifficulty);
if (storedIdx >= 0) difficultyIndex = storedIdx;
difficultyBtn.textContent = 'Difficulty: ' + DIFFICULTIES[difficultyIndex].label;
renderBoard();

GameChrome.boot({
    container: '.game-area',
    icon: '♟️',
    title: 'CHESS',
    subtitle: 'Play a friend locally, or battle the computer.',
    instructions: [
        'Click a piece, then click a highlighted square to move',
        'Toggle "Mode" for Player vs Computer, pick your color & difficulty',
        'Pawns reaching the last rank let you choose the promotion piece',
    ],
    promptText: 'Press Space / Click to Start',
    onStart: () => {
        started = true;
        if (mode === 'pvc' && playerColor === 'b') afterMove();
    },
});
