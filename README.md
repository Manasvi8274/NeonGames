# Neon Arcade — 7 Games

A static, no-build-step web arcade hosted on GitHub Pages: pick a game from the right-side rail and it loads on the left, sidebar and all.

## Games

| Game | Modes | Notes |
|---|---|---|
| 🐍 Snake | Single player | Power-ups, a shield that auto-steers you out of a wall/self hit, local + global high score |
| 🧱 Brick Breaker | Single player | Lives, power-up drops, local + global high score |
| ♟️ Chess | PvP / vs Computer | Rules via `chess.js`; computer uses a small minimax search |
| ⭕ Tic Tac Toe | PvP / vs Computer | Computer plays perfectly (minimax) |
| 🏹 Archery | Single player | Aim, charge power, release; wind + shrinking targets ramp difficulty |
| 🎯 Bottle Shooting | Single player | An auto-sweeping reticle — fire on the beat to smash bottles for a combo multiplier |
| 🧱 Tetris | Single player | 7-bag randomizer, hold, ghost piece, wall kicks, level-scaling gravity |

## How to use

Clone the repo and open `index.html` (via any local server, e.g. `python -m http.server`) or visit the deployed GitHub Pages link. Click a card on the right to switch games. Each game also works standalone by opening its own folder's `index.html` directly.

## Architecture

Every game is a fully self-contained folder (own `index.html`/`css`/`js`), embedded into the hub shell (`index.html` + `shared/hub.js`/`hub.css`) via an `<iframe>` that swaps `src` when you click a card — this keeps each game's code completely independent (no shared global variables to collide across 7 different games). Common sidebar/button styling lives in `shared/theme.css`, parameterized by a `--accent` CSS variable per game; Snake and Brick Breaker keep their original, already-tuned stylesheets. `shared/sfx.js` is a small synthesized sound-effect engine (no audio files to fetch) and `shared/chrome.js`/`chrome.css` provide the shared loading screen, start screen, and game-over/congratulations card used by every game.

## Cross-device leaderboards (optional setup)

High scores work locally out of the box (each browser remembers its own via `localStorage`). To also get a **live, shared leaderboard** across every device — the moment anyone gets a new #1, they're asked for a name and everyone else sees it — you need a free Firebase project:

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and create a project (no credit card needed).
2. In the project, click **Build → Firestore Database → Create database** (start in production mode).
3. In **Project settings → General**, scroll to "Your apps", click the web icon (`</>`) to register a web app, and copy the `firebaseConfig` object it gives you.
4. Paste those values into `shared/firebase-config.js` in this repo.
5. In Firestore, go to the **Rules** tab and paste in:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Firestore rules can't mix a literal prefix with a wildcard inside one
    // path segment (e.g. `leaderboard_{gameId}` is invalid) — match every
    // top-level collection instead, and restrict to the leaderboard_* ones
    // with a regex check inside the rule body. Each game's leaderboard is
    // capped at exactly 5 documents, at fixed IDs "1".."5" (the doc ID is
    // the rank) — the client overwrites all 5 slots in one batch whenever a
    // new score qualifies, which is what evicts the old #5. That means a
    // qualifying submission is always create-or-update depending on whether
    // that rank slot already exists, so both must be allowed (never delete).
    match /{collection}/{entryId} {
      allow read: if collection.matches('^leaderboard_.*');
      allow create, update: if collection.matches('^leaderboard_.*')
                    && entryId.matches('^[1-5]$')
                    && request.resource.data.keys().hasOnly(['game', 'rank', 'name', 'score', 'timestamp'])
                    && request.resource.data.game is string
                    && request.resource.data.rank is number
                    && request.resource.data.rank >= 1
                    && request.resource.data.rank <= 5
                    && request.resource.data.name is string
                    && request.resource.data.name.size() > 0
                    && request.resource.data.name.size() <= 20
                    && request.resource.data.score is number
                    && request.resource.data.score >= 0
                    && request.resource.data.score < 1000000
                    && request.resource.data.timestamp == request.time;
      allow delete: if false;
    }
  }
}
```

This allows anyone to read the leaderboard and overwrite one of the 5 ranked slots with a validated entry, but never delete anything or write outside that shape. Note: since there's no server verifying gameplay, a determined visitor could submit a fake score via devtools — an accepted tradeoff for a casual hobby leaderboard, not worth a full backend to prevent.

Until you do this setup, every game works exactly the same, just without the cross-device leaderboard — no errors, it just quietly stays local-only.
