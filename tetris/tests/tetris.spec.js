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

async function openGame(page) {
  await page.goto('/');
  await page.waitForFunction(() => {
    const api = window.__tetrisTest;
    return (
      api &&
      api.isReady === true &&
      (typeof api.getState === 'function' || typeof api.readState === 'function') &&
      typeof api.setState === 'function' &&
      typeof api.advanceFrames === 'function' &&
      typeof api.restart === 'function' &&
      typeof api.setAutoStep === 'function'
    );
  });
  await page.evaluate(() => window.__tetrisTest.setAutoStep(false));
  await expect(page.locator('canvas')).toBeVisible();
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

test('renders and exposes ready test API', async ({ page }) => {
  await openGame(page);
  await expect.poll(async () => {
    return page.locator('canvas').evaluate((canvas) => {
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

test('keyboard move rotate and hard drop work', async ({ page }) => {
  await openGame(page);
  const start = await getState(page);

  await page.keyboard.down('ArrowLeft');
  await advanceFrames(page, 4);
  await page.keyboard.up('ArrowLeft');
  const moved = await getState(page);
  expect(moved.current.x).toBeLessThan(start.current.x);

  const beforeRotate = moved.current.rotation;
  await page.keyboard.press('ArrowUp');
  const rotated = await getState(page);
  expect(rotated.current.rotation).not.toBe(beforeRotate);

  const yBeforeDrop = rotated.current.y;
  await page.keyboard.press('Space');
  const dropped = await getState(page);
  expect(dropped.current.y).toBeLessThanOrEqual(yBeforeDrop);
  expect(dropped.score).toBeGreaterThanOrEqual(rotated.score);
});

test('line clear increments lines and score', async ({ page }) => {
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
  state.gravityFrames = 48;
  state.gravityTick = 0;
  state.gameOver = false;
  await setState(page, state);

  await page.keyboard.press('Space');
  const after = await getState(page);
  expect(after.lines).toBeGreaterThan(0);
  expect(after.score).toBeGreaterThan(0);
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
  state.board = board;
  state.current = { type: 'I', index: 1, x: 4, y: 17, rotation: 0 };
  await setState(page, state);

  await page.keyboard.press('Space');
  const after = await getState(page);
  expect(after.level).toBeGreaterThan(1);
  expect(after.gravityFrames).toBeLessThan(48);
});

test('game over on spawn collision then restart recovers', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);
  const board = state.board.map((row) => row.slice());
  for (let y = 0; y < 3; y += 1) {
    for (let x = 0; x < 10; x += 1) board[y][x] = 2;
  }
  state.board = board;
  state.current = { type: 'O', index: 2, x: 4, y: 1, rotation: 0 };
  await setState(page, state);

  await page.keyboard.press('Space');
  const over = await getState(page);
  expect(over.gameOver).toBe(true);

  await page.keyboard.press('r');
  const restarted = await getState(page);
  expect(restarted.gameOver).toBe(false);
  expect(restarted.lines).toBe(0);
  expect(restarted.score).toBe(0);
});

test.describe('mobile touch controls', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true
  });

  test('touch buttons move rotate and soft drop', async ({ page }) => {
    await openGame(page);
    const start = await getState(page);

    const right = page.getByRole('button', { name: 'Right' });
    await right.dispatchEvent('pointerdown');
    await advanceFrames(page, 8);
    await right.dispatchEvent('pointerup');
    const moved = await getState(page);
    expect(moved.current.x).toBeGreaterThan(start.current.x);

    const rotate = page.getByRole('button', { name: 'Rotate' });
    const beforeRotate = moved.current.rotation;
    await rotate.click();
    const rotated = await getState(page);
    expect(rotated.current.rotation).not.toBe(beforeRotate);

    const soft = page.getByRole('button', { name: 'Soft Drop' });
    const beforeSoftY = rotated.current.y;
    await soft.dispatchEvent('pointerdown');
    await advanceFrames(page, 6);
    await soft.dispatchEvent('pointerup');
    const softened = await getState(page);
    expect(softened.current.y).toBeGreaterThan(beforeSoftY);

    const hard = page.getByRole('button', { name: 'Hard Drop' });
    const scoreBeforeHard = softened.score;
    await hard.click();
    const hardened = await getState(page);
    expect(hardened.score).toBeGreaterThanOrEqual(scoreBeforeHard);
  });
});
