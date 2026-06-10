# UX & Usability Improvement Plan — All Games

Scope: user-experience and usability improvements for sighted, able-bodied players
(keyboard, mouse, and touch) across all 11 games: `2048`, `asteroids`,
`brickbreaker`, `minesweeper`, `pacman`, `pinball`, `pong`, `snake`, `sokoban`,
`space-invaders`, `tetris`. Based on a full survey of each game's controls, HUD,
mobile layout, feedback, and test coverage (June 2026).

## Current-state summary

Strengths: every game has off-canvas touch controls, aria-labelled buttons,
an aria-live status region, Playwright suites with visual-regression baselines,
and a consistent `window.__<game>Test` hook contract. Tetris is the polish
benchmark (dynamic sizing, DAS/ARR input, 5 viewport baselines). 2048 is the
onboarding benchmark (first-visit tutorial with `localStorage` flag).

Gaps (cross-cutting):

| Gap | Affected games |
|---|---|
| No pause anywhere | all 11 |
| No `R`/keyboard restart | 2048, Brick Breaker, Minesweeper, Pac-Man, Pong |
| No high-score persistence | all except Snake, 2048 |
| Fixed-width canvas overflows narrow phones | Asteroids (800px), Pac-Man (800px), Pong (800px), Space Invaders (600px), Pinball (700px tall) |
| No control instructions / help | all except 2048 |
| No audio or feedback sounds (and no mute toggle) | all 11 |
| Arrow keys not `preventDefault`'d (page scrolls) | Space Invaders (arrows; Space is handled) |
| Root `tests/index.spec.js` expects 7 games; repo has 11 | landing page |
| `CLAUDE.md` games table lists only 3 of 11 games | docs |

## Guiding principles

1. **Consistency across the collection** — same keys do the same things in every
   game; a player who learns one game has learned the conventions for all.
2. **Match each game's existing style** — plain JS IIFEs, 2-space indent,
   camelCase, deterministic logic, test hooks preserved.
3. **Every behavior change ships with tests** — extend each game's spec and
   refresh visual baselines only where layout intentionally changes.
4. **Small, reviewable PRs** — one theme per PR, applied across games, rather
   than one giant PR.

## Phase 0 — Hygiene quick wins (no gameplay changes)

- **P0.1** Fix root `tests/index.spec.js` to assert all 11 game links (it
  currently expects 7 and will fail).
- **P0.2** Update the `CLAUDE.md` games table to list all 11 games.
- **P0.3** Space Invaders: `preventDefault()` on ArrowLeft/ArrowRight so the
  page never scrolls during play; audit the other games for the same on every
  bound key (Space, arrows, WASD where the page can scroll).

## Phase 1 — Input & flow consistency (highest player impact)

- **P1.1 Universal pause.** Add `P` (and `Escape`) to toggle pause in every
  real-time game, plus a small Pause button in the topbar for touch users.
  Paused state: freeze the loop, dim the canvas with a "Paused — press P"
  overlay, set the status region. Turn-based games (2048, Minesweeper, Sokoban)
  don't need a pause loop but should still ignore input while any overlay is up.
  Implementation: a `paused` flag checked in each game's frame step; expose it
  through the test hook (`getState().paused`).
- **P1.2 Universal restart key.** Add `R` to restart in the 5 games that only
  have a button (2048, Brick Breaker, Minesweeper, Pac-Man, Pong). Keep the
  buttons. On games with destructible progress (2048 mid-game, Sokoban mid-level),
  require `R` on the game-over/won screen only, or add a brief "press R again to
  confirm" guard, so a stray keypress can't wipe a good run.
- **P1.3 Standard game-over flow.** Every game's game-over state should show:
  final score (where applicable), best score, and "Press R or tap Restart".
  Today some games only flip the status text.

## Phase 2 — Persistence & HUD

- **P2.1 High scores everywhere.** Persist best score to `localStorage` in all
  score-based games using the established key pattern (`<game>-high-score`):
  Asteroids, Brick Breaker, Pinball, Space Invaders, Tetris, Pac-Man. Pong
  (first-to-7 vs AI), Sokoban (puzzle), and Minesweeper get **best time / fewest
  moves** instead: Minesweeper best time per difficulty, Sokoban best
  moves/pushes per level.
- **P2.2 Show "Best" in each HUD** next to Score, matching Snake/2048's layout.
- **P2.3 New-record feedback.** Reuse the existing status `data-tone` pattern
  (milestone tone) to celebrate a new best on game over.

## Phase 3 — Mobile fit & touch ergonomics

- **P3.1 Canvas scale-to-fit.** The fixed-size canvases (Asteroids 800×600,
  Pac-Man 800×520, Pong 800×520, Space Invaders 600×480, Pinball 400×700) must
  never overflow the viewport. Lowest-risk fix: keep internal resolution fixed
  and scale visually with CSS (`max-width: 100%; height: auto;` preserving
  aspect ratio), remapping pointer coordinates where games read canvas-relative
  positions. Tetris-style dynamic resolution is the gold standard but is only
  worth it if CSS scaling produces blurry/cramped results — decide per game.
- **P3.2 Pinball vertical fit.** 400×700 + 3 buttons must fit a 667pt phone in
  portrait without scrolling; scale the canvas down and keep flipper buttons in
  thumb zones (bottom corners, Launch center).
- **P3.3 Tap-target audit.** Ensure every touch control is ≥ 44×44 px
  (current d-pads are 40–50px; bring the small ones up).
- **P3.4 Portrait visual baselines.** Add/refresh `<game>-portrait-layout.png`
  baselines for every game changed in this phase, per repo testing guidelines.

## Phase 4 — Onboarding & discoverability

- **P4.1 Per-game controls hint.** Add a compact, dismissible "How to play"
  line or panel to each game (keyboard legend on desktop, touch legend on
  mobile), shown on first visit using 2048's `localStorage` "seen" pattern
  (`<game>-help-seen`), with a small `?` button in the topbar to reopen it.
  Keep it one screen, no multi-step modal except where rules need it.
- **P4.2 Landing page upgrade.** Root `index.html`: add a one-line description
  and control summary per game (e.g. "Arrows to move · R restarts"); keep the
  current dark arcade styling and the `/html-games/` base-path-safe relative
  links. Optional later: tiny inline SVG icons per game (no screenshots, keeps
  the repo asset-free).

## Phase 5 — Feedback & juice (lower priority, gated)

- **P5.1 Sound effects + mute.** Small WebAudio-generated blips (no audio
  assets): paddle/wall hits, line clear, merge, eat, fire, game over. One shared
  pattern per game (each game keeps its own copy per current no-shared-code
  convention), a mute toggle button in each topbar, muted-state persisted as
  `<game>-muted`, **default muted-off but never autoplay before first user
  gesture** (browser policy). Tests must keep passing headless — guard all audio
  behind a capability check and expose a no-op in test mode.
- **P5.2 Visual juice.** Score "pop" on change, screen shake on big events
  (Brick Breaker multi-hit, Asteroids ship death), consistent with 2048's CSS
  keyframe approach where DOM-based and canvas effects where canvas-based. All
  effects must be deterministic/frame-driven so `advanceFrames()` tests stay
  stable, and respect `prefers-reduced-motion`.

## Per-game extras (beyond the cross-cutting work)

| Game | Specific improvements |
|---|---|
| Pong | Difficulty selector (AI speed presets, like Minesweeper's Easy/Normal/Hard buttons); serve countdown so points don't start abruptly |
| Brick Breaker | Power-up legend visible in HUD (letters E/S/L/D/P are cryptic); keyboard paddle speed tuning |
| Minesweeper | Long-press to flag on touch (keep mode toggle as fallback); win time prominently on game-over |
| Pac-Man | Brief "Ready!" delay before ghosts move at level start/respawn (currently autostarts instantly) |
| Asteroids | Brief spawn-safe indicator is present (invincibility flash) — add wave banner ("Wave 3") between waves |
| Sokoban | Level picker for completed levels (progress in `localStorage`); "moves/pushes best" per level (P2.1) |
| Tetris | Already the benchmark — gets pause (P1.1) and high score (P2.1) only |
| Snake | Optional swipe input on the canvas-adjacent area (2048-style), keeping the d-pad |
| Space Invaders | Wave-start banner; lives shown as ship icons instead of a number |
| Pinball | Nudge control (with tilt penalty) is a classic, optional |
| 2048 | Undo (single step), matching Sokoban's pattern — popular QoL feature |

## Sequencing & PR breakdown

| PR | Contents | Risk |
|---|---|---|
| 1 | Phase 0 (root test fix, CLAUDE.md table, key-scroll audit) | none |
| 2 | P1.2 restart keys + P1.3 game-over flow, with tests | low |
| 3 | P1.1 pause across real-time games, with tests | low-medium |
| 4 | Phase 2 high scores/HUD, with tests | low |
| 5 | Phase 3 mobile fit, one PR per game if pointer remapping is involved (Brick Breaker-style drag games are the risky ones) | medium |
| 6 | Phase 4 onboarding + landing page, new visual baselines | low |
| 7+ | Phase 5 audio/juice, per game | medium (test stability) |

Each PR: run the affected game suites (`bun run test` per game), the root suite,
and `--repeat-each=3` for anything touching physics or frame timing. Refresh
visual baselines only for intentional layout changes and call them out in the
PR description.
