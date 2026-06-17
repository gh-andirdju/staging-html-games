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

Visual identity is the "Marathon" hi-fi: a dark **arcade-glass** system on `--bg0`/`--bg1` with translucent white surfaces, a single themeable cyan `--accent` (drives the score, hard-drop pad, level meter, and board glow), and the standard tetromino palette in `COLORS`. Type is self-hosted (no CDN, no system fonts): **Chakra Petch** 400–700 in `src/fonts/chakra-petch-*-latin.woff2`, `@font-face` + preloaded. Blocks render through `paintGem()` — the handoff's beveled cell (rounded `size*0.18`, fill, then four inset highlight/shade bars; ghost = 10%-alpha fill + 1.5px colored border); a `CELL_GAP` + faint per-cell wells give the segmented playfield, plus a fading clear flash. **Motion** (per the handoff's motion pass): a breathing `.board-glow` (`@keyframes board-breathe`), `:active` press on pads/icons, and a `.stat-pop` on Lvl/Lines ticks — all disabled under `prefers-reduced-motion` and frozen by Playwright's `animations:'disabled'`. Glass icon buttons use inline SVG glyphs (`#mute` swaps wave↔slash via `data-muted`; `#pause` keeps a `.btn-label`). The level meter is driven by `updateLevelMeter()` (`--meter-pct` width, `lines % 10`). Any canvas/theme change requires regenerating the `toHaveScreenshot` baselines (`bun run test -- -g "layout baseline" --update-snapshots`); `prepareVisualLayout` awaits `document.fonts.ready`.

Layout is one responsive `.game-shell` grid (top bar / `.game-area` / touch deck / hint). The **top bar** is a 3-column grid: `.brand` (desktop only) · a centered `.hud-score` (`#score` big + a sub-line whose `#level`/`#lines`/`#best` carry the live values) · the `.toolbar` icons. `.game-area` uses `grid-template-areas` to reflow the same nodes (`hold` / `meter` / `next` / `board` / `legend`): on **mobile** a horizontal HOLD · level-bar · NEXT strip sits above a full-width board with corner thumb clusters; on **desktop** they become side rails (HOLD+meter left, NEXT+keyboard legend right) flanking the board, with the touch deck `display:none`. `computeDimensions()` measures the `.board-area` cell directly and sizes cells by the tighter of its height/width. The two-cluster touch geometry (rotate cluster left, move/drop pad right) is what the ergonomics tests assert.

A second mode, **2-player local versus** (`versus.html` + `src/versus.js`, styled by `src/versus.css`), runs two independent `TetrisGame` instances on one keyboard split at the T/Y seam — P1: `A`/`D` move, `S` soft, `W`/`Q` rotate, `E` hold, `LShift` hard drop; P2: arrows, `↑`/`.` rotate, `/` hold, `RShift` hard drop; `Esc` pauses both, `R` restarts, `Space` starts the next round. Clearing ≥2 lines sends garbage (`GARBAGE_OUT` `[0,0,1,2,4]`) to the opponent, cancelled by clearing back; a shared meter shows pending garbage. First to 3 rounds wins (best of 5). It reuses `paintGem()`/tokens and exposes `window.__versusTest` (`getState`, `advanceFrames`, `setAutoStep`, and authoring helpers `setBoard`/`setPending`/`setRounds`/`sendGarbage`/`killPlayer`/`clearActive`) for deterministic tests in `tests/versus.spec.js`.

An invisible build marker (`window.__tetrisBuild`, `window.__tetrisTest.buildId`, and `<meta name="tetris-build">`) lets a deployed device be checked against the committed source; bump it when shipping a visible change.

## Testing Guidelines
Use deterministic state setup through test hooks (`getState`, `setState`, `advanceFrames`, `setAutoStep`). Cover input behavior (keyboard and touch), line clear flow, level speed progression, scoring, game-over, and restart behavior. Keep tests free of wall-clock race assumptions.

## Commit & Pull Request Guidelines
Use concise imperative commits such as `Improve Tetris clear effect and input precision`. In PR notes, include test commands/results and visual evidence for input feel or animation changes.
