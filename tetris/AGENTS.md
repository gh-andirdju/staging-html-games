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

Visual identity is restrained: a cool-graphite instrument with one signal-red accent (`--accent`) and cyan (`--accent-2`) reserved for live data (the score). The single signature is the recessed, softly-lit board "screen" where the enamel-bright tetromino gems are the hero; chrome stays quiet (matte panels, hairline borders, a thin red marquee rule). Type is self-hosted (no CDN, no system fonts) — Anton (condensed poster display: title, HUD numbers, buttons) and Space Mono (mono labels/ticker/body) live in `src/fonts/*.woff2`, declared via `@font-face` and preloaded in `index.html`. Blocks render through `paintGem()` (a shared glossy/beveled painter used on the board and in previews); the board draws a gradient + grid background and a fading white flash over clearing rows. Any change to canvas rendering or theme requires regenerating the `toHaveScreenshot` baselines (`bun run test -- -g "layout baseline" --update-snapshots`); `prepareVisualLayout` awaits `document.fonts.ready` so baselines are font-stable.

Layout is an arcade-cabinet: a `.cabinet` frame wraps the `.game-shell` grid (marquee / play area / control deck). The play area flanks the board with two fixed-width `.rail`s — HOLD + scoreboard on the left, a 3-deep NEXT queue (`#next-canvas` plus `.next-mini` `#next-canvas-2/3`, fed by `state.nextQueue`) and the status ticker on the right. `computeDimensions()` sizes cells by the tighter of available height *and* width (measured from the shell rect minus the rails) so the board never overflows; `.game-shell` pins `grid-template-columns: minmax(0, 1fr)` so rows can't expand to content width. The control deck keeps the two-cluster geometry (rotate cluster left, D-pad right) the ergonomics tests assert.

An invisible build marker (`window.__tetrisBuild`, `window.__tetrisTest.buildId`, and `<meta name="tetris-build">`) lets a deployed device be checked against the committed source; bump it when shipping a visible change.

## Testing Guidelines
Use deterministic state setup through test hooks (`getState`, `setState`, `advanceFrames`, `setAutoStep`). Cover input behavior (keyboard and touch), line clear flow, level speed progression, scoring, game-over, and restart behavior. Keep tests free of wall-clock race assumptions.

## Commit & Pull Request Guidelines
Use concise imperative commits such as `Improve Tetris clear effect and input precision`. In PR notes, include test commands/results and visual evidence for input feel or animation changes.
