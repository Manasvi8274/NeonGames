// Modest-strength chess AI: minimax with alpha-beta pruning over a shallow
// search depth, plus a material + piece-square-table evaluation. This is a
// deliberately lightweight, dependency-free engine (no Stockfish) — good
// enough for a casual hobby opponent, not a serious chess engine.
const ChessAI = (function () {
    const VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

    // Piece-square tables, indexed [rank-from-8][file-from-a], i.e. row 0 = rank 8.
    // Written from White's perspective; flipped vertically for Black.
    const PST = {
        p: [
            [0, 0, 0, 0, 0, 0, 0, 0],
            [50, 50, 50, 50, 50, 50, 50, 50],
            [10, 10, 20, 30, 30, 20, 10, 10],
            [5, 5, 10, 25, 25, 10, 5, 5],
            [0, 0, 0, 20, 20, 0, 0, 0],
            [5, -5, -10, 0, 0, -10, -5, 5],
            [5, 10, 10, -20, -20, 10, 10, 5],
            [0, 0, 0, 0, 0, 0, 0, 0],
        ],
        n: [
            [-50, -40, -30, -30, -30, -30, -40, -50],
            [-40, -20, 0, 0, 0, 0, -20, -40],
            [-30, 0, 10, 15, 15, 10, 0, -30],
            [-30, 5, 15, 20, 20, 15, 5, -30],
            [-30, 0, 15, 20, 20, 15, 0, -30],
            [-30, 5, 10, 15, 15, 10, 5, -30],
            [-40, -20, 0, 5, 5, 0, -20, -40],
            [-50, -40, -30, -30, -30, -30, -40, -50],
        ],
        b: [
            [-20, -10, -10, -10, -10, -10, -10, -20],
            [-10, 0, 0, 0, 0, 0, 0, -10],
            [-10, 0, 5, 10, 10, 5, 0, -10],
            [-10, 5, 5, 10, 10, 5, 5, -10],
            [-10, 0, 10, 10, 10, 10, 0, -10],
            [-10, 10, 10, 10, 10, 10, 10, -10],
            [-10, 5, 0, 0, 0, 0, 5, -10],
            [-20, -10, -10, -10, -10, -10, -10, -20],
        ],
        r: [
            [0, 0, 0, 0, 0, 0, 0, 0],
            [5, 10, 10, 10, 10, 10, 10, 5],
            [-5, 0, 0, 0, 0, 0, 0, -5],
            [-5, 0, 0, 0, 0, 0, 0, -5],
            [-5, 0, 0, 0, 0, 0, 0, -5],
            [-5, 0, 0, 0, 0, 0, 0, -5],
            [-5, 0, 0, 0, 0, 0, 0, -5],
            [0, 0, 0, 5, 5, 0, 0, 0],
        ],
        q: [
            [-20, -10, -10, -5, -5, -10, -10, -20],
            [-10, 0, 0, 0, 0, 0, 0, -10],
            [-10, 0, 5, 5, 5, 5, 0, -10],
            [-5, 0, 5, 5, 5, 5, 0, -5],
            [0, 0, 5, 5, 5, 5, 0, -5],
            [-10, 5, 5, 5, 5, 5, 0, -10],
            [-10, 0, 5, 0, 0, 0, 0, -10],
            [-20, -10, -10, -5, -5, -10, -10, -20],
        ],
        k: [
            [-30, -40, -40, -50, -50, -40, -40, -30],
            [-30, -40, -40, -50, -50, -40, -40, -30],
            [-30, -40, -40, -50, -50, -40, -40, -30],
            [-30, -40, -40, -50, -50, -40, -40, -30],
            [-20, -30, -30, -40, -40, -30, -30, -20],
            [-10, -20, -20, -20, -20, -20, -20, -10],
            [20, 20, 0, 0, 0, 0, 20, 20],
            [20, 30, 10, 0, 0, 10, 30, 20],
        ],
    };

    function evaluate(game) {
        const board = game.board();
        let score = 0;
        for (let r = 0; r < 8; r++) {
            for (let f = 0; f < 8; f++) {
                const piece = board[r][f];
                if (!piece) continue;
                const table = PST[piece.type];
                const posBonus = piece.color === 'w' ? table[r][f] : table[7 - r][f];
                const val = VALUES[piece.type] + posBonus;
                score += piece.color === 'w' ? val : -val;
            }
        }
        return score; // positive favors White
    }

    function minimax(game, depth, alpha, beta, maximizing) {
        if (depth === 0 || game.game_over()) {
            if (game.in_checkmate()) {
                // Side to move is checkmated — very bad for that side, scaled by
                // remaining depth so faster mates are preferred/avoided appropriately.
                const mateScore = 100000 + depth;
                return game.turn() === 'w' ? -mateScore : mateScore;
            }
            if (game.in_draw() || game.in_stalemate()) return 0;
            return evaluate(game);
        }
        const moves = game.moves();
        if (maximizing) {
            let best = -Infinity;
            for (const m of moves) {
                game.move(m);
                best = Math.max(best, minimax(game, depth - 1, alpha, beta, false));
                game.undo();
                alpha = Math.max(alpha, best);
                if (beta <= alpha) break;
            }
            return best;
        } else {
            let best = Infinity;
            for (const m of moves) {
                game.move(m);
                best = Math.min(best, minimax(game, depth - 1, alpha, beta, true));
                game.undo();
                beta = Math.min(beta, best);
                if (beta <= alpha) break;
            }
            return best;
        }
    }

    // Returns the AI's chosen move (a chess.js verbose move object) for whichever
    // color is currently to move in `game`. Depth 2 by default for responsiveness;
    // 3 plays noticeably stronger but slower on deep positions.
    function bestMove(game, depth) {
        depth = depth || 2;
        const moves = game.moves({ verbose: true });
        if (!moves.length) return null;
        const maximizing = game.turn() === 'w';
        let bestScore = maximizing ? -Infinity : Infinity;
        let bestMoves = [];
        for (const m of moves) {
            game.move(m);
            const score = minimax(game, depth - 1, -Infinity, Infinity, !maximizing);
            game.undo();
            if (maximizing ? score > bestScore : score < bestScore) {
                bestScore = score;
                bestMoves = [m];
            } else if (score === bestScore) {
                bestMoves.push(m);
            }
        }
        // Pick randomly among equally-good moves so the AI isn't perfectly predictable.
        return bestMoves[Math.floor(Math.random() * bestMoves.length)];
    }

    return { bestMove };
})();
