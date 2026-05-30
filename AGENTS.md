# Repository Guidelines

## Project Structure & Module Organization
This repo is a static HTML games collection. Each game lives in its own top-level folder (`brickbreaker/`, `tetris/`) with local runtime code in `src/`, page entrypoint in `index.html`, Playwright tests in `tests/`, config in `playwright.config.js`, a Bun static server in `server.js`, and its own `AGENTS.md` with game-specific hooks, ports, and conventions — read that file when working inside a game directory. Root `index.html` lists game links for GitHub Pages; `README.md` only lists entrypoints, so this file is the authoritative guide. Keep generated files such as `node_modules/` and `test-results/` out of git.
The repository is deployed on GitHub Pages at `https://gh-andirdju.github.io/html-games`, so paths and hosted behavior must remain compatible with that base URL.

Both `server.js` files (root and per-game) share the same conventions: 308 permanent redirects normalize directory paths to a trailing slash, any path segment beginning with `.` is blocked (so `.git`, `.cache`, and even `.nojekyll` cannot be served by the dev server — `.nojekyll` is a GitHub Pages marker, not a runtime asset), and the `BASE_PATH` env var rewrites the URL prefix for GitHub Pages parity (`/html-games/`).

## Build, Test, and Development Commands
Run commands from the repo root when serving the whole collection, or from the target game folder when working on a single game. Each game owns its own `bun.lock`, so `bun install` is per-game (there is no root install).

### Root (whole collection)
- `bun run dev`: serve the root landing page and all game directories from one Bun server.
- `bun run dev:pages`: serve the collection using the GitHub Pages base path `/html-games/`.
- `bun run test:all`: run both game Playwright suites from the root.

### Per-game (`cd brickbreaker/` or `cd tetris/`)
- `bun install`: install that game's dependencies from its local `bun.lock`.
- `bun run dev`: serve the game on its configured local port.
- `bun run test`: run headless Chromium Playwright tests.
- `bun run test:headed`: run tests with a visible browser.
- `bun run test:ui`: inspect tests in Playwright UI mode.
- `bun run playwright:install`: install Playwright browsers if missing.

## Coding Style & Naming Conventions
Use plain HTML, CSS, and JavaScript. Match local style: two-space indentation, descriptive camelCase for JS functions and state (`makeBricksForLevel`, `activeEffects`), and kebab-case CSS classes. Keep gameplay logic deterministic; avoid randomness unless it is seeded and exposed to tests. Preserve each game's `window.__<game>Test` hook (`window.__brickbreakerTest`, `window.__tetrisTest`) unless intentionally updating tests.
Mobile web layouts should be portrait-first, use screen real estate efficiently, and keep controls outside the gameplay area. Touch controls should follow familiar arcade thumb ergonomics, with distinct off-canvas control zones that do not overlap the game board or canvas.

## Testing Guidelines
Tests use `@playwright/test` and target Desktop Chrome. Name specs by observable behavior, for example `laser pickup auto-fires after collection`. Prefer state assertions through test hooks and fixed `advanceFrames()` calls over wall-clock waits. Cover physics, power-ups, level progression, HUD state, and console/page errors for gameplay changes. Run `bun run test` before opening a PR; for risky physics changes, also run `bun run test -- --repeat-each=3`.
For mobile-facing layout or control work, add portrait viewport coverage and verify controls remain outside the gameplay area. When Pages-specific routing or asset paths are touched, also verify the game under the GitHub Pages base path.

## Commit & Pull Request Guidelines
Recent history uses short, direct subjects, with no Conventional Commits pattern. Use imperative commit messages such as `Fix paddle bounce direction` or `Add level HUD`. PRs should include a summary, test commands and results, screenshots or short clips for visual changes, linked issues when applicable, and notes about gameplay or test-hook changes.

## Agent-Specific Notes
Use Bun commands, not npm or Python-based fallback servers. Prefer the root `bun run dev` server when you need the landing page and multiple games available together. If opening the game for review, first ensure a persistent Bun-based dev server is running and verify the URL responds.
Use subagents eagerly and proactively when they can reduce main-thread context load or isolate a small task cleanly.
Use at most one subagent at a time. Only create a new subagent after the previous one has completed, and keep each delegated task narrowly scoped so both the main agent and the subagent use minimal context.
If a local test or dev server port is already in use during verification, identify and kill the process using that port before rerunning the command.
If the user asks to open the local app, start the appropriate Bun-based dev server first, verify the local URL responds, run the relevant Playwright test command for the target app when practical, then open that URL in Google Chrome.
