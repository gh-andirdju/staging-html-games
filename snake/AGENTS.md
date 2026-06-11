# Snake — Agent Guidelines

## Project Structure
`snake/` is a standalone static game package. Runtime logic in `src/game.js`, styles in `src/styles.css`, HTML entry in `index.html`, local server in `server.js`, Playwright tests in `tests/` with config in `playwright.config.js`.

## Build, Test, and Development Commands
- `bun install`: install dependencies.
- `bun run dev`: run local static server on port 5200.
- `bun run dev:pages`: run server with GitHub Pages base path `/html-games/snake/`.
- `bun run test`: run Playwright suite.
- `bun run test:pages`: run tests with Pages-style base path.
- `bun run test:headed`: run tests in headed browser mode.
- `bun run test:ui`: run tests in Playwright UI mode.
- `bun run playwright:install`: install Playwright browser binaries.

## Game Mechanics
Classic snake on a 20x20 grid (20px cells). The snake advances one cell per move tick by prepending a new head and popping the tail; eating food skips the pop so the snake grows. Food spawns on a random free cell. Score increases by `10 x level` per food. Every 5 foods eaten (`FOODS_PER_LEVEL`) the level increases and the move interval drops (`BASE_TICK_INTERVAL` 12 -> `MIN` 4, -2 per level). Game over occurs on wall collision (head outside `[0,20)`) or self-collision. 180-degree reversals are blocked; direction input is buffered into `nextDirection` and applied on the next move tick.

## Test Hook Contract (`window.__snakeTest`)
| Property | Type | Description |
|----------|------|-------------|
| `isReady` | `boolean` | Set to `true` after init |
| `getState()` | `function` | Returns a clone of current state |
| `setState(next)` | `function` | Validates and applies `next` with defaults, re-renders |
| `setAutoStep(bool)` | `function` | Enable/disable the RAF loop |
| `advanceFrames(n)` | `async function` | Step the game tick `n` times |
| `setSeededValue(n)` | `function` | Seed the internal RNG for deterministic food placement |
| `restart()` | `async function` | Restart the game |

State shape returned by `getState()`:
```js
{
  snake: [{ x, y }],       // segments, head first
  direction: { x, y },
  nextDirection: { x, y }, // buffered input
  food: { x, y } | null,
  score: Number,
  highScore: Number,       // persisted to localStorage
  level: Number,
  foodEaten: Number,
  frame: Number,
  tickInterval: Number,    // frames per move
  tickCounter: Number,
  gameOver: Boolean,
  paused: Boolean,         // pause freezes the move tick; toggled by P/Escape or the Pause button
  statusMessage: String,
  statusTone: String,      // 'normal' | 'milestone' | 'warning'
  statusMessageTimer: Number,
}
```

## Controls
Keyboard: arrow keys or WASD to move, `R` to restart, `P` or `Escape` to pause/resume. Pause is ignored while game over; restarting while paused unpauses. Touch: on-screen D-pad and restart button (`data-action` attributes) in the off-canvas control zone, plus Pause/Resume and Restart buttons in the topbar. Direction input (keys and D-pad) is ignored while paused or game over.

## Coding Style
Plain JS, IIFE wrapper, two-space indentation, camelCase. Keep gameplay deterministic and seed randomness via `setSeededValue`. Keep the `window.__snakeTest` contract stable unless updating tests in the same change.
