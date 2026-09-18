# 🕹️ Neon Arcade

**Seven classic games. Zero installs. One neon-lit hub.**

A static, no-build-step web arcade hosted on GitHub Pages — pick a game from the side rail, it loads instantly, and your high score follows you across every device. No downloads, no sign-ups, no loading spinners longer than a heartbeat. Just click and play.

### 🎮 [**Play Neon Arcade now →**](https://manasvi8274.github.io/Twin_games-snake-brick-breaker/)

---

## The Games

| | Game | What it is | Modes |
|---|---|---|---|
| 🐍 | **Snake** | The arcade classic, souped up — chase power-ups and outgrow your own tail, with a shield that saves you from a careless wall or self hit. *How long can you get before you corner yourself?* | Single player |
| 🧱 | **Brick Breaker** | Paddle, ball, and a wall that won't stay standing. Chain combos, catch falling power-ups, and clear every last brick before you run out of lives. *One more life. One more wall.* | Single player |
| ♟️ | **Chess** | The real game, no shortcuts — full rules engine, check and checkmate detection, and a computer opponent with an actual search behind its moves. *Think you can outplay the machine?* | PvP / vs Computer |
| ⭕ | **Tic Tac Toe** | Looks simple, plays ruthless — the CPU plays a perfect game, so your only shot at a win is a draw... or a human opponent who blinks first. *Bet you can't beat perfect.* | PvP / vs Computer |
| 🏹 | **Archery** | Aim, charge your shot, and let it fly. Wind picks up and targets shrink the deeper you go. *Steady hands only.* | Single player |
| 🎯 | **Bottle Shooting** | A reticle sweeps the range on its own — fire on the beat to smash bottles and stack your combo multiplier. *Timing is everything.* | Single player |
| 🧩 | **Tetris** | The one that needs no introduction — 7-bag piece randomizer, hold, ghost piece, wall kicks, and gravity that only gets meaner. *Just one more line, right?* | Single player |

Every high score — local **and** global — is saved automatically, so you're always chasing a real number, not just your own.

## How to Play

Just visit the [live site](https://manasvi8274.github.io/Twin_games-snake-brick-breaker/) and click a card on the right to switch games — no setup required.

To run it locally instead: clone the repo and open `index.html` via any local server (e.g. `python -m http.server`). Each game also works completely standalone by opening its own folder's `index.html` directly.

## Architecture

Every game is a fully self-contained folder (own `index.html`/`css`/`js`), embedded into the hub shell (`index.html` + `shared/hub.js`/`hub.css`) via an `<iframe>` that swaps `src` when you click a card — this keeps each game's code completely independent (no shared global variables to collide across 7 different games). Common sidebar/button styling lives in `shared/theme.css`, parameterized by a `--accent` CSS variable per game; Snake and Brick Breaker keep their original, already-tuned stylesheets. `shared/sfx.js` is a small synthesized sound-effect engine (no audio files to fetch) and `shared/chrome.js`/`chrome.css` provide the shared loading screen, start screen, and game-over/congratulations card used by every game.

High scores are saved locally per browser, and also synced to a shared leaderboard so top scores carry across devices — the moment you land a new top-5 score, you're asked for a name and everyone else sees it too.
