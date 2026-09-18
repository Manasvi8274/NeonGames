let board = Array(9).fill(null);
let currentPlayer = 'X';
let mode = 'pvp'; // 'pvp' | 'pvc' — computer always plays O
let paused = false;
let started = false;
let gameOver = false;
let streak = JSON.parse(localStorage.getItem('tic-tac-toe-hiscore') || '0');

function renderHiscore() {
    hiscoreBox.textContent = streak;
}

function renderTurn() {
    turnBox.textContent = gameOver ? '—' : currentPlayer;
}

function setStatus(msg) {
    statusMsg.textContent = msg || '';
}

function renderBoard(winLine) {
    board.forEach((mark, i) => {
        const cell = document.getElementById('cell-' + i);
        cell.className = 'cell';
        if (mark) cell.classList.add('mark-' + mark.toLowerCase());
        if (winLine && winLine.includes(i)) cell.classList.add('win-cell');
        cell.textContent = mark || '';
    });
}

function buildBoard() {
    const boardEl = document.getElementById('board');
    boardEl.innerHTML = '';
    for (let i = 0; i < 9; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.id = 'cell-' + i;
        cell.addEventListener('click', () => handleCellClick(i));
        boardEl.appendChild(cell);
    }
}

function handleCellClick(i) {
    if (!started || paused || gameOver || board[i]) return;
    if (mode === 'pvc' && currentPlayer === 'O') return; // computer's turn
    SFX.play('select');
    placeMark(i);
}

function placeMark(i) {
    board[i] = currentPlayer;

    const result = TicTacToeAI.getWinner(board);
    if (result) {
        renderBoard(result.line);
        finishGame(result.winner);
        return;
    }
    if (TicTacToeAI.isFull(board)) {
        renderBoard(null);
        finishGame(null);
        return;
    }

    currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
    renderBoard(null);
    renderTurn();

    if (mode === 'pvc' && currentPlayer === 'O') {
        window.setTimeout(computerMove, 300);
    }
}

function computerMove() {
    // currentPlayer guard makes this safe to call more than once for the same
    // turn (e.g. a pause/resume during the "thinking" delay can otherwise
    // schedule it twice) without placing an out-of-turn mark.
    if (paused || gameOver || currentPlayer !== 'O') return;
    const move = TicTacToeAI.bestMove(board, 'O', 'X');
    if (move !== null && move !== undefined && move >= 0) placeMark(move);
}

function finishGame(winner) {
    gameOver = true;
    renderTurn();
    setStatus(winner ? winner + ' WINS!' : 'DRAW');

    let isRecord = false;
    if (mode === 'pvc') {
        const prevBest = JSON.parse(localStorage.getItem('tic-tac-toe-hiscore') || '0');
        streak = winner === 'X' ? streak + 1 : 0;
        localStorage.setItem('tic-tac-toe-hiscore', JSON.stringify(streak));
        renderHiscore();
        if (streak > prevBest && window.Leaderboard) {
            isRecord = true;
            Leaderboard.checkAndPromptIfRecord('tic-tac-toe', streak);
        }
    }

    const lines = [];
    if (mode === 'pvc') lines.push({ label: 'Win streak', value: streak, record: isRecord });
    const playerWon = mode === 'pvc' ? winner === 'X' : !!winner;

    GameChrome.showEnd({
        container: '.game-area',
        icon: !winner ? '🤝' : (mode === 'pvc' ? (winner === 'X' ? '🏆' : '💀') : '⭕'),
        title: winner ? winner + ' WINS!' : 'DRAW',
        win: playerWon,
        sound: isRecord ? 'record' : undefined,
        badge: isRecord ? 'NEW BEST STREAK!' : '',
        lines,
        onRestart: resetBoard,
    });
}

function resetBoard() {
    board = Array(9).fill(null);
    currentPlayer = 'X';
    gameOver = false;
    setStatus('');
    buildBoard();
    renderTurn();
}

function setMode(newMode) {
    mode = newMode;
    document.getElementById('modePvp').classList.toggle('active', mode === 'pvp');
    document.getElementById('modePvc').classList.toggle('active', mode === 'pvc');
    resetBoard();
}

function togglePause() {
    if (!started || gameOver) return;
    paused = !paused;
    SFX.play('pause');
    const btn = document.getElementById('pauseBtn');
    const overlay = document.getElementById('pauseOverlay');
    if (btn) {
        btn.textContent = paused ? '▶ Resume' : '⏸ Pause';
        btn.classList.toggle('paused', paused);
    }
    if (overlay) overlay.style.display = paused ? 'flex' : 'none';
    // If the computer's move was skipped while paused (it bails out early
    // rather than queueing), retrigger it now so the game can't soft-lock.
    if (!paused && mode === 'pvc' && currentPlayer === 'O' && !gameOver) {
        window.setTimeout(computerMove, 300);
    }
}

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') togglePause();
});

document.addEventListener('DOMContentLoaded', () => {
    renderHiscore();
    buildBoard();
    renderTurn();

    GameChrome.boot({
        container: '.game-area',
        icon: '⭕',
        title: 'TIC TAC TOE',
        subtitle: 'Classic 3x3 — play a friend or the unbeatable computer.',
        instructions: [
            'Click a square to place your mark',
            'Switch to "vs CPU" for a computer opponent',
        ],
        promptText: 'Press Space / Click to Start',
        onStart: () => { started = true; },
    });
});
