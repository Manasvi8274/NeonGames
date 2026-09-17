# Neon Arcade — 6 Games

A static, no-build-step web arcade hosted on GitHub Pages: pick a game from the right-side rail and it loads on the left, sidebar and all.

## Games

| Game | Modes | Notes |
|---|---|---|
| 🐍 Snake | Single player | Power-ups, a shield that auto-steers you out of a wall/self hit, local + global high score |
| 🧱 Brick Breaker | Single player | Lives, power-up drops, local + global high score |
| ♟️ Chess | PvP / vs Computer | Rules via `chess.js`; computer uses a small minimax search |
| ⭕ Tic Tac Toe | PvP / vs Computer | Computer plays perfectly (minimax) |
| 🏹 Archery | Single player | Aim, charge power, release; wind + shrinking targets ramp difficulty |
| 🎯 Bottle Shooting | Single player | Timed shooting gallery with a combo multiplier |

## How to use

Clone the repo and open `index.html` (via any local server, e.g. `python -m http.server`) or visit the deployed GitHub Pages link. Click a card on the right to switch games. Each game also works standalone by opening its own folder's `index.html` directly.

## Architecture

Every game is a fully self-contained folder (own `index.html`/`css`/`js`), embedded into the hub shell (`index.html` + `shared/hub.js`/`hub.css`) via an `<iframe>` that swaps `src` when you click a card — this keeps each game's code completely independent (no shared global variables to collide across 6 different games). Common sidebar/button styling for the 4 new games lives in `shared/theme.css`, parameterized by a `--accent` CSS variable per game; Snake and Brick Breaker keep their original, already-tuned stylesheets untouched.

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
    match /leaderboard_{gameId}/{entryId} {
      allow read: if true;
      allow create: if request.resource.data.keys().hasOnly(['name', 'score', 'timestamp'])
                    && request.resource.data.name is string
                    && request.resource.data.name.size() > 0
                    && request.resource.data.name.size() <= 20
                    && request.resource.data.score is number
                    && request.resource.data.score >= 0
                    && request.resource.data.score < 1000000
                    && request.resource.data.timestamp == request.time;
      allow update, delete: if false;
    }
  }
}
```

This allows anyone to read the leaderboard and submit a validated new entry, but never edit or delete existing ones. Note: since there's no server verifying gameplay, a determined visitor could submit a fake score via devtools — an accepted tradeoff for a casual hobby leaderboard, not worth a full backend to prevent.

Until you do this setup, every game works exactly the same, just without the cross-device leaderboard — no errors, it just quietly stays local-only.
