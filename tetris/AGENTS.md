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

Mobile input has two layers. On the mobile breakpoint (< 1024px) an off-canvas pad deck provides a rotate cluster (`↺`/`↻`) on the left and a diamond move/drop pad on the right — `◀`/`▶` move, `▼` soft drop, and an **explicit `⤓` hard-drop pad** (`data-action="hard-drop"`); there is no longer a soft-drop long-press. On desktop (≥ 1024px) the pad deck is hidden and play is keyboard-driven with an on-screen Controls legend. On top of either, pointer gestures on the `#game` canvas drive faster play: an axis-locked horizontal drag moves one cell per cell-width dragged, a downward drag soft drops, a quick downward flick hard drops, a swipe up holds, a tap rotates clockwise, and a tap after game over restarts. Gesture thresholds are expressed in CSS cell-widths (read from the canvas rect); keep them deterministic so Playwright can drive synthetic `PointerEvent`s.

Visual identity is the "Marathon" hi-fi: a dark **arcade-glass** system on `--bg0`/`--bg1` with translucent white surfaces, a single themeable cyan `--accent` (drives the title chip, Score value, hard-drop pad, level meter, and board glow), and the standard tetromino palette in `COLORS`. Type is self-hosted (no CDN, no system fonts): **Chakra Petch** 400–700 in `src/fonts/chakra-petch-*-latin.woff2`, declared via `@font-face` and preloaded. Blocks render through `paintGem()` — the handoff's beveled cell (rounded `size*0.18`, fill, then four inset highlight/shade bars; ghost = 10%-alpha fill + 1.5px colored border); cells carry a `CELL_GAP` so the board reads as a segmented grid, and the playfield draws faint per-cell wells plus a fading clear flash. Glass icon buttons use inline SVG glyphs (`#mute` swaps wave↔slash via `data-muted`; `#pause` keeps a `.btn-label` so its text still reads Pause/Resume). The left rail's level meter is driven by `updateLevelMeter()` (`--meter-pct`, `lines % 10`). Any canvas/theme change requires regenerating the `toHaveScreenshot` baselines (`bun run test -- -g "layout baseline" --update-snapshots`); `prepareVisualLayout` awaits `document.fonts.ready` so baselines are font-stable.

Layout is a single responsive `.game-shell` grid (top bar / stats strip / `.game-area` / touch deck / hint). `.game-area` flanks the board with two `.rail`s — HOLD + level meter on the left, a NEXT queue (`#next-canvas` plus `.next-mini` `#next-canvas-2..5`, fed by `state.nextQueue`, 3 shown on mobile / 5 on desktop) and the desktop Controls legend on the right. `computeDimensions()` measures the flexible `.game-area` row directly and sizes cells by the tighter of its height and width (minus rails) so the board never overflows; the deck + hint are `display:none` on desktop. The control deck keeps the two-cluster geometry (rotate cluster left, move/drop pad right) the ergonomics tests assert.

An invisible build marker (`window.__tetrisBuild`, `window.__tetrisTest.buildId`, and `<meta name="tetris-build">`) lets a deployed device be checked against the committed source; bump it when shipping a visible change.

## Testing Guidelines
Use deterministic state setup through test hooks (`getState`, `setState`, `advanceFrames`, `setAutoStep`). Cover input behavior (keyboard and touch), line clear flow, level speed progression, scoring, game-over, and restart behavior. Keep tests free of wall-clock race assumptions.

## Commit & Pull Request Guidelines
Use concise imperative commits such as `Improve Tetris clear effect and input precision`. In PR notes, include test commands/results and visual evidence for input feel or animation changes.
