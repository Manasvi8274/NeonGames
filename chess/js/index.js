const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];
const WHITE_GLYPH = { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♔' };
const BLACK_GLYPH = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' };

let game = new Chess();
let mode = 'pvp'; // 'pvp' | 'pvc'
let playerColor = 'w'; // used only in 'pvc' mode
let selectedSquare = null;
let legalTargets = [];
let lastMove = null;
let paused = false;
let aiThinking = false;
let currentStreak = 0;

const boardEl = document.getElementById('board');
const turnBox = document.getElementById('turnBox');
const hiscoreBox = document.getElementById('hiscoreBox');
const statusBox = document.getElementById('statusBox');
const modeBtn = document.getElementById('modeBtn');

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

function onSquareClick(square) {
    if (paused || aiThinking || game.game_over()) return;
    if (mode === 'pvc' && game.turn() !== playerColor) return;

    if (selectedSquare) {
        if (legalTargets.includes(square)) {
            const moveObj = { from: selectedSquare, to: square };
            const piece = game.get(selectedSquare);
            if (piece && piece.type === 'p' && (square[1] === '8' || square[1] === '1')) {
                moveObj.promotion = 'q'; // always promote to queen for simplicity
            }
            const result = game.move(moveObj);
            selectedSquare = null;
            legalTargets = [];
            if (result) {
                lastMove = { from: result.from, to: result.to };
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
    }
    renderBoard();
}

function afterMove() {
    renderBoard();
    const ended = checkGameEnd();
    if (!ended && mode === 'pvc' && game.turn() !== playerColor) {
        aiThinking = true;
        setStatus('Computer is thinking…');
        const delay = 350 + Math.random() * 250;
        setTimeout(function tryAiMove() {
            if (paused) { setTimeout(tryAiMove, 300); return; }
            const move = ChessAI.bestMove(game, 2);
            if (move) {
                const result = game.move(move);
                if (result) lastMove = { from: result.from, to: result.to };
            }
            aiThinking = false;
            renderBoard();
            checkGameEnd();
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

    if (game.in_checkmate()) {
        const loserColor = game.turn(); // side to move is the one checkmated
        const winnerName = loserColor === 'w' ? 'Black' : 'White';
        setStatus(winnerName + ' wins by checkmate!');
        if (mode === 'pvc') {
            const winnerColor = loserColor === 'w' ? 'b' : 'w';
            vsComputerWin = winnerColor === playerColor;
        }
    } else if (game.in_stalemate()) {
        setStatus('Stalemate — draw.');
    } else if (game.in_threefold_repetition()) {
        setStatus('Draw by repetition.');
    } else if (game.insufficient_material()) {
        setStatus('Draw — insufficient material.');
    } else if (game.in_draw()) {
        setStatus('Draw.');
    } else {
        setStatus('Game over.');
    }

    if (mode === 'pvc') {
        if (vsComputerWin) {
            currentStreak++;
            const best = parseInt(localStorage.getItem('chess-hiscore'), 10) || 0;
            if (currentStreak > best) {
                localStorage.setItem('chess-hiscore', String(currentStreak));
                hiscoreBox.textContent = currentStreak;
                if (window.Leaderboard) Leaderboard.checkAndPromptIfRecord('chess', currentStreak);
            }
        } else {
            // Loss or draw against the computer resets the current streak.
            currentStreak = 0;
        }
    }

    return true;
}

function toggleMode() {
    mode = mode === 'pvp' ? 'pvc' : 'pvp';
    modeBtn.textContent = 'Mode: ' + (mode === 'pvp' ? 'PvP' : 'vs Computer');
    currentStreak = 0;
    resetBoard();
}

function resetBoard() {
    game.reset();
    selectedSquare = null;
    legalTargets = [];
    lastMove = null;
    aiThinking = false;
    setStatus('');
    renderBoard();
}

function togglePause() {
    paused = !paused;
    const btn = document.getElementById('pauseBtn');
    btn.textContent = paused ? '▶ Resume' : '⏸ Pause';
    btn.classList.toggle('paused', paused);
    document.getElementById('pauseOverlay').style.display = paused ? 'flex' : 'none';
}

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') togglePause();
});

// Init
hiscoreBox.textContent = parseInt(localStorage.getItem('chess-hiscore'), 10) || 0;
renderBoard();
