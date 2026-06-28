# Repository Guidelines

## Project Structure & Module Organization
`brickbreaker/` is a standalone static game package. Main runtime logic is in `src/game.js`, styles in `src/styles.css`, and page markup in `index.html`. Local static serving is handled by `server.js`. Playwright tests live in `tests/` with config in `playwright.config.js`.

## Build, Test, and Development Commands
- `bun install`: install dependencies.
- `bun run dev`: run local static server.
- `bun run dev:pages`: run server with GitHub Pages base path.
- `bun run test`: run full Playwright test suite.
- `bun run test:pages`: run tests with Pages-style base path.
- `bun run test:external`: run tests against `PLAYWRIGHT_BASE_URL`.

## Coding Style & Naming Conventions
Use plain JavaScript with two-space indentation and camelCase naming. Keep gameplay deterministic and expose test-visible state through `window.__brickbreakerTest`. Reuse existing power-up and physics patterns instead of introducing parallel abstractions.

Brick destruction goes through the shared `damageBrick(brick)` path (used by both ball and laser hits): a brick has `hp`/`maxHp`, and a hit chips one `hp` (small score + softer blip) until it drops to zero and is destroyed. **Armored (multi-hit) bricks** (`brickHpForLevel`) appear in the upper rows as levels climb (level 1 stays all single-hit, so the early game and the visual baseline are unchanged; power-up bricks are always single-hit). A surviving brick is rendered with a bright inset border plus a damage-darkening wash, and the ball is ejected clear of it so it can't double-hit in one contact. Destroying a brick emits a short burst of decaying **debris particles** (`spawnBrickParticles`/`updateParticles`, seeded for determinism, capped, and skipped under `prefers-reduced-motion`) coloured to match the brick; particles live in `state.particles` and only paint while present, so the static visual baseline is unaffected. Only the destroying hit advances a **combo** counter — consecutive bricks cleared within a single volley (no paddle touch in between). `comboMultiplier(combo)` steps the per-brick score up by 1x every 3 bricks (capped 5x); the combo resets on a paddle bounce, a lost life, or a level start. `combo`, `bestCombo`, and `comboMultiplier` are surfaced via `getState()`, and a live combo (2+) is shown in the status line. An invisible build marker (`window.__brickbreakerBuild`, `window.__brickbreakerTest.buildId`, `<meta name="brickbreaker-build">`) lets a deployed device be checked against committed source; bump it when shipping a visible change.

## Testing Guidelines
Tests use `@playwright/test` (Chromium). Prefer deterministic state mutation + `advanceFrames()` over timing sleeps. Validate controls, collisions, power-ups, level progression, HUD, and error-free console/runtime behavior.

## Commit & Pull Request Guidelines
Use short imperative commit messages like `Fix paddle bounce direction` or `Add mobile touch controls`. Include test command(s) and results in PR notes, plus screenshots/video for UI/gameplay-visible changes.
