// Perfect-play minimax for Tic Tac Toe. The search space is tiny (max depth 9,
// at most 9! leaf paths) so an exhaustive search with no pruning is instant —
// no need for alpha-beta here. Also exposes the win/draw detection used by
// index.js so there's a single source of truth for "what counts as a win."
const TicTacToeAI = (function () {
    const LINES = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6],
    ];

    function getWinner(board) {
        for (const [a, b, c] of LINES) {
            if (board[a] && board[a] === board[b] && board[b] === board[c]) {
                return { winner: board[a], line: [a, b, c] };
            }
        }
        return null;
    }

    function isFull(board) {
        return board.every(cell => cell !== null);
    }

    function minimax(board, player, aiMark, humanMark, depth) {
        const result = getWinner(board);
        if (result) {
            return { score: result.winner === aiMark ? 10 - depth : depth - 10 };
        }
        if (isFull(board)) return { score: 0 };

        const moves = [];
        for (let i = 0; i < 9; i++) {
            if (board[i] === null) {
                board[i] = player;
                const outcome = minimax(board, player === aiMark ? humanMark : aiMark, aiMark, humanMark, depth + 1);
                moves.push({ index: i, score: outcome.score });
                board[i] = null;
            }
        }

        return player === aiMark
            ? moves.reduce((best, m) => (m.score > best.score ? m : best))
            : moves.reduce((best, m) => (m.score < best.score ? m : best));
    }

    function bestMove(board, aiMark, humanMark) {
        const best = minimax(board.slice(), aiMark, aiMark, humanMark, 0);
        return best.index;
    }

    return { bestMove, getWinner, isFull };
})();
