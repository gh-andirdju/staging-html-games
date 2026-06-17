# Repository Guidelines

## Project Structure & Module Organization
`tetris/` is a standalone static game package. Core logic and rendering live in `src/game.js`, styles in `src/styles.css`, and entry HTML in `index.html`. Local serving is handled by `server.js`. Playwright tests are in `tests/` with configuration in `playwright.config.js`.

## Build, Test, and Development Commands
- `bun install`: install dependencies.
- `bun run dev`: run local static server.
- `bun run test`: run Playwright suite.
- `bun run test:headed`: run tests in headed mode.
- `bun run test:ui`: run tests in Playwright UI mode.
- `bun run playwright:install`: install Playwright browser binaries.

## Coding Style & Naming Conventions
Use plain JavaScript, two-space indentation, and descriptive camelCase names. Keep frame-step logic deterministic so tests can drive behavior through `advanceFrames()`. Preserve the `window.__tetrisTest` contract unless tests are updated in the same change.

Sound effects are short WebAudio blips (rotate, lock, hard drop, hold, line-clear arpeggio scaled by line count, combo blip that climbs with the chain length, level up, game over, new record) created lazily after the first user gesture and fully disabled under `navigator.webdriver`. The mute state persists as `tetris-muted`; `getState()` returns `muted` and the hook exposes `setMuted(bool)`.

Scoring tracks a `combo` counter (consecutive line-clearing drops; `-1` when idle, `0` on the first clear of a chain) and a `b2bActive` flag (the last clear was a Tetris). A combo adds `50 × combo × level`, and a back-to-back Tetris adds half the base Tetris score again. Both are surfaced via `getState()`.

Mobile input has two layers. The off-canvas button deck (D-pad + rotate cluster) stays the discoverable, accessible default and must remain outside the gameplay area. On top of it, pointer gestures on the `#game` canvas drive faster play: an axis-locked horizontal drag moves one cell per cell-width dragged, a downward drag soft drops, a quick downward flick hard drops, a swipe up holds, a tap rotates clockwise, and a tap after game over restarts. Gesture thresholds are expressed in CSS cell-widths (read from the canvas rect) so they scale with board size; keep them deterministic so Playwright can drive synthetic `PointerEvent`s.

## Testing Guidelines
Use deterministic state setup through test hooks (`getState`, `setState`, `advanceFrames`, `setAutoStep`). Cover input behavior (keyboard and touch), line clear flow, level speed progression, scoring, game-over, and restart behavior. Keep tests free of wall-clock race assumptions.

## Commit & Pull Request Guidelines
Use concise imperative commits such as `Improve Tetris clear effect and input precision`. In PR notes, include test commands/results and visual evidence for input feel or animation changes.
