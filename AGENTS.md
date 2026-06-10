# Repository Guidelines

## Project Structure & Module Organization
This repo is a growing static HTML games collection. Each game lives in its own top-level folder (e.g. `brickbreaker/`, `tetris/`, and more to come) with local runtime code in `src/`, page entrypoint in `index.html`, Playwright tests in `tests/`, config in `playwright.config.js`, and a Bun static server in `server.js`. Root `index.html` lists all game links for GitHub Pages and must be updated when a new game folder is added. Keep generated files such as `node_modules/` and `test-results/` out of git.
This collection is served from two repositories — changes are developed in staging and merged into production. Both repos share these guidelines.

| | URL |
|---|---|
| **Production** | [gh-andirdju.github.io/html-games](https://gh-andirdju.github.io/html-games) |
| **Staging** | [gh-andirdju.github.io/staging-html-games](https://gh-andirdju.github.io/staging-html-games) |

Current games:

| Game | Folder |
|------|--------|
| Brick Breaker | `brickbreaker/` |
| Tetris | `tetris/` |
| 2048 | `2048/` |
| Snake | `snake/` |
| Asteroids | `asteroids/` |
| Pinball | `pinball/` |
| Space Invaders | `space-invaders/` |
| Sokoban | `sokoban/` |
| Pong | `pong/` |
| Pac-Man | `pacman/` |
| Minesweeper | `minesweeper/` |

Keep all asset paths and routing compatible with the `/html-games/` base URL, as that is the production base path used by both `bun run dev:pages` and the live site.

## Build, Test, and Development Commands
Run commands from the repo root when serving the whole collection, or from the target game folder when working on a single game.
- `bun run dev`: serve the root landing page and all game directories from one Bun server.
- `bun run dev:pages`: serve the collection using the GitHub Pages base path `/html-games/`.
- `bun run test:all`: run both game Playwright suites from the root.
- `bun install`: install dependencies from `bun.lock`.
- `bun run dev`: serve the game on its configured local port.
- `bun run test`: run headless Chromium Playwright tests.
- `bun run test:headed`: run tests with a visible browser.
- `bun run test:ui`: inspect tests in Playwright UI mode.
- `bun run playwright:install`: install Playwright browsers if missing.

## Coding Style & Naming Conventions
Use plain HTML, CSS, and JavaScript. Match local style: two-space indentation, descriptive camelCase for JS functions and state (`makeBricksForLevel`, `activeEffects`), and kebab-case CSS classes. Keep gameplay logic deterministic; avoid randomness unless it is seeded and exposed to tests. Preserve `window.__brickbreakerTest` hook names unless intentionally updating tests.
Mobile web layouts should be portrait-first, use screen real estate efficiently, and keep controls outside the gameplay area. Touch controls should follow familiar arcade thumb ergonomics, with distinct off-canvas control zones that do not overlap the game board or canvas.

## Testing Guidelines
Tests use `@playwright/test` and target Desktop Chrome. Name specs by observable behavior, for example `laser pickup auto-fires after collection`. Prefer state assertions through test hooks and fixed `advanceFrames()` calls over wall-clock waits. Cover physics, power-ups, level progression, HUD state, and console/page errors for gameplay changes. Run `bun run test` before opening a PR; for risky physics changes, also run `bun run test -- --repeat-each=3`.
For mobile-facing layout or control work, add portrait viewport coverage and verify controls remain outside the gameplay area. When Pages-specific routing or asset paths are touched, also verify the game under the GitHub Pages base path.
Every game's test suite **must** include screenshot-based visual regression tests using `toHaveScreenshot`. At minimum include a desktop layout baseline (`<game>-desktop-layout.png`) and a mobile/portrait layout baseline (`<game>-portrait-layout.png`). Use a `prepareVisualLayout` helper that sets up a deterministic, visually rich board state via the test hook before taking each screenshot. Use `{ animations: 'disabled', fullPage: false, maxDiffPixels: 10 }` options.

## Commit & Pull Request Guidelines
Recent history uses short, direct subjects, with no Conventional Commits pattern. Use imperative commit messages such as `Fix paddle bounce direction` or `Add level HUD`. PRs should include a summary, test commands and results, screenshots or short clips for visual changes, linked issues when applicable, and notes about gameplay or test-hook changes.

## Agent-Specific Notes
Use Bun commands, not npm or Python-based fallback servers. Prefer the root `bun run dev` server when you need the landing page and multiple games available together. If opening the game for review, first ensure a persistent Bun-based dev server is running and verify the URL responds.
Use subagents eagerly and proactively when they can reduce main-thread context load or isolate a small task cleanly.
Use at most one subagent at a time. Only create a new subagent after the previous one has completed, and keep each delegated task narrowly scoped so both the main agent and the subagent use minimal context.
If a local test or dev server port is already in use during verification, identify and kill the process using that port before rerunning the command.
If the user asks to open the local app, start the appropriate Bun-based dev server first, verify the local URL responds, run the relevant Playwright test command for the target app when practical, then open that URL in Google Chrome.
