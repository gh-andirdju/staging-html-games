import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const runtimeErrors = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      runtimeErrors.push(message.text());
    }
  });

  page.on('pageerror', (error) => {
    runtimeErrors.push(error.message);
  });

  page.__runtimeErrors = runtimeErrors;
});

test.afterEach(async ({ page }) => {
  expect(page.__runtimeErrors).toEqual([]);
});

async function openGame(page) {
  await page.goto('./');
  await page.waitForFunction(() => {
    const api = window.__sokobanTest;
    return (
      api &&
      api.isReady === true &&
      typeof api.getState === 'function' &&
      typeof api.setState === 'function' &&
      typeof api.advanceFrames === 'function' &&
      typeof api.restart === 'function' &&
      typeof api.setAutoStep === 'function'
    );
  });
  await page.evaluate(() => window.__sokobanTest.setAutoStep(false));
  await expect(page.locator('canvas')).toBeVisible();
}

async function getState(page) {
  return page.evaluate(() => window.__sokobanTest.getState());
}

async function setState(page, next) {
  await page.evaluate((payload) => window.__sokobanTest.setState(payload), next);
}

async function advanceFrames(page, n) {
  await page.evaluate(async (count) => {
    await window.__sokobanTest.advanceFrames(count);
  }, n);
}

// Sets up a deterministic visual state for screenshot tests (level 0, clean state)
async function prepareVisualLayout(page) {
  await page.evaluate(() => window.__sokobanTest.restart());
  await page.locator('canvas').scrollIntoViewIfNeeded();
}

// Minimal 5×3 board: player @ col 1, box $ col 2, target . col 3
// Push right once to win.
function simpleLevel() {
  return {
    board: [
      ['#', '#', '#', '#', '#'],
      ['#', ' ', ' ', '.', '#'],
      ['#', '#', '#', '#', '#'],
    ],
    playerPos: { row: 1, col: 1 },
    boxes: [{ row: 1, col: 2 }],
    targets: [{ row: 1, col: 3 }],
    moves: 0,
    pushes: 0,
    status: 'playing',
    history: [],
    level: 0,
  };
}

test('renders and exposes ready test API', async ({ page }) => {
  await openGame(page);

  const pixelCount = await page.locator('canvas').evaluate((canvas) => {
    const ctx = canvas.getContext('2d');
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let colored = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] || pixels[i + 1] || pixels[i + 2] || pixels[i + 3]) colored++;
    }
    return colored;
  });

  expect(pixelCount).toBeGreaterThan(500);
});

test('arrow keys move the player', async ({ page }) => {
  await openGame(page);
  const before = await getState(page);

  await page.keyboard.press('ArrowDown');

  const after = await getState(page);
  expect(after.playerPos.row).toBeGreaterThan(before.playerPos.row);
  expect(after.moves).toBe(before.moves + 1);
});

test('player cannot walk through walls', async ({ page }) => {
  await openGame(page);
  // Level 0: player starts at row=1, col=2; row=0 is all walls
  const before = await getState(page);

  // Move up into the wall
  await page.keyboard.press('ArrowUp');

  const after = await getState(page);
  expect(after.playerPos).toEqual(before.playerPos);
  expect(after.moves).toBe(before.moves);
});

test('player pushes a box one step in push direction', async ({ page }) => {
  await openGame(page);
  await setState(page, simpleLevel());

  // Player at (1,1), box at (1,2) — push right
  await page.keyboard.press('ArrowRight');

  const after = await getState(page);
  expect(after.playerPos).toEqual({ row: 1, col: 2 });
  expect(after.boxes[0]).toEqual({ row: 1, col: 3 });
  expect(after.pushes).toBe(1);
});

test('player cannot push a box into a wall', async ({ page }) => {
  await openGame(page);
  // Board: col 1 is a wall so pushing box left from col 2 hits it
  await setState(page, {
    board: [
      ['#', '#', '#', '#', '#', '#'],
      ['#', '#', ' ', ' ', '.', '#'],
      ['#', '#', '#', '#', '#', '#'],
    ],
    playerPos: { row: 1, col: 3 },
    boxes: [{ row: 1, col: 2 }],
    targets: [{ row: 1, col: 4 }],
    moves: 0,
    pushes: 0,
    status: 'playing',
    history: [],
    level: 0,
  });

  // Push left: box at (1,2) would go to (1,1)='#' — blocked
  await page.keyboard.press('ArrowLeft');

  const after = await getState(page);
  expect(after.boxes[0]).toEqual({ row: 1, col: 2 });
  expect(after.playerPos).toEqual({ row: 1, col: 3 });
});

test('player cannot push two adjacent boxes', async ({ page }) => {
  await openGame(page);
  await setState(page, {
    board: [
      ['#', '#', '#', '#', '#', '#'],
      ['#', ' ', ' ', ' ', ' ', '#'],
      ['#', '#', '#', '#', '#', '#'],
    ],
    playerPos: { row: 1, col: 1 },
    boxes: [{ row: 1, col: 2 }, { row: 1, col: 3 }],
    targets: [{ row: 1, col: 4 }],
    moves: 0,
    pushes: 0,
    status: 'playing',
    history: [],
    level: 0,
  });

  // Push right: first box would push second box — not allowed
  await page.keyboard.press('ArrowRight');

  const after = await getState(page);
  expect(after.boxes[0]).toEqual({ row: 1, col: 2 });
  expect(after.boxes[1]).toEqual({ row: 1, col: 3 });
  expect(after.playerPos).toEqual({ row: 1, col: 1 });
});

test('undo restores player and box positions', async ({ page }) => {
  await openGame(page);
  // Target at col 4 — one push to col 3 does NOT win, so undo stays enabled
  await setState(page, {
    board: [
      ['#', '#', '#', '#', '#', '#'],
      ['#', ' ', ' ', ' ', '.', '#'],
      ['#', '#', '#', '#', '#', '#'],
    ],
    playerPos: { row: 1, col: 1 },
    boxes: [{ row: 1, col: 2 }],
    targets: [{ row: 1, col: 4 }],
    moves: 0,
    pushes: 0,
    status: 'playing',
    history: [],
    level: 0,
  });
  const before = await getState(page);

  await page.keyboard.press('ArrowRight'); // push box from col 2 to col 3 (not target)
  const afterPush = await getState(page);
  expect(afterPush.moves).toBe(1);
  expect(afterPush.status).toBe('playing');

  await page.keyboard.press('z'); // undo
  const afterUndo = await getState(page);

  expect(afterUndo.playerPos).toEqual(before.playerPos);
  expect(afterUndo.boxes[0]).toEqual(before.boxes[0]);
  expect(afterUndo.moves).toBe(0);
  expect(afterUndo.pushes).toBe(0);
});

test('moves counter increments per move', async ({ page }) => {
  await openGame(page);
  // Level 0: player at (1,2); right is open floor, no box
  const s0 = await getState(page);

  await page.keyboard.press('ArrowRight'); // plain walk to (1,3)
  const s1 = await getState(page);
  expect(s1.moves).toBe(s0.moves + 1);

  await page.keyboard.press('ArrowDown'); // plain walk from (1,3) to (2,3)
  const s2 = await getState(page);
  expect(s2.moves).toBe(s0.moves + 2);
});

test('pushes counter increments only when a box is pushed', async ({ page }) => {
  await openGame(page);
  // simpleLevel: player (1,1), box (1,2), open right
  await setState(page, simpleLevel());

  // Plain walk: no push
  // Move player left (wall) — no move
  // Move player right — this pushes the box
  await page.keyboard.press('ArrowRight');
  const s1 = await getState(page);
  expect(s1.pushes).toBe(1);
  expect(s1.moves).toBe(1);

  // Now player is at (1,2), box at (1,3)=target, status=won
  // Can't move in won state. Let's verify moves won't increment
  await page.keyboard.press('ArrowLeft');
  const s2 = await getState(page);
  expect(s2.pushes).toBe(1); // no extra push
});

test('placing all boxes on targets sets status to won', async ({ page }) => {
  await openGame(page);
  await setState(page, simpleLevel());

  await page.keyboard.press('ArrowRight');

  const after = await getState(page);
  expect(after.status).toBe('won');
});

test('level advances automatically after win', async ({ page }) => {
  await openGame(page);
  await setState(page, simpleLevel());

  // Win the level
  await page.keyboard.press('ArrowRight');
  const won = await getState(page);
  expect(won.status).toBe('won');

  // Advance 91 frames to trigger level change
  await advanceFrames(page, 91);

  const after = await getState(page);
  // Level should have incremented (or looped if simpleLevel.level was last)
  // simpleLevel uses level:0, next = level 1
  expect(after.level).toBe(1);
  expect(after.status).toBe('playing');
});

test('every pre-defined level has no statically trapped boxes', async ({ page }) => {
  await openGame(page);

  const LEVEL_COUNT = 26;

  for (let levelIdx = 0; levelIdx < LEVEL_COUNT; levelIdx++) {
    await page.evaluate(async (idx) => {
      window.__sokobanTest.setState({ level: idx });
      await window.__sokobanTest.restart();
    }, levelIdx);

    const deadlockedBoxes = await page.evaluate(() => {
      const { board, boxes, targets } = window.__sokobanTest.getState();
      const numRows = board.length;
      const numCols = board[0].length;
      const trapped = [];

      for (const box of boxes) {
        const visited = new Set();
        const queue = [[box.row, box.col]];
        visited.add(`${box.row},${box.col}`);

        while (queue.length > 0) {
          const [r, c] = queue.shift();
          for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const nr = r + dr, nc = c + dc;
            const pr = r - dr, pc = c - dc;
            if (nr < 0 || nr >= numRows || nc < 0 || nc >= numCols) continue;
            if (board[nr][nc] === '#') continue;
            if (pr < 0 || pr >= numRows || pc < 0 || pc >= numCols) continue;
            if (board[pr][pc] === '#') continue;
            const key = `${nr},${nc}`;
            if (!visited.has(key)) {
              visited.add(key);
              queue.push([nr, nc]);
            }
          }
        }

        if (!targets.some(t => visited.has(`${t.row},${t.col}`))) {
          trapped.push({ row: box.row, col: box.col });
        }
      }

      return trapped;
    });

    expect(
      deadlockedBoxes,
      `Level ${levelIdx}: boxes at ${JSON.stringify(deadlockedBoxes)} cannot reach any target`
    ).toHaveLength(0);
  }
});

test('desktop layout matches screenshot', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1024 });
  await openGame(page);
  await prepareVisualLayout(page);

  await expect(page).toHaveScreenshot('sokoban-desktop-layout.png', {
    animations: 'disabled',
    fullPage: false,
    maxDiffPixels: 10,
  });
});

test('portrait layout matches screenshot', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openGame(page);
  await prepareVisualLayout(page);

  await expect(page).toHaveScreenshot('sokoban-portrait-layout.png', {
    animations: 'disabled',
    fullPage: false,
    maxDiffPixels: 10,
  });
});
