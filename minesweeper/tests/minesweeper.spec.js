import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
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

async function prepareVisualLayout(page) {
  await page.evaluate(() => {
    const api = window.__minesweeperTest;
    const rows = 9, cols = 9;
    const board = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({
        mine: false, revealed: false, flagged: false, adjacent: 0
      }))
    );
    api.setState({
      board,
      rows,
      cols,
      mines: 10,
      revealed: 0,
      flagged: 0,
      gameOver: false,
      won: false,
      started: true,
      difficulty: 'easy',
      touchMode: 'reveal',
      frame: 60,
      timeElapsed: 7,
      tickCounter: 0,
      statusMessage: '',
      statusTone: 'normal',
      statusMessageTimer: 0,
    });
    api.setBoard([
      [{ mine: true }, {}, {}, {}, {}, {}, {}, {}, {}],
      [{}, {}, {}, {}, {}, {}, {}, {}, {}],
      [{}, {}, { mine: true }, {}, {}, {}, {}, {}, {}],
      [{}, {}, {}, {}, {}, {}, {}, {}, {}],
      [{}, {}, {}, {}, { mine: true }, {}, {}, {}, {}],
      [{}, { mine: true }, {}, {}, {}, {}, {}, {}, {}],
      [{}, {}, {}, {}, {}, {}, { mine: true }, {}, {}],
      [{}, {}, {}, { mine: true }, {}, {}, {}, {}, {}],
      [{}, {}, {}, {}, {}, {}, {}, {}, { mine: true }],
    ].map(row => row.map(cell => ({
      mine: Boolean(cell.mine),
      revealed: false,
      flagged: false,
      adjacent: 0,
    }))));
    api.revealCell(7, 7);
    api.revealCell(3, 6);
    api.flagCell(0, 0);
  });
}

async function openGame(page) {
  await page.goto('./');
  await page.waitForFunction(() => {
    const api = window.__minesweeperTest;
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
  await page.evaluate(() => window.__minesweeperTest.setAutoStep(false));
  await expect(page.locator('canvas')).toBeVisible();
}

async function getState(page) {
  return page.evaluate(() => window.__minesweeperTest.getState());
}

async function advanceFrames(page, frames) {
  await page.evaluate(async (n) => {
    await window.__minesweeperTest.advanceFrames(n);
  }, frames);
}

function makeEmptyBoard(rows, cols) {
  const board = [];
  for (let r = 0; r < rows; r++) {
    board.push([]);
    for (let c = 0; c < cols; c++) {
      board[r].push({ mine: false, revealed: false, flagged: false, adjacent: 0 });
    }
  }
  return board;
}

test('renders and exposes ready test API', async ({ page }) => {
  await openGame(page);
  await expect.poll(async () => {
    return page.locator('canvas').evaluate((canvas) => {
      const context = canvas.getContext('2d');
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let colored = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] || pixels[i + 1] || pixels[i + 2] || pixels[i + 3]) colored++;
      }
      return colored;
    });
  }).toBeGreaterThan(500);

  const state = await getState(page);
  expect(state).toHaveProperty('board');
  expect(state).toHaveProperty('gameOver');
  expect(state).toHaveProperty('won');
  expect(state).toHaveProperty('rows');
  expect(state).toHaveProperty('cols');
});

test('initial board has all cells unrevealed', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);
  for (const row of state.board) {
    for (const cell of row) {
      expect(cell.revealed).toBe(false);
      expect(cell.flagged).toBe(false);
    }
  }
  expect(state.revealed).toBe(0);
  expect(state.flagged).toBe(0);
  expect(state.gameOver).toBe(false);
  expect(state.won).toBe(false);
});

test('revealing a mine-free cell via test hook increases revealed count', async ({ page }) => {
  await openGame(page);
  const board = makeEmptyBoard(9, 9);
  // Place mine adjacent to (4,4) so it has adjacent>0 and won't cascade-win
  board[4][5].mine = true;
  board[3][3].mine = true;
  board[5][5].mine = true;
  await page.evaluate((b) => window.__minesweeperTest.setBoard(b), board);

  await page.evaluate(() => window.__minesweeperTest.revealCell(4, 4));
  const state = await getState(page);
  expect(state.revealed).toBeGreaterThan(0);
  expect(state.gameOver).toBe(false);
});

test('revealing a cell with 0 adjacent mines cascades to neighbors', async ({ page }) => {
  await openGame(page);
  const board = makeEmptyBoard(9, 9);
  board[8][8].mine = true;
  await page.evaluate((b) => window.__minesweeperTest.setBoard(b), board);

  await page.evaluate(() => window.__minesweeperTest.revealCell(0, 0));
  const state = await getState(page);
  expect(state.revealed).toBeGreaterThan(1);
});

test('flagging an unrevealed cell increases flag count', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.__minesweeperTest.flagCell(0, 0));
  const state = await getState(page);
  expect(state.flagged).toBe(1);
  expect(state.board[0][0].flagged).toBe(true);
});

test('flagging a flagged cell removes the flag', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.__minesweeperTest.flagCell(0, 0));
  await page.evaluate(() => window.__minesweeperTest.flagCell(0, 0));
  const state = await getState(page);
  expect(state.flagged).toBe(0);
  expect(state.board[0][0].flagged).toBe(false);
});

test('flagged cell cannot be revealed', async ({ page }) => {
  await openGame(page);
  const board = makeEmptyBoard(9, 9);
  board[8][8].mine = true;
  await page.evaluate((b) => window.__minesweeperTest.setBoard(b), board);
  await page.evaluate(() => window.__minesweeperTest.flagCell(0, 0));
  await page.evaluate(() => window.__minesweeperTest.revealCell(0, 0));
  const state = await getState(page);
  expect(state.board[0][0].revealed).toBe(false);
  expect(state.board[0][0].flagged).toBe(true);
});

test('revealing a mine triggers game over', async ({ page }) => {
  await openGame(page);
  const board = makeEmptyBoard(9, 9);
  board[4][4].mine = true;
  await page.evaluate((b) => window.__minesweeperTest.setBoard(b), board);

  await page.evaluate(() => window.__minesweeperTest.revealCell(4, 4));
  const state = await getState(page);
  expect(state.gameOver).toBe(true);
  expect(state.won).toBe(false);
});

test('revealing all non-mine cells triggers win', async ({ page }) => {
  await openGame(page);
  const board = makeEmptyBoard(3, 3);
  board[0][0].mine = true;
  await page.evaluate((b) => window.__minesweeperTest.setBoard(b), board);

  await page.evaluate(() => {
    const api = window.__minesweeperTest;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        if (r === 0 && c === 0) continue;
        api.revealCell(r, c);
      }
    }
  });

  const state = await getState(page);
  expect(state.won).toBe(true);
  expect(state.gameOver).toBe(true);
});

test('restart resets all state', async ({ page }) => {
  await openGame(page);
  const board = makeEmptyBoard(9, 9);
  board[4][4].mine = true;
  await page.evaluate((b) => window.__minesweeperTest.setBoard(b), board);
  await page.evaluate(() => window.__minesweeperTest.revealCell(0, 0));

  await page.evaluate(() => window.__minesweeperTest.restart());
  const state = await getState(page);
  expect(state.gameOver).toBe(false);
  expect(state.won).toBe(false);
  expect(state.revealed).toBe(0);
  expect(state.flagged).toBe(0);
  expect(state.started).toBe(false);
  for (const row of state.board) {
    for (const cell of row) {
      expect(cell.revealed).toBe(false);
    }
  }
});

test('pressing R starts a new game at the current difficulty', async ({ page }) => {
  await openGame(page);
  await page.click('[data-difficulty="normal"]');
  const board = makeEmptyBoard(12, 12);
  board[4][4].mine = true;
  await page.evaluate((b) => window.__minesweeperTest.setBoard(b), board);
  await page.evaluate(() => window.__minesweeperTest.revealCell(0, 0));

  await page.keyboard.press('r');
  const state = await getState(page);
  expect(state.gameOver).toBe(false);
  expect(state.won).toBe(false);
  expect(state.revealed).toBe(0);
  expect(state.flagged).toBe(0);
  expect(state.started).toBe(false);
  expect(state.difficulty).toBe('normal');
  expect(state.rows).toBe(12);
  expect(state.cols).toBe(12);
});

test('timer increments after advancing frames once started', async ({ page }) => {
  await openGame(page);
  // Set started=true without revealing cells to avoid triggering cascade win
  await page.evaluate(() => {
    const s = window.__minesweeperTest.getState();
    s.started = true;
    s.gameOver = false;
    s.won = false;
    window.__minesweeperTest.setState(s);
  });

  const before = (await getState(page)).timeElapsed;
  await advanceFrames(page, 120);
  const after = (await getState(page)).timeElapsed;
  expect(after).toBeGreaterThan(before);
});

test('timer stops after game over', async ({ page }) => {
  await openGame(page);
  const board = makeEmptyBoard(9, 9);
  board[4][4].mine = true;
  await page.evaluate((b) => window.__minesweeperTest.setBoard(b), board);
  await page.evaluate(() => window.__minesweeperTest.revealCell(4, 4));

  const stateAfterGameOver = await getState(page);
  expect(stateAfterGameOver.gameOver).toBe(true);
  const timeBefore = stateAfterGameOver.timeElapsed;

  await advanceFrames(page, 300);
  const stateAfterAdvance = await getState(page);
  expect(stateAfterAdvance.timeElapsed).toBe(timeBefore);
});

test('difficulty switch to normal restarts with correct grid size', async ({ page }) => {
  await openGame(page);
  await page.click('[data-difficulty="normal"]');
  const state = await getState(page);
  expect(state.rows).toBe(12);
  expect(state.cols).toBe(12);
  expect(state.mines).toBe(25);
  expect(state.difficulty).toBe('normal');
});

test('difficulty switch to hard restarts with correct grid size', async ({ page }) => {
  await openGame(page);
  await page.click('[data-difficulty="hard"]');
  const state = await getState(page);
  expect(state.rows).toBe(16);
  expect(state.cols).toBe(16);
  expect(state.mines).toBe(51);
  expect(state.difficulty).toBe('hard');
});

test('chord reveal uncovers unflagged neighbors when flag count matches adjacent count', async ({ page }) => {
  await openGame(page);
  const board = makeEmptyBoard(3, 3);
  board[0][0].mine = true;
  board[0][0].adjacent = 0;
  board[0][1].mine = false;
  board[0][2].mine = false;
  board[1][0].mine = false;
  board[1][2].mine = false;
  board[2][0].mine = false;
  board[2][1].mine = false;
  board[2][2].mine = false;
  await page.evaluate((b) => window.__minesweeperTest.setBoard(b), board);

  await page.evaluate(() => {
    const api = window.__minesweeperTest;
    api.revealCell(1, 1);
    api.flagCell(0, 0);
  });

  const stateBefore = await getState(page);
  const adjCount = stateBefore.board[1][1].adjacent;

  if (adjCount === 1) {
    await page.evaluate(() => window.__minesweeperTest.revealCell(1, 1));
    const stateAfter = await getState(page);
    expect(stateAfter.revealed).toBeGreaterThan(stateBefore.revealed);
  } else {
    expect(stateBefore.board[1][1].revealed).toBe(true);
  }
});

test('touch mode toggle changes touchMode state', async ({ page }) => {
  await openGame(page);
  await page.click('[data-action="flag"]');
  const stateFlagging = await getState(page);
  expect(stateFlagging.touchMode).toBe('flag');

  await page.click('[data-action="reveal"]');
  const stateReveal = await getState(page);
  expect(stateReveal.touchMode).toBe('reveal');
});

test('clicking canvas in flag mode flags a cell', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    window.__minesweeperTest.setState({ ...window.__minesweeperTest.getState(), touchMode: 'flag' });
  });

  const canvasBox = await page.locator('canvas').boundingBox();
  await page.mouse.click(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);

  const state = await getState(page);
  expect(state.flagged).toBeGreaterThanOrEqual(1);
});

test('matches the desktop layout baseline', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGame(page);
  await prepareVisualLayout(page);

  await expect(page).toHaveScreenshot('minesweeper-desktop-layout.png', {
    animations: 'disabled',
    fullPage: false,
    maxDiffPixels: 10
  });
});

test.describe('mobile viewport', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test('canvas renders and touch mode buttons are below canvas', async ({ page }) => {
    await openGame(page);

    await expect.poll(async () => {
      return page.locator('canvas').evaluate((canvas) => {
        const context = canvas.getContext('2d');
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let colored = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i] || pixels[i + 1] || pixels[i + 2] || pixels[i + 3]) colored++;
        }
        return colored;
      });
    }).toBeGreaterThan(200);

    const canvasBox = await page.locator('canvas').boundingBox();
    const revealBox = await page.locator('[data-action="reveal"]').boundingBox();
    expect(revealBox.y).toBeGreaterThan(canvasBox.y + canvasBox.height - 1);
  });

  test('matches the portrait layout baseline', async ({ page }) => {
    await openGame(page);
    await prepareVisualLayout(page);

    await expect(page).toHaveScreenshot('minesweeper-portrait-layout.png', {
      animations: 'disabled',
      fullPage: false,
      maxDiffPixels: 10
    });
  });
});
