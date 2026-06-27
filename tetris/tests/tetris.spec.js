import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('tetris-help-seen', '1'); } catch {} });
  const runtimeErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });
  page.on('pageerror', (error) => {
    runtimeErrors.push(error.message);
  });
  page.__runtimeErrors = runtimeErrors;
});

test.afterEach(async ({ page }) => {
  expect(page.__runtimeErrors).toEqual([]);
});

async function openGame(page, { keepNaturalSize = false } = {}) {
  await page.goto('./');
  await page.reload();
  await page.waitForFunction(() => {
    const api = window.__tetrisTest;
    return (
      api &&
      api.isReady === true &&
      (typeof api.getState === 'function' || typeof api.readState === 'function') &&
      typeof api.setState === 'function' &&
      typeof api.advanceFrames === 'function' &&
      typeof api.restart === 'function' &&
      typeof api.setAutoStep === 'function' &&
      typeof api.getControlsState === 'function' &&
      typeof api.setHandedness === 'function' &&
      typeof api.getBoardSize === 'function' &&
      typeof api.setBoardSize === 'function'
    );
  });
  await page.evaluate(() => window.__tetrisTest.setAutoStep(false));
  if (!keepNaturalSize) {
    // Lock to standard 10×20 so gameplay tests use predictable hardcoded dimensions.
    await page.evaluate(() => window.__tetrisTest.setBoardSize(10, 20));
    await page.evaluate(() => window.__tetrisTest.restart());
  }
  await expect(page.locator('canvas#game')).toBeVisible();
}

async function getState(page) {
  return page.evaluate(() => {
    const api = window.__tetrisTest;
    const reader = api.getState ?? api.readState;
    return reader.call(api);
  });
}

async function setState(page, nextState) {
  await page.evaluate((payload) => {
    window.__tetrisTest.setState(payload);
  }, nextState);
}

async function advanceFrames(page, frames = 1) {
  await page.evaluate(async (value) => {
    await window.__tetrisTest.advanceFrames(value);
  }, frames);
}

async function getControlsState(page) {
  return page.evaluate(() => window.__tetrisTest.getControlsState());
}

async function getPortraitLayout(page) {
  return page.evaluate(() => {
    const readBox = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        right: box.right,
        bottom: box.bottom
      };
    };

    return {
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      scrollHeight: document.scrollingElement.scrollHeight,
      board: readBox('#game'),
      gameArea: readBox('.game-area'),
      // The on-screen pad deck is removed on mobile (full-screen, gesture-only).
      controlDeck: readBox('.control-deck'),
      hint: readBox('.hint')
    };
  });
}

function expectVisibleInViewport(box, viewport) {
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.bottom).toBeLessThanOrEqual(viewport.height + 1);
}

function expectPortraitErgonomics(layout) {
  const { viewport, scrollHeight, board, gameArea, controlDeck } = layout;

  for (const box of [board, gameArea]) {
    expect(box).not.toBeNull();
    expectVisibleInViewport(box, viewport);
  }

  // Full-screen, gesture-only: no on-screen pad deck at all.
  expect(controlDeck).toBeNull();
  // No scrolling — the whole game fits the viewport.
  expect(scrollHeight).toBeLessThanOrEqual(viewport.height + 1);
  expect(board.x).toBeGreaterThanOrEqual(-1);
  expect(board.right).toBeLessThanOrEqual(viewport.width + 1);
  // The board is the hero: it fills a large share of the screen height.
  expect(board.height).toBeGreaterThan(viewport.height * 0.5);
}

async function prepareVisualLayout(page) {
  const { cols, rows } = await page.evaluate(() => window.__tetrisTest.getBoardSize());
  const board = Array.from({ length: rows }, () => Array(cols).fill(0));
  // Place the same 10-column visual pattern in the bottom 3 rows, centered.
  const offset = Math.floor((cols - 10) / 2);
  const place = (row, col, val) => { if (col >= 0 && col < cols) board[row][col] = val; };
  const r1 = rows - 3, r2 = rows - 2, r3 = rows - 1;
  place(r1, offset + 2, 3); place(r1, offset + 3, 3); place(r1, offset + 4, 3);
  place(r1, offset + 6, 4); place(r1, offset + 7, 4);
  place(r2, offset + 1, 5); place(r2, offset + 2, 5);
  place(r2, offset + 4, 2); place(r2, offset + 5, 2);
  place(r2, offset + 7, 1); place(r2, offset + 8, 1); place(r2, offset + 9, 1);
  place(r3, offset + 0, 6); place(r3, offset + 1, 6);
  place(r3, offset + 2, 5); place(r3, offset + 3, 2); place(r3, offset + 4, 2);
  place(r3, offset + 5, 7); place(r3, offset + 6, 7);
  place(r3, offset + 8, 3); place(r3, offset + 9, 3);
  const spawnX = Math.floor(cols / 2) - 1;
  await setState(page, {
    board,
    current: { type: 'T', index: 3, x: spawnX, y: 3, rotation: 0 },
    score: 1200,
    lines: 4,
    level: 1,
    gameOver: false,
    clearAnimation: null,
    statusMessage: 'Level 1',
    statusTone: 'normal',
    statusMessageTimer: 180,
    gravityFrames: 48,
    gravityTick: 0,
    lockTimer: 0,
    heldPiece: 'S',
    holdUsed: true,
    nextPieceType: 'I',
    nextQueue: ['I', 'L', 'Z']
  });
  // Self-hosted webfonts must be ready before any visual baseline is captured.
  await page.evaluate(() => document.fonts.ready);
}

test('renders and exposes ready test API', async ({ page }) => {
  await openGame(page);
  await expect.poll(async () => {
    return page.locator('canvas#game').evaluate((canvas) => {
      const context = canvas.getContext('2d');
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let colored = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index] || pixels[index + 1] || pixels[index + 2] || pixels[index + 3]) colored += 1;
      }
      return colored;
    });
  }).toBeGreaterThan(500);
});

test('exposes a build marker on window and in the page head', async ({ page }) => {
  await openGame(page);
  const marker = await page.evaluate(() => ({
    win: window.__tetrisBuild,
    hook: window.__tetrisTest.buildId,
    meta: document.querySelector('meta[name="tetris-build"]')?.getAttribute('content')
  }));
  expect(marker.win).toBe('tetris-autopause-2026-06-27.15');
  expect(marker.hook).toBe(marker.win);
  expect(marker.meta).toBe(marker.win);
});

test('auto-pauses an in-progress game when the tab is hidden', async ({ page }) => {
  await openGame(page);
  let state = await getState(page);
  expect(state.paused).toBe(false);
  expect(state.gameOver).toBe(false);

  // Simulate the tab being hidden.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  state = await getState(page);
  expect(state.paused).toBe(true);

  // Returning to the tab does NOT auto-resume — the player resumes deliberately.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  state = await getState(page);
  expect(state.paused).toBe(true);
});

test('getControlsState returns handedness stub', async ({ page }) => {
  await openGame(page);
  const controls = await getControlsState(page);
  expect(controls).toEqual({ handedness: 'right' });
});

test('accent theme: a swatch recolors --accent and persists across reload', async ({ page }) => {
  await openGame(page);
  // Default accent is cyan.
  expect(await page.evaluate(() => window.__tetrisTest.getAccent())).toBe('#34d2e8');

  // Pick the amber swatch from the help panel.
  await page.locator('#help').click();
  await page.locator('.swatch[data-accent="#ffb02e"]').click();
  expect(await page.evaluate(() => window.__tetrisTest.getAccent())).toBe('#ffb02e');
  await expect(page.locator('.swatch[data-accent="#ffb02e"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => localStorage.getItem('tetris-accent'))).toBe('#ffb02e');

  // Persists across reload.
  await openGame(page);
  expect(await page.evaluate(() => window.__tetrisTest.getAccent())).toBe('#ffb02e');
});

test('keyboard move rotate and hard drop work', async ({ page }) => {
  await openGame(page);
  const start = await getState(page);

  await page.keyboard.press('ArrowLeft');
  const moved = await getState(page);
  expect(moved.current.x).toBeLessThan(start.current.x);

  const beforeRotate = moved.current.rotation;
  await page.keyboard.press('ArrowUp');
  const rotated = await getState(page);
  expect(rotated.current.rotation).not.toBe(beforeRotate);

  await page.keyboard.press('Space');
  const dropped = await getState(page);
  // Hard drop locks the piece and spawns a new one; score must have increased
  expect(dropped.score).toBeGreaterThan(rotated.score);
});

test('tap left and right moves exactly one column', async ({ page }) => {
  await openGame(page);
  const start = await getState(page);

  await page.keyboard.press('ArrowLeft');
  const afterLeft = await getState(page);
  expect(afterLeft.current.x).toBe(start.current.x - 1);

  await page.keyboard.press('ArrowRight');
  const afterRight = await getState(page);
  expect(afterRight.current.x).toBe(start.current.x);
});

test('hold left waits for DAS then repeats by ARR cadence', async ({ page }) => {
  await openGame(page);
  const start = await getState(page);

  await page.keyboard.down('ArrowLeft');
  const afterPress = await getState(page);
  expect(afterPress.current.x).toBe(start.current.x - 1);

  await advanceFrames(page, 15);
  const beforeDas = await getState(page);
  expect(beforeDas.current.x).toBe(afterPress.current.x);

  await advanceFrames(page, 1);
  const atDas = await getState(page);
  expect(atDas.current.x).toBe(afterPress.current.x);

  await advanceFrames(page, 6);
  const firstRepeat = await getState(page);
  expect(firstRepeat.current.x).toBe(atDas.current.x - 1);

  await advanceFrames(page, 6);
  const secondRepeat = await getState(page);
  expect(secondRepeat.current.x).toBe(firstRepeat.current.x - 1);
  await page.keyboard.up('ArrowLeft');
});

test('hold right waits for DAS then repeats by ARR cadence', async ({ page }) => {
  await openGame(page);
  const start = await getState(page);

  await page.keyboard.down('ArrowRight');
  const afterPress = await getState(page);
  expect(afterPress.current.x).toBe(start.current.x + 1);

  await advanceFrames(page, 15);
  const beforeDas = await getState(page);
  expect(beforeDas.current.x).toBe(afterPress.current.x);

  await advanceFrames(page, 1);
  const atDas = await getState(page);
  expect(atDas.current.x).toBe(afterPress.current.x);

  await advanceFrames(page, 6);
  const firstRepeat = await getState(page);
  expect(firstRepeat.current.x).toBe(atDas.current.x + 1);

  await advanceFrames(page, 6);
  const secondRepeat = await getState(page);
  expect(secondRepeat.current.x).toBe(firstRepeat.current.x + 1);
  await page.keyboard.up('ArrowRight');
});

test('line clear animates before lines and score update', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);

  const board = state.board.map((row) => row.slice());
  for (let x = 0; x < 10; x += 1) board[19][x] = 1;
  board[19][3] = 0;
  board[19][4] = 0;
  board[19][5] = 0;
  board[19][6] = 0;
  board[15][0] = 1; // residual block so the single-line clear isn't also a Perfect Clear

  state.board = board;
  state.current = { type: 'I', index: 1, x: 4, y: 17, rotation: 0 };
  state.score = 0;
  state.lines = 0;
  state.level = 1;
  state.gravityFrames = 48;
  state.gravityTick = 0;
  state.gameOver = false;
  await setState(page, state);

  await page.keyboard.press('Space');
  const during = await getState(page);
  const dropScore = during.score;
  expect(during.clearAnimation).not.toBeNull();
  expect(during.clearAnimation.rows).toEqual([19]);
  expect(during.lines).toBe(0);
  expect(dropScore).toBeGreaterThan(0);

  await advanceFrames(page, 17);
  const stillAnimating = await getState(page);
  expect(stillAnimating.clearAnimation).not.toBeNull();
  expect(stillAnimating.lines).toBe(0);

  await advanceFrames(page, 1);
  const after = await getState(page);
  expect(after.clearAnimation).toBeNull();
  expect(after.lines).toBe(1);
  expect(after.score).toBe(dropScore + 100);
});

test('level progression increases speed', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);
  state.lines = 9;
  state.level = 1;
  state.gravityFrames = 48;
  const board = state.board.map((row) => row.slice());
  for (let x = 0; x < 10; x += 1) board[19][x] = 1;
  board[19][3] = 0;
  board[19][4] = 0;
  board[19][5] = 0;
  board[19][6] = 0;
  board[15][0] = 1; // residual block so the single-line clear isn't also a Perfect Clear
  state.board = board;
  state.current = { type: 'I', index: 1, x: 4, y: 17, rotation: 0 };
  await setState(page, state);

  await page.keyboard.press('Space');
  await advanceFrames(page, 18);
  const after = await getState(page);
  expect(after.level).toBe(2);
  expect(after.gravityFrames).toBe(44);
  await expect(page.locator('#status')).toHaveText('Level 2 speed up');
});

test('milestone status persists briefly then falls back to next target message', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);
  state.lines = 39;
  state.level = 4;
  state.gravityFrames = 34;
  const board = state.board.map((row) => row.slice());
  for (let x = 0; x < 10; x += 1) board[19][x] = 1;
  board[19][3] = 0;
  board[19][4] = 0;
  board[19][5] = 0;
  board[19][6] = 0;
  board[15][0] = 1; // residual block so the single-line clear isn't also a Perfect Clear
  state.board = board;
  state.current = { type: 'I', index: 1, x: 4, y: 17, rotation: 0 };
  await setState(page, state);

  await page.keyboard.press('Space');
  await advanceFrames(page, 18);
  const after = await getState(page);
  expect(after.level).toBe(5);
  expect(after.gravityFrames).toBe(30);
  expect(after.statusTone).toBe('milestone');
  await expect(page.locator('#status')).toHaveText('Milestone reached: level 5');

  await advanceFrames(page, 180);
  await expect(page.locator('#status')).toHaveText('Marathon pace: 10 lines to level 6');
});

test('higher levels taper speed instead of jumping to minimum too early', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);
  state.lines = 89;
  state.level = 9;
  state.gravityFrames = 18;
  const board = state.board.map((row) => row.slice());
  for (let x = 0; x < 10; x += 1) board[19][x] = 1;
  board[19][3] = 0;
  board[19][4] = 0;
  board[19][5] = 0;
  board[19][6] = 0;
  board[15][0] = 1; // residual block so the single-line clear isn't also a Perfect Clear
  state.board = board;
  state.current = { type: 'I', index: 1, x: 4, y: 17, rotation: 0 };
  await setState(page, state);

  await page.keyboard.press('Space');
  await advanceFrames(page, 18);
  const after = await getState(page);
  expect(after.level).toBe(10);
  expect(after.gravityFrames).toBe(16);
  await expect(page.locator('#status')).toHaveText('Milestone reached: level 10');
});

test('minimum speed is delayed until level fifteen', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);
  state.lines = 139;
  state.level = 14;
  state.gravityFrames = 8;
  const board = state.board.map((row) => row.slice());
  for (let x = 0; x < 10; x += 1) board[19][x] = 1;
  board[19][3] = 0;
  board[19][4] = 0;
  board[19][5] = 0;
  board[19][6] = 0;
  board[15][0] = 1; // residual block so the single-line clear isn't also a Perfect Clear
  state.board = board;
  state.current = { type: 'I', index: 1, x: 4, y: 17, rotation: 0 };
  await setState(page, state);

  await page.keyboard.press('Space');
  await advanceFrames(page, 18);
  const after = await getState(page);
  expect(after.level).toBe(15);
  expect(after.gravityFrames).toBe(6);
  await expect(page.locator('#status')).toHaveText('Milestone reached: level 15');
});

test('game over on spawn collision then restart recovers', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);
  const board = state.board.map((row) => row.slice());
  board[0][4] = 2;
  board[0][5] = 2;
  board[1][4] = 2;
  board[1][5] = 2;
  state.board = board;
  state.current = { type: 'I', index: 1, x: 4, y: 17, rotation: 0 };
  await setState(page, state);

  await page.keyboard.press('Space');
  await advanceFrames(page, 1);
  const over = await getState(page);
  expect(over.gameOver).toBe(true);
  expect(over.statusMessage).toBe('Game Over');
  expect(over.statusTone).toBe('warning');
  await expect(page.locator('#status')).toHaveText('Game Over');

  await page.keyboard.press('r');
  const restarted = await getState(page);
  expect(restarted.gameOver).toBe(false);
  expect(restarted.lines).toBe(0);
  expect(restarted.score).toBe(0);
});

test('scoring past the stored best updates highScore live and persists to localStorage', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('tetris-high-score', '3'));
  await openGame(page);

  let state = await getState(page);
  expect(state.highScore).toBe(3);
  await expect(page.locator('#best')).toHaveText('3');

  // Hard drop from spawn awards 2 points per row — passes the stored best of 3
  await page.keyboard.press('Space');
  await advanceFrames(page, 1);

  state = await getState(page);
  expect(state.score).toBeGreaterThan(3);
  expect(state.highScore).toBe(state.score);
  await expect(page.locator('#best')).toHaveText(String(state.score));
  const stored = await page.evaluate(() => window.localStorage.getItem('tetris-high-score'));
  expect(stored).toBe(String(state.score));
});

test('game over after a scoring run reports gameOver with highScore intact', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('tetris-high-score', '5000'));
  await openGame(page);
  const state = await getState(page);
  const board = state.board.map((row) => row.slice());
  board[0][4] = 2;
  board[0][5] = 2;
  board[1][4] = 2;
  board[1][5] = 2;
  state.board = board;
  state.current = { type: 'I', index: 1, x: 4, y: 17, rotation: 0 };
  await setState(page, state);

  await page.keyboard.press('Space');
  await advanceFrames(page, 1);

  const over = await getState(page);
  expect(over.gameOver).toBe(true);
  expect(over.score).toBeGreaterThan(0);
  expect(over.highScore).toBe(5000);
  expect(over.newRecord).toBe(false);
  expect(over.statusMessage).toBe('Game Over');
  await expect(page.locator('#status')).toHaveText('Game Over');
  const stored = await page.evaluate(() => window.localStorage.getItem('tetris-high-score'));
  expect(stored).toBe('5000');
});

test('new-record run shows New record! status on game over', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('tetris-high-score', '3'));
  await openGame(page);
  const state = await getState(page);
  const board = state.board.map((row) => row.slice());
  board[0][4] = 2;
  board[0][5] = 2;
  board[1][4] = 2;
  board[1][5] = 2;
  state.board = board;
  state.current = { type: 'I', index: 1, x: 4, y: 17, rotation: 0 };
  await setState(page, state);

  await page.keyboard.press('Space');
  await advanceFrames(page, 1);

  const over = await getState(page);
  expect(over.gameOver).toBe(true);
  expect(over.newRecord).toBe(true);
  expect(over.highScore).toBe(over.score);
  expect(over.statusMessage).toBe('New record!');
  expect(over.statusTone).toBe('milestone');
  await expect(page.locator('#status')).toHaveText('New record!');
});

test('CCW rotation via z key rotates counterclockwise', async ({ page }) => {
  await openGame(page);
  const initial = await getState(page);
  const initialRotation = initial.current.rotation;

  await page.keyboard.press('ArrowUp');
  const afterCw = await getState(page);
  const cwRotation = (initialRotation + 1) % 4;
  expect(afterCw.current.rotation).toBe(cwRotation);

  await page.keyboard.press('z');
  const afterCcw = await getState(page);
  expect(afterCcw.current.rotation).toBe(initialRotation);
});

test('CCW rotation kicks away from right wall when base rotation overflows', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);

  // I-piece vertical (rot 1) at x=8: CCW to rot 0 puts a cell at col 10 (out of bounds).
  // The SRS I kick R→0 tries (0,0),(+2,0),(-1,0)… and (-1,0) → x=7 → cols 6-9 fits first.
  await setState(page, {
    ...state,
    board: Array.from({ length: 20 }, () => Array(10).fill(0)),
    current: { type: 'I', index: 1, x: 8, y: 10, rotation: 1 },
    gravityTick: 0, lockTimer: 0
  });

  await page.keyboard.press('z');
  const after = await getState(page);
  expect(after.current.rotation).toBe(0);
  expect(after.current.x).toBe(7);
});

test('CW rotation kicks away from left wall when base rotation overflows', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);

  // I-piece vertical (rot 3) at x=0: CW to rot 0 would place a cell at column -1 (out of bounds).
  // The SRS I kick L→0 tries (0,0),(+1,0)… and (+1,0) → x=1, which fits in columns 0-3.
  await setState(page, {
    ...state,
    board: Array.from({ length: 20 }, () => Array(10).fill(0)),
    current: { type: 'I', index: 1, x: 0, y: 10, rotation: 3 },
    gravityTick: 0, lockTimer: 0
  });

  await page.keyboard.press('ArrowUp');
  const after = await getState(page);
  expect(after.current.rotation).toBe(0);
  expect(after.current.x).toBe(1);
});

test('CCW rotation kicks away from left wall when base rotation overflows', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);

  // I-piece vertical (rot 3) at x=0: CCW to rot 2 would place a cell at column -1 (out of bounds).
  // The SRS I kick L→2 tries (0,0),(-2,0),(+1,0)… and (+1,0) → x=1, fitting columns 0-3.
  await setState(page, {
    ...state,
    board: Array.from({ length: 20 }, () => Array(10).fill(0)),
    current: { type: 'I', index: 1, x: 0, y: 10, rotation: 3 },
    gravityTick: 0, lockTimer: 0
  });

  await page.keyboard.press('z');
  const after = await getState(page);
  expect(after.current.rotation).toBe(2);
  expect(after.current.x).toBe(1);
});

test('4-line Tetris clear awards correct score and status message', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);

  // Rows 16-19 complete except column 5; I-piece vertical (rot 3) at x=5 fills the gap
  const board = Array.from({ length: 20 }, () => Array(10).fill(0));
  for (let row = 16; row <= 19; row++) {
    board[row] = [1, 1, 1, 1, 1, 0, 1, 1, 1, 1];
  }
  board[15][0] = 1; // residual block so the Tetris isn't also a Perfect Clear

  await setState(page, {
    ...state,
    board,
    score: 0,
    lines: 0,
    level: 1,
    current: { type: 'I', index: 1, x: 5, y: 2, rotation: 3 },
    gravityTick: 0, lockTimer: 0
  });

  await page.keyboard.press('Space');
  await advanceFrames(page, 1);
  // Advance through clear animation (18 frames) plus extra
  await advanceFrames(page, 25);

  const after = await getState(page);
  expect(after.lines).toBe(4);
  expect(after.score).toBeGreaterThanOrEqual(800); // 800 (Tetris) + hard-drop bonus
  expect(after.statusMessage).toMatch(/tetris clear/i);
  expect(after.statusTone).toBe('milestone');
});

test('Tetris clear message shown even when clear also causes a level-up', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);

  // lines=6 so clearing 4 pushes total to 10 → level 2 (crosses boundary)
  const board = Array.from({ length: 20 }, () => Array(10).fill(0));
  for (let row = 16; row <= 19; row++) {
    board[row] = [1, 1, 1, 1, 1, 0, 1, 1, 1, 1];
  }
  board[15][0] = 1; // residual block so the Tetris isn't also a Perfect Clear

  await setState(page, {
    ...state,
    board,
    score: 0,
    lines: 6,
    level: 1,
    current: { type: 'I', index: 1, x: 5, y: 2, rotation: 3 },
    gravityTick: 0, lockTimer: 0
  });

  await page.keyboard.press('Space');
  await advanceFrames(page, 1);
  await advanceFrames(page, 25);

  const after = await getState(page);
  expect(after.lines).toBe(10);
  expect(after.level).toBe(2);
  expect(after.statusMessage).toMatch(/tetris clear/i);
  expect(after.statusTone).toBe('milestone');
});

test.describe('combo and back-to-back scoring', () => {
  const emptyBoard = () => Array.from({ length: 20 }, () => Array(10).fill(0));

  // Row 19 filled except cols 4-5; an O-piece resting at y=18 completes exactly one line.
  function singleClearBoard() {
    const board = emptyBoard();
    board[19] = [1, 1, 1, 1, 0, 0, 1, 1, 1, 1];
    return board;
  }

  // Rows 16-19 filled except col 4; a vertical I-piece (rot 3) at x=4,y=17 completes four lines.
  // A residual block above keeps these Tetrises from also being Perfect Clears (which would
  // add an All-Clear bonus and change the back-to-back score math under test here).
  function tetrisBoard() {
    const board = emptyBoard();
    for (let row = 16; row <= 19; row += 1) board[row] = [1, 1, 1, 1, 0, 1, 1, 1, 1, 1];
    board[15][0] = 1;
    return board;
  }

  // Lock the resting piece via natural gravity (no hard/soft-drop points) and resolve the clear.
  async function gravityLockAndResolve(page) {
    // Gravity grounds the resting piece, then the lock delay (LOCK_DELAY_FRAMES = 30)
    // elapses before it commits, after which the clear animation (18 frames) resolves.
    await advanceFrames(page, 31); // gravity grounds + lock delay expires → piece locks
    await advanceFrames(page, 18); // clear animation resolves
  }

  test('exposes combo and back-to-back tracking with idle defaults', async ({ page }) => {
    await openGame(page);
    const state = await getState(page);
    expect(state.combo).toBe(-1);
    expect(state.b2bActive).toBe(false);
  });

  test('a single clear scores its base value with no combo bonus', async ({ page }) => {
    await openGame(page);
    const state = await getState(page);
    await setState(page, {
      ...state,
      board: singleClearBoard(),
      current: { type: 'O', index: 2, x: 4, y: 18, rotation: 0 },
      score: 0, lines: 0, level: 1,
      gravityTick: 47, gravityFrames: 48, lockTimer: 0
    });

    await gravityLockAndResolve(page);
    const after = await getState(page);
    expect(after.lines).toBe(1);
    expect(after.combo).toBe(0);
    expect(after.score).toBe(100); // base only, combo 0 adds nothing
  });

  test('consecutive clears build a combo bonus and announce it', async ({ page }) => {
    await openGame(page);
    const state = await getState(page);

    await setState(page, {
      ...state,
      board: singleClearBoard(),
      current: { type: 'O', index: 2, x: 4, y: 18, rotation: 0 },
      score: 0, lines: 0, level: 1,
      gravityTick: 47, gravityFrames: 48, lockTimer: 0
    });
    await gravityLockAndResolve(page);
    const afterFirst = await getState(page);
    expect(afterFirst.combo).toBe(0);
    const scoreAfterFirst = afterFirst.score;

    // Second clear in a row — preserve the combo chain across the state injection.
    await setState(page, {
      ...afterFirst,
      board: singleClearBoard(),
      current: { type: 'O', index: 2, x: 4, y: 18, rotation: 0 },
      gravityTick: 47, gravityFrames: 48, lockTimer: 0
    });
    await gravityLockAndResolve(page);
    const afterSecond = await getState(page);

    expect(afterSecond.combo).toBe(1);
    // Base 100 + combo bonus (50 × combo × level) = 150 added by the second clear.
    expect(afterSecond.score - scoreAfterFirst).toBe(150);
    expect(afterSecond.statusMessage).toMatch(/combo 1/i);
  });

  test('a non-clearing drop breaks the combo chain', async ({ page }) => {
    await openGame(page);
    const state = await getState(page);

    // Inject an in-progress combo, then drop a piece that completes no line.
    await setState(page, {
      ...state,
      board: emptyBoard(),
      current: { type: 'O', index: 2, x: 4, y: 18, rotation: 0 },
      combo: 5, b2bActive: false,
      gravityTick: 47, gravityFrames: 48, lockTimer: 0
    });

    await advanceFrames(page, 31); // grounds then locks with no clear after the lock delay
    const after = await getState(page);
    expect(after.combo).toBe(-1);
  });

  test('back-to-back Tetrises earn a difficulty bonus', async ({ page }) => {
    await openGame(page);
    const state = await getState(page);

    await setState(page, {
      ...state,
      board: tetrisBoard(),
      current: { type: 'I', index: 1, x: 4, y: 17, rotation: 3 },
      score: 0, lines: 0, level: 1,
      combo: -1, b2bActive: false,
      gravityTick: 47, gravityFrames: 48, lockTimer: 0
    });
    await gravityLockAndResolve(page);
    const afterFirst = await getState(page);
    expect(afterFirst.lines).toBe(4);
    expect(afterFirst.b2bActive).toBe(true);
    expect(afterFirst.score).toBe(800); // first Tetris: base only, no back-to-back yet
    const scoreAfterFirst = afterFirst.score;

    // Second Tetris while back-to-back is active. Reset combo to isolate the b2b bonus.
    await setState(page, {
      ...afterFirst,
      board: tetrisBoard(),
      current: { type: 'I', index: 1, x: 4, y: 17, rotation: 3 },
      combo: -1,
      gravityTick: 47, gravityFrames: 48, lockTimer: 0
    });
    await gravityLockAndResolve(page);
    const afterSecond = await getState(page);

    expect(afterSecond.b2bActive).toBe(true);
    // Base 800 + back-to-back bonus (half of 800 × level) = 1200 added by the second Tetris.
    expect(afterSecond.score - scoreAfterFirst).toBe(1200);
    expect(afterSecond.statusMessage).toMatch(/back-to-back/i);
  });

  test('a non-Tetris clear ends the back-to-back chain', async ({ page }) => {
    await openGame(page);
    const state = await getState(page);

    // Back-to-back is active; a single-line clear is not "difficult" and resets it.
    await setState(page, {
      ...state,
      board: singleClearBoard(),
      current: { type: 'O', index: 2, x: 4, y: 18, rotation: 0 },
      score: 0, lines: 0, level: 1,
      combo: -1, b2bActive: true,
      gravityTick: 47, gravityFrames: 48, lockTimer: 0
    });
    await gravityLockAndResolve(page);
    const after = await getState(page);
    expect(after.b2bActive).toBe(false);
    expect(after.score).toBe(100); // no back-to-back bonus on a single-line clear
  });
});

test.describe('SRS rotation', () => {
  // Every non-O piece must cycle through four 90° states and return to spawn, with the
  // same four cells, when rotated in open space (kick [0,0] always fits here).
  for (const type of ['I', 'T', 'S', 'Z', 'J', 'L']) {
    test(`${type}-piece returns to its spawn cells after four CW rotations`, async ({ page }) => {
      await openGame(page);
      const state = await getState(page);
      const index = { I: 1, O: 2, T: 3, S: 4, Z: 5, J: 6, L: 7 }[type];
      await setState(page, {
        ...state,
        board: Array.from({ length: 20 }, () => Array(10).fill(0)),
        current: { type, index, x: 4, y: 8, rotation: 0 },
        gravityFrames: 999, gravityTick: 0, lockTimer: 0
      });
      const pose = async () => {
        const s = await getState(page);
        return { rotation: s.current.rotation, x: s.current.x, y: s.current.y };
      };
      const before = await pose();
      for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowUp');
      const after = await pose();
      expect(after.rotation).toBe(before.rotation);
      expect(after.x).toBe(before.x);
      expect(after.y).toBe(before.y);
    });
  }

  test('T-piece floor kick: rotating against the floor lifts the piece via an SRS kick', async ({ page }) => {
    await openGame(page);
    const state = await getState(page);
    // T pointing up (rotation 0), flat edge resting on the floor at row 19. A CW rotation
    // to "nub right" would push a cell through the floor; SRS kicks it up one row instead.
    await setState(page, {
      ...state,
      board: Array.from({ length: 20 }, () => Array(10).fill(0)),
      current: { type: 'T', index: 3, x: 4, y: 19, rotation: 0 },
      gravityFrames: 999, gravityTick: 0, lockTimer: 0
    });
    await page.keyboard.press('ArrowUp');
    const after = await getState(page);
    expect(after.current.rotation).toBe(1);
    // The piece moved up so it stays on the board rather than failing the rotation.
    expect(after.current.y).toBeLessThan(19);
  });
});

test.describe('T-spin scoring', () => {
  // A classic T-spin Double: a flat overhang on the left, a 3-wide notch whose centre
  // column runs one row deeper. The T sits vertically in the notch then rotates flat,
  // tucking under the overhang and completing the bottom two rows.
  function tSpinDoubleBoard() {
    const board = Array.from({ length: 20 }, () => Array(10).fill(0));
    board[17][3] = 1;                                   // left overhang
    for (const c of [0, 1, 2, 6, 7, 8, 9]) board[18][c] = 1; // row 18 missing cols 3,4,5
    for (const c of [0, 1, 2, 3, 5, 6, 7, 8, 9]) board[19][c] = 1; // row 19 missing col 4
    return board;
  }

  test('rotating a T into a double notch scores a T-spin and sets back-to-back', async ({ page }) => {
    await openGame(page);
    const state = await getState(page);
    await setState(page, {
      ...state,
      board: tSpinDoubleBoard(),
      current: { type: 'T', index: 3, x: 4, y: 18, rotation: 1 }, // nub-right, seated in the notch
      score: 0, lines: 0, level: 1, combo: -1, b2bActive: false,
      gravityFrames: 999, gravityTick: 0, lockTimer: 0
    });

    await page.keyboard.press('ArrowUp'); // CW: nub-right → nub-down, tucks under the overhang
    const rotated = await getState(page);
    expect(rotated.current.rotation).toBe(2);

    await page.keyboard.press('Space'); // hard drop locks (distance 0 keeps the spin credit)
    await advanceFrames(page, 20);       // clear animation resolves

    const after = await getState(page);
    expect(after.lines).toBe(2);
    expect(after.score).toBe(1200);          // T-spin Double = 1200 × level 1, no combo/b2b yet
    expect(after.b2bActive).toBe(true);      // a T-spin is a "difficult" clear
    expect(after.statusMessage).toMatch(/t-spin double/i);
    expect(after.statusTone).toBe('milestone');
  });

  test('a T-spin with no line clear still scores and announces', async ({ page }) => {
    await openGame(page);
    const state = await getState(page);
    // Same notch but the surrounding rows are NOT full, so the spin clears nothing.
    const board = Array.from({ length: 20 }, () => Array(10).fill(0));
    board[17][3] = 1;        // left overhang → gives the third filled corner
    board[19][3] = 1;        // bottom-left corner
    board[19][5] = 1;        // bottom-right corner
    await setState(page, {
      ...state,
      board,
      current: { type: 'T', index: 3, x: 4, y: 18, rotation: 1 },
      score: 0, lines: 0, level: 1, combo: 3, b2bActive: false,
      gravityFrames: 999, gravityTick: 0, lockTimer: 0
    });

    await page.keyboard.press('ArrowUp'); // rotate into the slot (3 corners filled)
    await page.keyboard.press('Space');   // lock with no line clear
    await advanceFrames(page, 1);

    const after = await getState(page);
    expect(after.lines).toBe(0);
    expect(after.score).toBe(400);   // T-spin (no lines) = 400 × level 1
    expect(after.combo).toBe(-1);    // a clear-free lock still breaks the combo chain
    expect(after.statusMessage).toMatch(/t-spin/i);
  });

  test('a plain (non-spin) drop that clears two lines is not scored as a T-spin', async ({ page }) => {
    await openGame(page);
    const state = await getState(page);
    // An open notch (no overhang) so a nub-down T can drop straight in. Landing by hard
    // drop means the last action was a downward move, not a rotation — so it is not a spin.
    const board = Array.from({ length: 20 }, () => Array(10).fill(0));
    for (const c of [0, 1, 2, 6, 7, 8, 9]) board[18][c] = 1; // row 18 missing cols 3,4,5
    for (const c of [0, 1, 2, 3, 5, 6, 7, 8, 9]) board[19][c] = 1; // row 19 missing col 4
    board[15][0] = 1; // residual block so the double clear isn't also a Perfect Clear
    await setState(page, {
      ...state,
      board,
      current: { type: 'T', index: 3, x: 4, y: 16, rotation: 2 }, // nub-down, above the open notch
      score: 0, lines: 0, level: 1, combo: -1, b2bActive: false,
      gravityFrames: 999, gravityTick: 0, lockTimer: 0
    });

    await page.keyboard.press('Space'); // hard drop (distance > 0 clears any rotation credit)
    await advanceFrames(page, 20);

    const after = await getState(page);
    expect(after.lines).toBe(2);
    // Plain double base 300 + 4 hard-drop points (fell 2 rows × 2) = 304 — nowhere near
    // the T-spin Double value of 1200.
    expect(after.score).toBe(304);
    expect(after.statusMessage).not.toMatch(/t-spin/i);
  });
});

test.describe('lock delay', () => {
  test('rotating a grounded piece resets the lock delay (move reset)', async ({ page }) => {
    await openGame(page);
    const state = await getState(page);
    await setState(page, {
      ...state,
      board: Array.from({ length: 20 }, () => Array(10).fill(0)),
      current: { type: 'O', index: 2, x: 4, y: 18, rotation: 0 },
      gravityFrames: 999, gravityTick: 0, lockTimer: 0
    });

    // Each rotation just before the 30-frame delay would expire resets it, so across
    // 100 frames the grounded piece never commits to the board.
    for (let i = 0; i < 5; i += 1) {
      await advanceFrames(page, 20);
      await page.keyboard.press('ArrowUp'); // O rotation is a no-op move that still resets the timer
    }
    const stalled = await getState(page);
    expect(stalled.board[18][4]).toBe(0); // still floating
    expect(stalled.current).not.toBeNull();

    // Stop resetting; the lock delay now runs out and the piece locks.
    await advanceFrames(page, 31);
    const after = await getState(page);
    expect(after.board[18][4]).toBeGreaterThan(0);
  });

  test('the move-reset budget is capped so a piece cannot be stalled forever', async ({ page }) => {
    await openGame(page);
    const state = await getState(page);
    await setState(page, {
      ...state,
      board: Array.from({ length: 20 }, () => Array(10).fill(0)),
      current: { type: 'O', index: 2, x: 4, y: 18, rotation: 0 },
      gravityFrames: 999, gravityTick: 0, lockTimer: 0
    });

    // Rotate every single frame. Past the reset cap the lock delay can no longer be
    // refreshed, so the piece still locks within a bounded number of frames.
    for (let i = 0; i < 80; i += 1) {
      await page.keyboard.press('ArrowUp');
      await advanceFrames(page, 1);
    }
    const after = await getState(page);
    expect(after.board[18][4]).toBeGreaterThan(0); // locked despite continuous rotation
  });
});

test.describe('perfect clear', () => {
  async function gravityLockAndResolve(page) {
    await advanceFrames(page, 31); // gravity grounds + lock delay expires → piece locks
    await advanceFrames(page, 18); // clear animation resolves
  }

  test('a clear that empties the whole board scores a Perfect Clear bonus', async ({ page }) => {
    await openGame(page);
    const state = await getState(page);
    // Rows 18-19 full except a 2x2 hole at cols 4-5, and nothing else on the board. An O
    // dropped into the hole completes both rows and leaves the playfield completely empty.
    const board = Array.from({ length: 20 }, () => Array(10).fill(0));
    for (const c of [0, 1, 2, 3, 6, 7, 8, 9]) { board[18][c] = 1; board[19][c] = 1; }
    await setState(page, {
      ...state,
      board,
      current: { type: 'O', index: 2, x: 4, y: 18, rotation: 0 },
      score: 0, lines: 0, level: 1, combo: -1, b2bActive: false,
      gravityTick: 47, gravityFrames: 48, lockTimer: 0
    });

    await gravityLockAndResolve(page);
    const after = await getState(page);
    expect(after.lines).toBe(2);
    // Plain double base 300 + Perfect Clear bonus 1200 = 1500 (no hard-drop points via gravity).
    expect(after.score).toBe(1500);
    expect(after.statusMessage).toMatch(/perfect clear/i);
    expect(after.statusTone).toBe('milestone');
    // The board itself is empty again (the spawned piece lives in state.current, not the board).
    expect(after.board.every((row) => row.every((c) => c === 0))).toBe(true);
  });

  test('a Perfect Clear headlines over the Tetris message and adds the Tetris all-clear value', async ({ page }) => {
    await openGame(page);
    const state = await getState(page);
    // Rows 16-19 full except col 4, nothing else — a vertical I fills col 4 for a Tetris that
    // also empties the board.
    const board = Array.from({ length: 20 }, () => Array(10).fill(0));
    for (let row = 16; row <= 19; row += 1) board[row] = [1, 1, 1, 1, 0, 1, 1, 1, 1, 1];
    await setState(page, {
      ...state,
      board,
      current: { type: 'I', index: 1, x: 4, y: 17, rotation: 3 },
      score: 0, lines: 0, level: 1, combo: -1, b2bActive: false,
      gravityTick: 47, gravityFrames: 48, lockTimer: 0
    });

    await gravityLockAndResolve(page);
    const after = await getState(page);
    expect(after.lines).toBe(4);
    // Tetris base 800 + Perfect Clear (Tetris) bonus 2000 = 2800.
    expect(after.score).toBe(2800);
    expect(after.statusMessage).toMatch(/perfect clear/i);
    expect(after.statusMessage).not.toMatch(/tetris clear/i);
  });

  test('a clear that leaves blocks behind is not a Perfect Clear', async ({ page }) => {
    await openGame(page);
    const state = await getState(page);
    // Same 2x2 hole, but an extra stray block up top survives the clear → no All-Clear bonus.
    const board = Array.from({ length: 20 }, () => Array(10).fill(0));
    for (const c of [0, 1, 2, 3, 6, 7, 8, 9]) { board[18][c] = 1; board[19][c] = 1; }
    board[10][0] = 1;
    await setState(page, {
      ...state,
      board,
      current: { type: 'O', index: 2, x: 4, y: 18, rotation: 0 },
      score: 0, lines: 0, level: 1, combo: -1, b2bActive: false,
      gravityTick: 47, gravityFrames: 48, lockTimer: 0
    });

    await gravityLockAndResolve(page);
    const after = await getState(page);
    expect(after.lines).toBe(2);
    expect(after.score).toBe(300); // plain double only, no Perfect Clear bonus
    expect(after.statusMessage).not.toMatch(/perfect clear/i);
  });
});

test.describe('game stats', () => {
  async function gravityLockAndResolve(page) {
    await advanceFrames(page, 31);
    await advanceFrames(page, 18);
  }

  test('getState exposes per-game stats that start at zero', async ({ page }) => {
    await openGame(page);
    const s = await getState(page);
    expect(s.stats).toEqual({ pieces: 0, tetrises: 0, tSpins: 0, perfectClears: 0, maxCombo: 0 });
  });

  test('a Tetris increments the piece and tetris tallies', async ({ page }) => {
    await openGame(page);
    const state = await getState(page);
    const board = Array.from({ length: 20 }, () => Array(10).fill(0));
    for (let row = 16; row <= 19; row += 1) board[row] = [1, 1, 1, 1, 0, 1, 1, 1, 1, 1];
    board[15][0] = 1; // residual so it's a plain Tetris, not a Perfect Clear
    await setState(page, {
      ...state,
      board,
      current: { type: 'I', index: 1, x: 4, y: 17, rotation: 3 },
      score: 0, lines: 0, level: 1, gravityTick: 47, gravityFrames: 48, lockTimer: 0
    });
    await gravityLockAndResolve(page);
    const after = await getState(page);
    expect(after.stats.tetrises).toBe(1);
    expect(after.stats.pieces).toBeGreaterThanOrEqual(1);
  });

  test('a T-spin is tallied', async ({ page }) => {
    await openGame(page);
    const state = await getState(page);
    const board = Array.from({ length: 20 }, () => Array(10).fill(0));
    board[17][3] = 1;
    for (const c of [0, 1, 2, 6, 7, 8, 9]) board[18][c] = 1;
    for (const c of [0, 1, 2, 3, 5, 6, 7, 8, 9]) board[19][c] = 1;
    await setState(page, {
      ...state,
      board,
      current: { type: 'T', index: 3, x: 4, y: 18, rotation: 1 },
      score: 0, lines: 0, level: 1, combo: -1, b2bActive: false,
      gravityFrames: 999, gravityTick: 0, lockTimer: 0
    });
    await page.keyboard.press('ArrowUp'); // rotate into the T-spin slot
    await page.keyboard.press('Space');   // hard drop locks
    await advanceFrames(page, 20);
    const after = await getState(page);
    expect(after.stats.tSpins).toBe(1);
  });

  test('a Perfect Clear is tallied and best combo is tracked', async ({ page }) => {
    await openGame(page);
    const state = await getState(page);
    const board = Array.from({ length: 20 }, () => Array(10).fill(0));
    for (const c of [0, 1, 2, 3, 6, 7, 8, 9]) { board[18][c] = 1; board[19][c] = 1; }
    await setState(page, {
      ...state,
      board,
      current: { type: 'O', index: 2, x: 4, y: 18, rotation: 0 },
      score: 0, lines: 0, level: 1, combo: 0, b2bActive: false,
      gravityTick: 47, gravityFrames: 48, lockTimer: 0
    });
    await gravityLockAndResolve(page);
    const after = await getState(page);
    expect(after.stats.perfectClears).toBe(1);
    expect(after.stats.maxCombo).toBeGreaterThanOrEqual(1); // combo advanced from 0 to 1 on this clear
  });

  test('stats reset on restart', async ({ page }) => {
    await openGame(page);
    const state = await getState(page);
    await setState(page, { ...state, stats: { pieces: 9, tetrises: 2, tSpins: 1, perfectClears: 1, maxCombo: 5 } });
    await page.evaluate(() => window.__tetrisTest.restart());
    const after = await getState(page);
    expect(after.stats).toEqual({ pieces: 0, tetrises: 0, tSpins: 0, perfectClears: 0, maxCombo: 0 });
  });
});

test.describe('starting level', () => {
  test('defaults to level 1', async ({ page }) => {
    await openGame(page);
    expect(await page.evaluate(() => window.__tetrisTest.getStartLevel())).toBe(1);
    const s = await getState(page);
    expect(s.startLevel).toBe(1);
    expect(s.level).toBe(1);
  });

  test('a higher start level begins a fresh game at that speed', async ({ page }) => {
    await openGame(page);
    await page.evaluate(() => window.__tetrisTest.setStartLevel(5));
    const s = await getState(page);
    expect(s.startLevel).toBe(5);
    expect(s.level).toBe(5);
    expect(s.lines).toBe(0);
    expect(s.score).toBe(0);
    expect(s.gravityFrames).toBe(30); // gravityFramesForLevel(5)
  });

  test('level still climbs every 10 lines from the chosen start', async ({ page }) => {
    await openGame(page);
    await page.evaluate(() => window.__tetrisTest.setStartLevel(5));
    const state = await getState(page);
    const board = state.board.map((row) => row.slice());
    for (let x = 0; x < 10; x += 1) board[19][x] = 1;
    board[19][3] = 0; board[19][4] = 0; board[19][5] = 0; board[19][6] = 0;
    board[15][0] = 1; // residual so the single clear isn't a Perfect Clear
    await setState(page, {
      ...state, board,
      current: { type: 'I', index: 1, x: 4, y: 17, rotation: 0 },
      lines: 9, startLevel: 5, gravityTick: 0, gravityFrames: 30
    });
    await page.keyboard.press('Space');
    await advanceFrames(page, 18);
    const after = await getState(page);
    expect(after.lines).toBe(10);
    expect(after.level).toBe(6); // 5 + floor(10 / 10)
  });

  test('persists across reload and clamps out-of-range values', async ({ page }) => {
    await openGame(page);
    await page.evaluate(() => window.__tetrisTest.setStartLevel(99)); // clamps to 15
    expect(await page.evaluate(() => window.__tetrisTest.getStartLevel())).toBe(15);
    await page.reload();
    await page.waitForFunction(() => window.__tetrisTest && window.__tetrisTest.isReady);
    expect(await page.evaluate(() => window.__tetrisTest.getStartLevel())).toBe(15);
    const s = await page.evaluate(() => window.__tetrisTest.getState());
    expect(s.level).toBe(15);
  });
});

test.describe('clear juice', () => {
  test('an ordinary single clear has intensity 0', async ({ page }) => {
    await openGame(page);
    const state = await getState(page);
    const board = Array.from({ length: 20 }, () => Array(10).fill(0));
    board[19] = [1, 1, 1, 1, 0, 0, 1, 1, 1, 1];
    board[15][0] = 1; // leaves a block behind → not a Perfect Clear
    await setState(page, {
      ...state, board,
      current: { type: 'O', index: 2, x: 4, y: 18, rotation: 0 },
      gravityTick: 0, lockTimer: 0
    });
    await page.keyboard.press('Space');
    const s = await getState(page);
    expect(s.clearAnimation.rows).toEqual([19]);
    expect(s.clearAnimation.intensity).toBe(0);
  });

  test('a Tetris clear has intensity 1', async ({ page }) => {
    await openGame(page);
    const state = await getState(page);
    const board = Array.from({ length: 20 }, () => Array(10).fill(0));
    for (let row = 16; row <= 19; row += 1) board[row] = [1, 1, 1, 1, 0, 1, 1, 1, 1, 1];
    board[15][0] = 1; // not a Perfect Clear
    await setState(page, {
      ...state, board,
      current: { type: 'I', index: 1, x: 4, y: 17, rotation: 3 },
      gravityTick: 0, lockTimer: 0
    });
    await page.keyboard.press('Space');
    const s = await getState(page);
    expect(s.clearAnimation.rows.length).toBe(4);
    expect(s.clearAnimation.intensity).toBe(1);
  });

  test('a Perfect Clear has intensity 2', async ({ page }) => {
    await openGame(page);
    const state = await getState(page);
    const board = Array.from({ length: 20 }, () => Array(10).fill(0));
    for (const c of [0, 1, 2, 3, 6, 7, 8, 9]) { board[18][c] = 1; board[19][c] = 1; }
    await setState(page, {
      ...state, board,
      current: { type: 'O', index: 2, x: 4, y: 18, rotation: 0 },
      gravityTick: 0, lockTimer: 0
    });
    await page.keyboard.press('Space');
    const s = await getState(page);
    expect(s.clearAnimation.intensity).toBe(2);
  });
});

test('NEXT and HOLD canvases render non-blank pixels after preview is set', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);
  await setState(page, { ...state, heldPiece: 'S', nextPieceType: 'I' });
  await advanceFrames(page, 1);

  const hasPixels = await page.evaluate(() => {
    function canvasHasContent(id) {
      const canvas = document.getElementById(id);
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      return Array.from(data).some((v, i) => i % 4 === 3 && v > 0);
    }
    return { next: canvasHasContent('next-canvas'), hold: canvasHasContent('hold-canvas') };
  });
  expect(hasPixels.next).toBe(true);
  expect(hasPixels.hold).toBe(true);
});

test('soft-drop lockTimer accumulates and locks piece after LOCK_DELAY_FRAMES fires', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);

  // Place O-piece at floor; it cannot move down further
  await setState(page, {
    ...state,
    board: Array.from({ length: 20 }, () => Array(10).fill(0)),
    current: { type: 'O', index: 2, x: 4, y: 18, rotation: 0 },
    gravityTick: 0, lockTimer: 0, gravityFrames: 48
  });

  // Each soft-drop fire that fails to move the piece increments lockTimer by 1.
  // With DROP_REPEAT_FRAMES=2 and cadence (tick-1)%2===0, fires at ticks 1,3,5,...,59 (30 fires).
  // After 30 lockTimer increments the piece locks (LOCK_DELAY_FRAMES=30).
  await page.keyboard.down('ArrowDown');
  await advanceFrames(page, 60);
  await page.keyboard.up('ArrowDown');

  const after = await getState(page);
  expect(after.board[18][4]).toBeGreaterThan(0); // O-piece locked at row 18
  expect(after.board[18][5]).toBeGreaterThan(0);
  expect(after.gameOver).toBe(false);
});

test('natural gravity grounds the piece then locks after the lock delay', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);
  await setState(page, {
    ...state,
    board: Array.from({ length: 20 }, () => Array(10).fill(0)),
    current: { type: 'O', index: 2, x: 4, y: 18, rotation: 0 },
    gravityTick: 47, lockTimer: 0
  });

  // Gravity fires but the grounded piece does NOT lock instantly — it gets a lock
  // delay so it can still be slid/spun, matching modern Tetris feel.
  await advanceFrames(page, 1);
  const grounded = await getState(page);
  expect(grounded.current).not.toBeNull();
  expect(grounded.current.type).toBe('O');
  expect(grounded.board[18][4]).toBe(0); // not committed to the board yet

  // After the lock delay elapses the piece commits.
  await advanceFrames(page, 30);
  const after = await getState(page);
  expect(after.gameOver).toBe(false);
  expect(after.board[18][4]).toBeGreaterThan(0);
  expect(after.board[18][5]).toBeGreaterThan(0);
  expect(after.current).not.toBeNull();
});

test('hold-preview div is keyboard-activatable via Space and Enter', async ({ page }) => {
  await openGame(page);
  const initial = await getState(page);
  expect(initial.heldPiece).toBeNull();

  // Space path
  await page.locator('[data-action="hold"]').focus();
  await page.keyboard.press('Space');
  const afterSpace = await getState(page);
  expect(afterSpace.heldPiece).toBe(initial.current.type);
  expect(afterSpace.holdUsed).toBe(true);
  expect(afterSpace.nextPieceType).not.toBeNull();

  // Drop the current piece so holdUsed resets, then test Enter path
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press('Space');
  await advanceFrames(page, 3);

  // Verify the new piece has spawned and holdUsed was reset before proceeding
  const afterDrop = await getState(page);
  expect(afterDrop.holdUsed).toBe(false);
  expect(afterDrop.current).not.toBeNull();

  await page.locator('[data-action="hold"]').focus();
  await page.keyboard.press('Enter');
  const afterEnter = await getState(page);
  expect(afterEnter.holdUsed).toBe(true);
});

test('hold piece mechanic saves and swaps piece', async ({ page }) => {
  await openGame(page);
  const initial = await getState(page);
  const initialType = initial.current.type;
  const holdBox = page.locator('[data-action="hold"]');
  await expect(holdBox).toHaveClass(/hold-empty/);
  await expect(holdBox).not.toHaveClass(/hold-locked/);

  await page.keyboard.press('c');
  await advanceFrames(page, 1);
  const afterFirstHold = await getState(page);
  expect(afterFirstHold.heldPiece).toBe(initialType);
  expect(afterFirstHold.holdUsed).toBe(true);
  expect(afterFirstHold.current).not.toBeNull();
  expect(afterFirstHold.current.type).not.toBe(initialType);
  expect(afterFirstHold.nextPieceType).not.toBeNull();
  expect(afterFirstHold.statusMessage).toMatch(/hold/i);
  await expect(page.locator('#status')).toHaveText(afterFirstHold.statusMessage);
  await expect(holdBox).toHaveAttribute('aria-disabled', 'true');
  await expect(holdBox).toHaveAttribute('aria-label', `Hold piece: ${initialType}`);
  await expect(holdBox).toHaveClass(/hold-locked/);
  await expect(holdBox).not.toHaveClass(/hold-empty/);

  await page.keyboard.press('c');
  await advanceFrames(page, 1);
  const afterSecondAttempt = await getState(page);
  expect(afterSecondAttempt.heldPiece).toBe(initialType);
  expect(afterSecondAttempt.current.type).toBe(afterFirstHold.current.type);
  expect(afterSecondAttempt.statusMessage).toBe('Hold not available');
  await expect(page.locator('#status')).toHaveText('Hold not available');

  // Clear the board before hard-drop so no line-clear animation can delay spawnPiece
  // and leave holdUsed=true when we assert below.
  const stateBeforeDrop = await getState(page);
  await setState(page, { ...stateBeforeDrop, board: Array.from({ length: 20 }, () => Array(10).fill(0)) });
  await page.keyboard.press('Space');
  await advanceFrames(page, 1);
  const afterDrop = await getState(page);
  expect(afterDrop.holdUsed).toBe(false);
  await expect(holdBox).toHaveAttribute('aria-disabled', 'false');
  await expect(holdBox).not.toHaveClass(/hold-locked/);

  const beforeSwapType = afterDrop.current.type;
  await page.keyboard.press('c');
  await advanceFrames(page, 1);
  const afterSwap = await getState(page);
  expect(afterSwap.heldPiece).toBe(beforeSwapType);
  expect(afterSwap.current.type).toBe(initialType);
  expect(afterSwap.nextPieceType).not.toBeNull();
  expect(afterSwap.statusMessage).toMatch(/hold/i);
  await expect(page.locator('#status')).toHaveText(afterSwap.statusMessage);
});

test('keyboard Space held does not chain hard-drop multiple pieces', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);
  await setState(page, {
    ...state,
    board: Array.from({ length: 20 }, () => Array(10).fill(0)),
    gravityFrames: 48, gravityTick: 0, lockTimer: 0, score: 0
  });

  // Simulate keyboard repeat: dispatch many keydown events with repeat: true
  await page.evaluate(() => {
    for (let i = 0; i < 50; i++) {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', repeat: true, bubbles: true }));
    }
  });
  await advanceFrames(page, 10);

  const after = await getState(page);
  // Without the event.repeat guard, Space repeat would hard-drop piece after piece;
  // with the guard, repeated keydown events are no-ops and the board stays alive.
  expect(after.gameOver).toBe(false);
});

test('hold swap cancelled without state corruption when spawn is blocked', async ({ page }) => {
  await openGame(page);

  // Block the I-piece's spawn footprint (row 1, cols 3-6 at spawn x=4) so the swap
  // has nowhere to place the held piece and must be cancelled.
  const board = Array.from({ length: 20 }, () => Array(10).fill(0));
  board[1][3] = 1; board[1][4] = 1; board[1][5] = 1; board[1][6] = 1;

  await setState(page, {
    board,
    current: { type: 'T', index: 3, x: 4, y: 10, rotation: 0 },
    heldPiece: 'I',
    holdUsed: false,
    score: 0, lines: 0, level: 1,
    gravityFrames: 48, gravityTick: 0, lockTimer: 0,
    gameOver: false, clearAnimation: null,
    statusMessage: '', statusTone: 'normal', statusMessageTimer: 0,
    nextPieceType: 'O'
  });

  await page.keyboard.press('c');
  const after = await getState(page);

  expect(after.current.type).toBe('T');
  expect(after.heldPiece).toBe('I');
  expect(after.holdUsed).toBe(false);
});

test('hold is silently ignored during an active clear animation', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);

  // Inject an active clear animation directly into state
  await setState(page, {
    ...state,
    heldPiece: null,
    holdUsed: false,
    clearAnimation: { rows: [19], frame: 0, totalFrames: 18, blinkInterval: 2 }
  });

  await page.keyboard.press('c');
  const after = await getState(page);
  expect(after.heldPiece).toBeNull();
  expect(after.holdUsed).toBe(false);
  expect(after.clearAnimation).not.toBeNull(); // animation still running
});

test('first hold resets gravityTick so new piece gets a full gravity cycle', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);

  // Set gravityTick to 47 — one frame from firing at gravityFrames=48
  await setState(page, {
    ...state,
    heldPiece: null,
    holdUsed: false,
    gravityTick: 47,
    gravityFrames: 48,
    lockTimer: 0
  });
  const beforeY = (await getState(page)).current.y;

  await page.keyboard.press('c'); // first hold
  await advanceFrames(page, 1);  // one gravity tick on newly spawned piece
  const afterY = (await getState(page)).current.y;

  // Without the fix, the spawned piece inherits gravityTick=47 and drops on the first frame.
  expect(afterY).toBe(beforeY);
});

test('swap hold resets gravityTick so swapped piece gets a full gravity cycle', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);

  // First hold to populate heldPiece, then set gravityTick near fire
  await page.keyboard.press('c');
  await advanceFrames(page, 1);
  const afterFirstHold = await getState(page);
  const heldType = afterFirstHold.heldPiece;

  await page.keyboard.press('Space'); // hard-drop to reset holdUsed
  await advanceFrames(page, 1);

  // Set gravityTick to 47 — one frame from firing at gravityFrames=48
  const mid = await getState(page);
  await setState(page, {
    ...mid,
    heldPiece: heldType,
    holdUsed: false,
    gravityTick: 47,
    gravityFrames: 48,
    lockTimer: 0
  });
  const beforeY = (await getState(page)).current.y;

  await page.keyboard.press('c'); // swap hold
  await advanceFrames(page, 1);  // one gravity tick on swapped piece
  const afterY = (await getState(page)).current.y;

  // Without the fix, the swapped piece inherits gravityTick=47 and drops on the first frame.
  expect(afterY).toBe(beforeY);
});

test('soft-drop lock with line clear gives new piece a full gravity cycle', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);

  // Fill row 19 except column 4; O-piece at y=17 will drop into col 4-5 and complete rows 18-19
  const board = Array.from({ length: 20 }, () => Array(10).fill(0));
  board[19] = [1, 1, 1, 1, 0, 1, 1, 1, 1, 1]; // row 19 missing col 4
  board[18] = [1, 1, 1, 1, 0, 1, 1, 1, 1, 1]; // row 18 missing col 4

  // Set gravityTick near max so the inherited value would cause an immediate drop
  await setState(page, {
    ...state,
    board,
    current: { type: 'O', index: 2, x: 3, y: 17, rotation: 0 },
    gravityTick: 45, gravityFrames: 48, lockTimer: 0
  });

  // Soft-drop the piece to the floor and let lockTimer reach LOCK_DELAY_FRAMES (30)
  await page.keyboard.down('ArrowDown');
  await advanceFrames(page, 70); // enough frames for lockTimer to hit 30 and lines to clear
  await page.keyboard.up('ArrowDown');

  const afterClear = await getState(page);
  expect(afterClear.lines).toBeGreaterThanOrEqual(1);

  // Advance one more frame; new piece should NOT have dropped yet (gravityTick was reset to 0)
  const spawnY = afterClear.current?.y ?? 0;
  await advanceFrames(page, 1);
  const afterOneFrame = await getState(page);
  expect(afterOneFrame.current?.y ?? spawnY).toBe(spawnY);
});

test('gravity fires during soft-drop accumulation and new piece gets full gravity cycle', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);

  // O-piece at floor (y=18). gravityTick=47, gravityFrames=48, lockTimer=0.
  // The grounded piece runs out its lock delay, then spawnPiece must reset gravityTick
  // to 0 so the freshly spawned piece gets a full gravity cycle.
  await setState(page, {
    ...state,
    board: Array.from({ length: 20 }, () => Array(10).fill(0)),
    current: { type: 'O', index: 2, x: 4, y: 18, rotation: 0 },
    gravityTick: 47, gravityFrames: 48, lockTimer: 0
  });

  await page.keyboard.down('ArrowDown');
  await advanceFrames(page, 31); // lock delay expires; new piece spawns with gravityTick=0
  await page.keyboard.up('ArrowDown');

  const afterLock = await getState(page);
  expect(afterLock.board[18][4]).toBeGreaterThan(0); // O-piece locked at row 18
  expect(afterLock.current).not.toBeNull();

  // Advance one more frame with gravity still slow; piece must not have dropped yet
  const spawnY = afterLock.current.y;
  await advanceFrames(page, 1);
  const afterOneFrame = await getState(page);
  expect(afterOneFrame.current?.y ?? spawnY).toBe(spawnY);
});

test('natural gravity fires and locks piece at floor without rendering error', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);

  await setState(page, {
    ...state,
    board: Array.from({ length: 20 }, () => Array(10).fill(0)),
    current: { type: 'O', index: 2, x: 4, y: 18, rotation: 0 },
    gravityTick: 47, lockTimer: 0
  });

  await advanceFrames(page, 31);
  const after = await getState(page);
  // Gravity grounded the piece, the lock delay expired, it locked, new piece spawned
  expect(after.current).not.toBeNull();
  // O-piece covers cols 4-5, rows 18-19; check both columns of the top row
  expect(after.board[18][4]).toBeGreaterThan(0);
  expect(after.board[18][5]).toBeGreaterThan(0);
});

test('ghost piece stops at board obstacle, not at floor', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);

  // Place filled cells at row 15 in columns 3-6 to block an O-piece dropped at x=4
  const board = Array.from({ length: 20 }, () => Array(10).fill(0));
  board[15] = [0, 0, 0, 1, 1, 1, 1, 0, 0, 0];

  await setState(page, {
    ...state,
    board,
    current: { type: 'O', index: 2, x: 4, y: 2, rotation: 0 },
    gravityTick: 0, lockTimer: 0
  });
  await advanceFrames(page, 1);

  // Ghost should be rendered at row 13 (cols 4-5). Sample a pixel inside the ghost cell
  // at the predicted ghost position and verify it differs from the background (#080400).
  const ghostRow = 13;
  const ghostCol = 4;
  const hasGhostPixel = await page.evaluate(({ row, col }) => {
    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');
    const cellSize = canvas.width / window.__tetrisTest.getBoardSize().cols;
    // Sample a 3-pixel horizontal strip along the left stroke edge of the ghost cell.
    // strokeRect draws 2px inside, lineWidth=1.5: strip at x=[col*30+1, col*30+3].
    // Ghost is rgba(255,255,255,0.22) over background (#020617, r=2): r blends to ~58.
    // Checking multiple pixels guards against sub-pixel antialiasing variation.
    const py = Math.floor(row * cellSize + cellSize / 2);
    for (let dx = 1; dx <= 3; dx++) {
      const data = ctx.getImageData(col * cellSize + dx, py, 1, 1).data;
      if (data[0] > 20) return true; // background red channel = 2; ghost raises it to ~58
    }
    return false;
  }, { row: ghostRow, col: ghostCol });
  expect(hasGhostPixel).toBe(true);

  // Also verify hard-drop lands at ghost position
  await page.keyboard.press('Space');
  await advanceFrames(page, 3);

  const dropped = await getState(page);
  // After hard drop from y=2, piece locks at y=13 (row 15 blocks the cell below y=14)
  expect(dropped.board[13][4]).toBeGreaterThan(0);
  expect(dropped.board[15][4]).toBeGreaterThan(0); // original obstacle still there
});

test('ghost piece can be toggled off and the choice persists', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);
  const board = Array.from({ length: 20 }, () => Array(10).fill(0));
  board[15] = [0, 0, 0, 1, 1, 1, 1, 0, 0, 0]; // blocks an O dropped at x=4 → ghost at row 13
  await setState(page, {
    ...state,
    board,
    current: { type: 'O', index: 2, x: 4, y: 2, rotation: 0 },
    gravityTick: 0, lockTimer: 0
  });
  await advanceFrames(page, 1);

  const ghostVisible = () => page.evaluate(() => {
    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');
    const cellSize = canvas.width / window.__tetrisTest.getBoardSize().cols;
    const py = Math.floor(13 * cellSize + cellSize / 2);
    for (let dx = 1; dx <= 3; dx++) {
      if (ctx.getImageData(4 * cellSize + dx, py, 1, 1).data[0] > 20) return true;
    }
    return false;
  });

  expect(await ghostVisible()).toBe(true); // ghost shown by default

  await page.evaluate(() => window.__tetrisTest.setGhostEnabled(false));
  expect(await page.evaluate(() => window.__tetrisTest.getGhostEnabled())).toBe(false);
  expect(await ghostVisible()).toBe(false); // ghost no longer painted

  await page.reload();
  await page.waitForFunction(() => window.__tetrisTest && window.__tetrisTest.isReady);
  expect(await page.evaluate(() => window.__tetrisTest.getGhostEnabled())).toBe(false);
});

test('pressing P pauses the game and freezes gameplay across advanceFrames', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);
  await setState(page, {
    ...state,
    current: { type: 'T', index: 3, x: 4, y: 3, rotation: 0 },
    gravityFrames: 4,
    gravityTick: 0,
    lockTimer: 0
  });

  await page.keyboard.press('p');
  let s = await getState(page);
  expect(s.paused).toBe(true);
  await expect(page.locator('#status')).toHaveText('Paused');

  await advanceFrames(page, 60);
  s = await getState(page);
  expect(s.paused).toBe(true);
  expect(s.current.y).toBe(3);
  expect(s.gravityTick).toBe(0);
  expect(s.frame).toBe(state.frame);
});

test('pausing during an active piece freezes gravity and gameplay input', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);
  await setState(page, {
    ...state,
    current: { type: 'T', index: 3, x: 4, y: 3, rotation: 0 },
    gravityFrames: 4,
    gravityTick: 0,
    lockTimer: 0
  });

  await page.keyboard.press('Escape');
  let s = await getState(page);
  expect(s.paused).toBe(true);

  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Space');
  await advanceFrames(page, 20);
  s = await getState(page);
  expect(s.current).toEqual({ type: 'T', index: 3, x: 4, y: 3, rotation: 0 });
});

test('pressing P again resumes the game and gravity continues', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);
  await setState(page, {
    ...state,
    current: { type: 'T', index: 3, x: 4, y: 3, rotation: 0 },
    gravityFrames: 4,
    gravityTick: 0,
    lockTimer: 0
  });

  await page.keyboard.press('p');
  await advanceFrames(page, 20);
  let s = await getState(page);
  expect(s.current.y).toBe(3);

  await page.keyboard.press('p');
  s = await getState(page);
  expect(s.paused).toBe(false);

  await advanceFrames(page, 4);
  s = await getState(page);
  expect(s.current.y).toBe(4);
});

test('pause button toggles pause and flips its label', async ({ page }) => {
  await openGame(page);
  const pauseBtn = page.locator('#pause');
  await expect(pauseBtn).toHaveText('Pause');
  await expect(pauseBtn).toHaveAttribute('aria-pressed', 'false');

  await pauseBtn.click();
  let s = await getState(page);
  expect(s.paused).toBe(true);
  await expect(pauseBtn).toHaveText('Resume');
  await expect(pauseBtn).toHaveAttribute('aria-pressed', 'true');

  await pauseBtn.click();
  s = await getState(page);
  expect(s.paused).toBe(false);
  await expect(pauseBtn).toHaveText('Pause');
  await expect(pauseBtn).toHaveAttribute('aria-pressed', 'false');
});

test('pressing R while paused restarts the game unpaused', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);
  await setState(page, { ...state, score: 700, lines: 12, level: 2 });

  await page.keyboard.press('p');
  let s = await getState(page);
  expect(s.paused).toBe(true);

  await page.keyboard.press('r');
  s = await getState(page);
  expect(s.paused).toBe(false);
  expect(s.score).toBe(0);
  expect(s.lines).toBe(0);
  expect(s.level).toBe(1);

  await advanceFrames(page, 1);
  s = await getState(page);
  expect(s.frame).toBe(1);
});

test('matches the desktop layout baseline', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGame(page, { keepNaturalSize: true });
  await prepareVisualLayout(page);

  await expect(page).toHaveScreenshot('tetris-desktop-layout.png', {
    animations: 'disabled',
    fullPage: false,
    maxDiffPixels: 10
  });
});

test.describe('mobile touch controls', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true
  });

  test('is full-screen and gesture-only in portrait (no pad deck)', async ({ page }) => {
    await openGame(page);
    expectPortraitErgonomics(await getPortraitLayout(page));

    // No pad-deck control buttons exist on the mobile surface.
    expect(await page.locator('.control-deck').count()).toBe(0);
    expect(await page.locator('[data-action="left"]').count()).toBe(0);

    // Restart stays a styled glass icon button in the top bar.
    const restartStyles = await page.locator('#restart').evaluate((el) => {
      const s = window.getComputedStyle(el);
      return { backgroundColor: s.backgroundColor, borderWidth: s.borderTopWidth };
    });
    expect(restartStyles.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(parseFloat(restartStyles.borderWidth)).toBeGreaterThan(0);
  });

  test('fits a shorter portrait screen with the board still full-screen', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await openGame(page);
    expectPortraitErgonomics(await getPortraitLayout(page));
  });

  test('touch hold button saves and swaps pieces', async ({ page }) => {
    await openGame(page);
    const initial = await getState(page);
    expect(initial.heldPiece).toBeNull();
    const firstType = initial.current.type;

    // First hold: saves current piece and spawns next
    const holdEl = page.locator('[data-action="hold"]');
    await holdEl.dispatchEvent('pointerdown');
    await holdEl.dispatchEvent('pointerup');
    const afterFirst = await getState(page);
    expect(afterFirst.heldPiece).toBe(firstType);
    expect(afterFirst.holdUsed).toBe(true);

    // Hard-drop the new piece to get a fresh spawn with holdUsed reset.
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.keyboard.press('Space');
    await advanceFrames(page, 3);
    const fresh = await getState(page);
    expect(fresh.holdUsed).toBe(false);

    // Second hold: swaps held piece with current piece
    const heldBefore = fresh.heldPiece;
    const currentBefore = fresh.current.type;
    await holdEl.dispatchEvent('pointerdown');
    await holdEl.dispatchEvent('pointerup');
    const afterSwap = await getState(page);
    expect(afterSwap.heldPiece).toBe(currentBefore);
    expect(afterSwap.current.type).toBe(heldBefore);
  });

  test('matches the portrait layout baseline', async ({ page }) => {
    await openGame(page, { keepNaturalSize: true });
    await prepareVisualLayout(page);

    const layout = await getPortraitLayout(page);
    expectPortraitErgonomics(layout);

    await expect(page).toHaveScreenshot('tetris-portrait-layout.png', {
      animations: 'disabled',
      fullPage: false,
      maxDiffPixels: 10
    });
  });
});

test.describe('board touch gestures', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true
  });

  // Dispatch a synthetic PointerEvent on the board at board-local (x, y) CSS pixels.
  async function boardPointer(page, type, x, y) {
    await page.evaluate(({ type, x, y }) => {
      const canvas = document.getElementById('game');
      const rect = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new PointerEvent(type, {
        clientX: rect.left + x,
        clientY: rect.top + y,
        pointerId: 1,
        bubbles: true
      }));
    }, { type, x, y });
  }

  async function placePiece(page, piece, extra = {}) {
    const state = await getState(page);
    await setState(page, {
      ...state,
      board: Array.from({ length: 20 }, () => Array(10).fill(0)),
      current: piece,
      score: 0, lines: 0, level: 1,
      gravityTick: 0, gravityFrames: 48, lockTimer: 0,
      heldPiece: null, holdUsed: false,
      ...extra
    });
  }

  test('tap rotates the active piece clockwise', async ({ page }) => {
    await openGame(page);
    await placePiece(page, { type: 'T', index: 3, x: 4, y: 4, rotation: 0 });

    await boardPointer(page, 'pointerdown', 150, 150);
    await boardPointer(page, 'pointerup', 151, 151);

    const after = await getState(page);
    expect(after.current.rotation).toBe(1);
    expect(after.current.x).toBe(4); // a tap must not nudge the piece sideways
  });

  test('horizontal drag moves one cell per cell-width dragged', async ({ page }) => {
    await openGame(page);
    await placePiece(page, { type: 'T', index: 3, x: 4, y: 4, rotation: 0 });
    // Drag in real cell-widths so the test is robust to the responsive board size.
    const { cellSize } = await page.evaluate(() => window.__tetrisTest.getBoardSize());
    const startX = cellSize * 2;

    // Drag right by two cell-widths.
    await boardPointer(page, 'pointerdown', startX, 150);
    await boardPointer(page, 'pointermove', startX + cellSize * 2, 150);
    await boardPointer(page, 'pointerup', startX + cellSize * 2, 150);

    const right = await getState(page);
    expect(right.current.x).toBe(6);
    expect(right.current.rotation).toBe(0); // a move gesture must not also rotate

    // Drag back left by three cell-widths.
    await boardPointer(page, 'pointerdown', startX + cellSize * 5, 150);
    await boardPointer(page, 'pointermove', startX + cellSize * 2, 150);
    await boardPointer(page, 'pointerup', startX + cellSize * 2, 150);

    const left = await getState(page);
    expect(left.current.x).toBe(3);
  });

  test('downward flick hard drops the piece', async ({ page }) => {
    await openGame(page);
    await placePiece(page, { type: 'O', index: 2, x: 4, y: 0, rotation: 0 });

    // A fast, long downward motion released quickly registers as a hard drop.
    await boardPointer(page, 'pointerdown', 150, 40);
    await boardPointer(page, 'pointermove', 150, 130);
    await boardPointer(page, 'pointerup', 150, 130);

    const after = await getState(page);
    // O-piece slammed to the floor (rows 18-19) and a new piece spawned.
    expect(after.board[18][4]).toBeGreaterThan(0);
    expect(after.board[19][4]).toBeGreaterThan(0);
    expect(after.score).toBeGreaterThan(0);
  });

  test('slow downward drag soft drops without slamming to the floor', async ({ page }) => {
    await openGame(page);
    await placePiece(page, { type: 'O', index: 2, x: 4, y: 0, rotation: 0 });

    await boardPointer(page, 'pointerdown', 150, 40);
    await boardPointer(page, 'pointermove', 150, 130); // ~3 cells of soft drop
    // Hold past the hard-drop flick window so release stays a soft drop.
    await page.waitForTimeout(320);
    await boardPointer(page, 'pointerup', 150, 130);

    const after = await getState(page);
    expect(after.current).not.toBeNull();
    expect(after.current.y).toBeGreaterThan(0);
    expect(after.current.y).toBeLessThan(10); // did not reach the floor
  });

  test('swipe up holds the active piece', async ({ page }) => {
    await openGame(page);
    await placePiece(page, { type: 'T', index: 3, x: 4, y: 8, rotation: 0 });

    await boardPointer(page, 'pointerdown', 150, 300);
    await boardPointer(page, 'pointermove', 150, 250);
    await boardPointer(page, 'pointerup', 150, 250);

    const after = await getState(page);
    expect(after.heldPiece).toBe('T');
    expect(after.holdUsed).toBe(true);
  });

  test('tap after game over restarts the game', async ({ page }) => {
    await openGame(page);
    const state = await getState(page);
    await setState(page, { ...state, gameOver: true, score: 500, lines: 8, level: 2 });

    await boardPointer(page, 'pointerdown', 150, 300);
    await boardPointer(page, 'pointerup', 150, 300);

    const after = await getState(page);
    expect(after.gameOver).toBe(false);
    expect(after.score).toBe(0);
    expect(after.lines).toBe(0);
  });

  test('board gestures are ignored while paused', async ({ page }) => {
    await openGame(page);
    await placePiece(page, { type: 'T', index: 3, x: 4, y: 4, rotation: 0 });
    await page.keyboard.press('p');

    await boardPointer(page, 'pointerdown', 60, 150);
    await boardPointer(page, 'pointermove', 200, 150);
    await boardPointer(page, 'pointerup', 200, 150);

    const after = await getState(page);
    expect(after.paused).toBe(true);
    expect(after.current.x).toBe(4); // untouched while paused
  });
});

test.describe('responsive layout screenshots', () => {
  test('matches the tablet landscape layout baseline', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await openGame(page, { keepNaturalSize: true });
    await prepareVisualLayout(page);

    await expect(page).toHaveScreenshot('tetris-tablet-landscape-layout.png', {
      animations: 'disabled',
      fullPage: false,
      maxDiffPixels: 10
    });
  });

  test('matches the tablet portrait layout baseline', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await openGame(page, { keepNaturalSize: true });
    await prepareVisualLayout(page);

    await expect(page).toHaveScreenshot('tetris-tablet-portrait-layout.png', {
      animations: 'disabled',
      fullPage: false,
      maxDiffPixels: 10
    });
  });

  test.describe('small portrait', () => {
    test.use({
      viewport: { width: 360, height: 740 },
      hasTouch: true,
      isMobile: true
    });

    test('matches the small portrait layout baseline', async ({ page }) => {
      await openGame(page, { keepNaturalSize: true });
      await prepareVisualLayout(page);

      await expect(page).toHaveScreenshot('tetris-small-portrait-layout.png', {
        animations: 'disabled',
        fullPage: false,
        maxDiffPixels: 10
      });
    });
  });
});

test.describe('how to play help', () => {
  // openGame navigates twice (goto + reload), so clear the seen flag for the
  // first two page loads only; later loads keep whatever the page has set.
  async function clearHelpSeenOnce(page) {
    await page.addInitScript(() => {
      try {
        const remaining = Number(localStorage.getItem('tetris-help-clear-count') ?? '2');
        if (remaining > 0) {
          localStorage.removeItem('tetris-help-seen');
          localStorage.setItem('tetris-help-clear-count', String(remaining - 1));
        }
      } catch {}
    });
  }

  test('first visit shows the help panel and pauses the game', async ({ page }) => {
    await clearHelpSeenOnce(page);
    await openGame(page, { keepNaturalSize: true });

    await expect(page.locator('#help-overlay')).toBeVisible();
    const s = await getState(page);
    expect(s.helpOpen).toBe(true);
    expect(s.paused).toBe(true);
  });

  test('dismissing help sets the seen flag, unpauses, and stays hidden after reload', async ({ page }) => {
    await clearHelpSeenOnce(page);
    await openGame(page, { keepNaturalSize: true });
    await expect(page.locator('#help-overlay')).toBeVisible();

    await page.locator('#help-close').click();
    await expect(page.locator('#help-overlay')).toBeHidden();
    let s = await getState(page);
    expect(s.helpOpen).toBe(false);
    expect(s.paused).toBe(false);
    const flag = await page.evaluate(() => localStorage.getItem('tetris-help-seen'));
    expect(flag).toBe('1');

    await openGame(page, { keepNaturalSize: true });
    await expect(page.locator('#help-overlay')).toBeHidden();
    s = await getState(page);
    expect(s.helpOpen).toBe(false);
  });

  test('help button reopens the panel and Escape closes it without pausing the game', async ({ page }) => {
    await openGame(page, { keepNaturalSize: true });
    await expect(page.locator('#help-overlay')).toBeHidden();

    await page.locator('#help').click();
    let s = await getState(page);
    expect(s.helpOpen).toBe(true);
    expect(s.paused).toBe(true);
    await expect(page.locator('#help-close')).toBeFocused();

    await page.keyboard.press('Escape');
    s = await getState(page);
    expect(s.helpOpen).toBe(false);
    expect(s.paused).toBe(false);
    await expect(page.locator('#help')).toBeFocused();
  });

  test('closing help keeps a manually paused game paused', async ({ page }) => {
    await openGame(page, { keepNaturalSize: true });
    await page.keyboard.press('p');
    let s = await getState(page);
    expect(s.paused).toBe(true);

    await page.locator('#help').click();
    s = await getState(page);
    expect(s.helpOpen).toBe(true);

    await page.locator('#help-close').click();
    s = await getState(page);
    expect(s.helpOpen).toBe(false);
    expect(s.paused).toBe(true);
  });
});

test.describe('sound and mute', () => {
  test('mute button toggles aria-pressed and persists tetris-muted across reload', async ({ page }) => {
    await openGame(page);
    const muteBtn = page.locator('#mute');
    await expect(muteBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(muteBtn).toHaveAttribute('data-muted', 'false');

    await muteBtn.click();
    await expect(muteBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(muteBtn).toHaveAttribute('data-muted', 'true');
    let stored = await page.evaluate(() => localStorage.getItem('tetris-muted'));
    expect(stored).toBe('1');

    await openGame(page);
    await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'true');
    let s = await getState(page);
    expect(s.muted).toBe(true);

    await page.locator('#mute').click();
    await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'false');
    stored = await page.evaluate(() => localStorage.getItem('tetris-muted'));
    expect(stored).toBe('0');
  });

  test('muted state is exposed via getState and setMuted updates it', async ({ page }) => {
    await openGame(page);
    let s = await getState(page);
    expect(s.muted).toBe(false);

    await page.evaluate(() => window.__tetrisTest.setMuted(true));
    s = await getState(page);
    expect(s.muted).toBe(true);
    await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'true');

    await page.evaluate(() => window.__tetrisTest.setMuted(false));
    s = await getState(page);
    expect(s.muted).toBe(false);
  });

  test('rotating, hard dropping, clearing a line, holding, and game over run cleanly with sound wired', async ({ page }) => {
    await openGame(page);
    const state = await getState(page);
    const board = state.board.map((row) => row.slice());
    for (let x = 0; x < 10; x += 1) board[19][x] = 1;
    board[19][3] = 0;
    board[19][4] = 0;
    board[19][5] = 0;
    board[19][6] = 0;
    state.board = board;
    state.current = { type: 'I', index: 1, x: 4, y: 17, rotation: 0 };
    state.score = 0;
    state.lines = 0;
    state.level = 1;
    state.gameOver = false;
    await setState(page, state);

    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('z');
    await page.keyboard.press('Space');
    await advanceFrames(page, 18);
    let s = await getState(page);
    expect(s.lines).toBe(1);
    expect(s.clearAnimation).toBeNull();

    await page.keyboard.press('c');
    s = await getState(page);
    expect(s.heldPiece).not.toBeNull();

    const over = await getState(page);
    const blockedBoard = over.board.map((row) => row.slice());
    blockedBoard[0][4] = 2;
    blockedBoard[0][5] = 2;
    blockedBoard[1][4] = 2;
    blockedBoard[1][5] = 2;
    over.board = blockedBoard;
    over.current = { type: 'I', index: 1, x: 4, y: 17, rotation: 0 };
    await setState(page, over);
    await page.keyboard.press('Space');
    await advanceFrames(page, 1);
    s = await getState(page);
    expect(s.gameOver).toBe(true);
  });
});
