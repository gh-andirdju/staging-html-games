# Minesweeper — Agent Guidelines

## Project Structure
`minesweeper/` is a standalone static game package. Runtime logic in `src/game.js`, styles in `src/styles.css`, HTML entry in `index.html`, local server in `server.js`, Playwright tests in `tests/` with config in `playwright.config.js`.

## Build, Test, and Development Commands
- `bun install`: install dependencies.
- `bun run dev`: run local static server on port 5210.
- `bun run dev:pages`: run server with GitHub Pages base path `/html-games/minesweeper/`.
- `bun run test`: run Playwright suite.
- `bun run test:pages`: run tests with Pages-style base path.
- `bun run test:headed`: run tests in headed browser mode.
- `bun run test:ui`: run tests in Playwright UI mode.
- `bun run playwright:install`: install Playwright browser binaries.

## Game Mechanics
Classic Minesweeper on a configurable grid. Difficulty presets: Easy (9×9, 10 mines), Normal (12×12, 25 mines), Hard (16×16, 51 mines). Mines are placed after the first click, guaranteeing the clicked cell and its 3×3 neighborhood are always safe. Revealing a cell with 0 adjacent mines flood-fills (BFS) all connected blank cells. Chord-clicking a revealed number cell reveals all unflagged neighbors when the adjacent flag count matches the cell's number. Placing a flag on a wrong cell shows an X on game over; correctly-flagged mines show a green flag. All mines are auto-flagged on win.

## State Shape
```js
{
  board: [[{ mine, revealed, flagged, adjacent }]],  // rows×cols
  rows: number,
  cols: number,
  mines: number,
  revealed: number,    // non-mine revealed count
  flagged: number,
  gameOver: boolean,
  won: boolean,
  started: boolean,    // false until first reveal click
  difficulty: 'easy' | 'normal' | 'hard',
  touchMode: 'reveal' | 'flag',
  frame: number,
  timeElapsed: number, // integer seconds
  tickCounter: number, // counts toward next second (resets at 60)
  statusMessage: string,
  statusTone: 'normal' | 'milestone' | 'warning',
  statusMessageTimer: number,
}
```

## Test Hook Contract (`window.__minesweeperTest`)
| Property | Type | Description |
|----------|------|-------------|
| `isReady` | `boolean` | `true` after init |
| `getState()` | `function` | Returns `structuredClone` of current state |
| `setState(next)` | `function` | Applies partial state with defaults, resizes canvas, re-renders |
| `setAutoStep(bool)` | `function` | Enable/disable the RAF loop |
| `advanceFrames(n)` | `async function` | Step the game `n` frames (drives timer) |
| `restart()` | `async function` | Restart with current difficulty |
| `revealCell(row, col)` | `function` | Reveal a cell; chord if already revealed |
| `flagCell(row, col)` | `function` | Toggle flag on a cell |
| `setBoard(config)` | `function` | Replace board with 2D array of `{mine, revealed, flagged}`, recalculates adjacent counts, sets `started=true` |

## Controls
Desktop: left-click reveals (or chords if cell is revealed), right-click toggles flag. Mobile: "Reveal" / "Flag" mode buttons in the touch-controls zone set `state.touchMode`; canvas tap uses the active mode. Difficulty buttons (Easy/Normal/Hard) in the playfield restart with the selected preset.

## Coding Style
Plain JS, IIFE wrapper, two-space indentation, camelCase. `NEIGHBORS` constant for the 8-directional offsets. Keep `window.__minesweeperTest` hook contract stable unless updating tests in the same change.
