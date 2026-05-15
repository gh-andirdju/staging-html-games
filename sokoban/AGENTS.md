# Sokoban — Agent Guidelines

## Project Structure
`sokoban/` is a standalone static game package. Runtime logic in `src/game.js`, styles in `src/styles.css`, HTML entry in `index.html`, local server in `server.js`, Playwright tests in `tests/`.

## Build, Test, and Development Commands
- `bun install`: install dependencies.
- `bun run dev`: run local static server on port 5200.
- `bun run dev:pages`: run server with GitHub Pages base path `/html-games/sokoban/`.
- `bun run test`: run Playwright suite (generates screenshot baselines on first run).
- `bun run test:headed`: run tests in headed browser mode.
- `bun run playwright:install`: install Playwright browser binaries.

## Game Mechanics
Sokoban puzzle game: push boxes onto target squares. Player can push one box at a time but cannot pull. Move counter tracks every step; push counter tracks only box-push moves. Undo (Z key or Undo button) restores the previous move. Level advances automatically 90 frames after win.

## Cell Encoding
| Char | Meaning |
|------|---------|
| `#`  | Wall |
| ` `  | Floor |
| `.`  | Target |
| `@`  | Player start (floor in board) |
| `$`  | Box start (floor in board) |
| `*`  | Box on target (target in board) |
| `+`  | Player on target (target in board) |

## Test Hook Contract (`window.__sokobanTest`)
| Property | Type | Description |
|----------|------|-------------|
| `isReady` | `boolean` | Set to `true` after init |
| `getState()` | `function` | Returns `structuredClone` of current state |
| `setState(next)` | `function` | Merges `next` into state, calls render |
| `setAutoStep(bool)` | `function` | Enable/disable RAF loop |
| `advanceFrames(n)` | `async function` | Step game tick `n` times |
| `restart()` | `async function` | Reload current level |

State shape returned by `getState()`:
```js
{
  level: Number,        // 0-indexed
  board: String[][],    // 2D array of '#' | ' ' | '.'
  playerPos: { row, col },
  boxes: [{ row, col }],
  targets: [{ row, col }],
  moves: Number,
  pushes: Number,
  status: 'playing' | 'won',
  history: Array,
}
```

## Coding Style
Plain JS, IIFE wrapper, two-space indentation, camelCase. Keep `window.__sokobanTest` contract stable unless updating tests in the same change.
