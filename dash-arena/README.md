# Dash Arena

A fast isometric3D arena shooter. Survive the rush, destroy cover and explosive
barrels, then defeat the Warden before the90second round ends. The boss arrives
after60seconds. Three enemy types and three unlimited-ammunition weapons make
movement and weapon choice matter.

## Play

- WASD: screen-relative movement
- Hold arrow keys: aim and fire; combine two arrows for diagonal shots
- Space: invulnerable dash, with a short recharge
- 1 / 2 / 3: blaster / shotgun / explosive launcher
- Enter: start or play again; P / Escape: pause; R: restart; M: sound; H: help
- Touch: movement pad, held auto-aim FIRE and DASH below the arena

Desktop play uses only the keyboard. Press Enter to start. Leaving the tab or window pauses a live
round and releases held inputs. Personal best and mute preferences stay local.

## Build and run

Install Bun and Rust1.99.1 with the wasm32-unknown-unknown target.
From this folder:

```sh
bun install
bun run test:rust
bun run build:wasm
bun run dev
PLAYWRIGHT_CHANNEL=chrome bun run test
bun run test:pages
```

From the collection root, use `bun run dev:pages` and open
`/html-games/dash-arena/`. The same files work at the staging GitHubPages path
`/staging-html-games/dash-arena/`. All runtime asset URLs carry the HTML build ID;
module imports sit inside a visible loading error/retry boundary.

## Engine

The dependency-free Rust crate in wasm/ owns seeded fixed60fps gameplay,
spatial-grid/swept collision detection, enemyAI, particle simulation, camera,
projection, procedural3D geometry, and lighting. Its tracked Wasm module
requires no host imports. The thin JavaScript binding uploads one packed mesh
and issues one WebGL2 triangle draw per frame; JavaScript supplies DOM, input,
audio and storage. No simulation or drawing fallback exists in JavaScript.

`ENGINE-API.md` documents the Rust and browser test interfaces. Deterministic
`window.__dashArenaTest` hooks support seeded inputs, fixed frame stepping,
rich visual setup and stress scenes. GPU rendering requires WebGL2.

The Pages workflow runs Rust tests and builds the module before uploading the
static site. No server-side application or external assets are required.
