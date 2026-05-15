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
  await page.goto('./');
  await page.waitForFunction(() => {
    const api = window.__snakeTest;
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
  await page.evaluate(() => window.__snakeTest.setAutoStep(false));
  await expect(page.locator('canvas')).toBeVisible();
}

async function getState(page) {
  return page.evaluate(() => window.__snakeTest.getState());
}

async function advanceFrames(page, frames) {
  await page.evaluate(async (value) => {
    await window.__snakeTest.advanceFrames(value);
  }, frames);
}

test('renders and exposes ready test API', async ({ page }) => {
  await openGame(page);
  await expect.poll(async () => {
    return page.locator('canvas').evaluate((canvas) => {
      const context = canvas.getContext('2d');
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let colored = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] || pixels[i + 1] || pixels[i + 2] || pixels[i + 3]) colored += 1;
      }
      return colored;
    });
  }).toBeGreaterThan(500);
});

test('arrow keys and WASD update nextDirection', async ({ page }) => {
  await openGame(page);

  await page.keyboard.press('ArrowUp');
  let s = await getState(page);
  expect(s.nextDirection).toEqual({ x: 0, y: -1 });

  await page.keyboard.press('ArrowDown');
  s = await getState(page);
  expect(s.nextDirection).toEqual({ x: 0, y: 1 });

  await page.keyboard.press('ArrowLeft');
  s = await getState(page);
  expect(s.nextDirection).toEqual({ x: -1, y: 0 });

  await page.keyboard.press('ArrowRight');
  s = await getState(page);
  expect(s.nextDirection).toEqual({ x: 1, y: 0 });

  await page.keyboard.press('w');
  s = await getState(page);
  expect(s.nextDirection).toEqual({ x: 0, y: -1 });

  await page.keyboard.press('s');
  s = await getState(page);
  expect(s.nextDirection).toEqual({ x: 0, y: 1 });
});

test('snake moves one step per tickInterval frames and grows when eating food', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    window.__snakeTest.setSeededValue(42);
    window.__snakeTest.setState({
      snake: [{ x: 5, y: 10 }, { x: 4, y: 10 }, { x: 3, y: 10 }],
      direction: { x: 1, y: 0 },
      nextDirection: { x: 1, y: 0 },
      food: { x: 6, y: 10 },
      score: 0,
      highScore: 0,
      level: 1,
      foodEaten: 0,
      tickInterval: 12,
      tickCounter: 0,
      gameOver: false,
      frame: 0
    });
  });

  await advanceFrames(page, 11);
  let s = await getState(page);
  expect(s.snake[0]).toEqual({ x: 5, y: 10 });
  expect(s.tickCounter).toBe(11);

  await advanceFrames(page, 1);
  s = await getState(page);
  expect(s.snake[0]).toEqual({ x: 6, y: 10 });
  expect(s.snake.length).toBe(4);
  expect(s.score).toBe(10);
  expect(s.foodEaten).toBe(1);
  expect(s.gameOver).toBe(false);

  await advanceFrames(page, 12);
  s = await getState(page);
  expect(s.snake[0]).toEqual({ x: 7, y: 10 });
  expect(s.snake.length).toBe(4);
});

test('wall collision sets gameOver', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    window.__snakeTest.setState({
      snake: [{ x: 19, y: 10 }, { x: 18, y: 10 }, { x: 17, y: 10 }],
      direction: { x: 1, y: 0 },
      nextDirection: { x: 1, y: 0 },
      food: { x: 5, y: 5 },
      score: 0,
      highScore: 0,
      level: 1,
      foodEaten: 0,
      tickInterval: 12,
      tickCounter: 0,
      gameOver: false,
      frame: 0
    });
  });

  await advanceFrames(page, 12);
  const s = await getState(page);
  expect(s.gameOver).toBe(true);
});

test('self collision sets gameOver', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    // U-shape: head at (5,6), body loops up and across; moving up hits body at (5,5)
    window.__snakeTest.setState({
      snake: [
        { x: 5, y: 6 },
        { x: 4, y: 6 },
        { x: 3, y: 6 },
        { x: 3, y: 5 },
        { x: 4, y: 5 },
        { x: 5, y: 5 },
        { x: 6, y: 5 }
      ],
      direction: { x: 0, y: -1 },
      nextDirection: { x: 0, y: -1 },
      food: { x: 15, y: 15 },
      score: 0,
      highScore: 0,
      level: 1,
      foodEaten: 0,
      tickInterval: 12,
      tickCounter: 0,
      gameOver: false,
      frame: 0
    });
  });

  await advanceFrames(page, 12);
  const s = await getState(page);
  expect(s.gameOver).toBe(true);
});

test('level increments and tickInterval decreases after FOODS_PER_LEVEL foods', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    window.__snakeTest.setSeededValue(123);
    window.__snakeTest.setState({
      snake: [{ x: 5, y: 10 }, { x: 4, y: 10 }, { x: 3, y: 10 }],
      direction: { x: 1, y: 0 },
      nextDirection: { x: 1, y: 0 },
      food: { x: 6, y: 10 },
      score: 40,
      highScore: 40,
      level: 1,
      foodEaten: 4,
      tickInterval: 12,
      tickCounter: 0,
      gameOver: false,
      frame: 0
    });
  });

  await advanceFrames(page, 12);
  const s = await getState(page);
  expect(s.foodEaten).toBe(5);
  expect(s.level).toBe(2);
  expect(s.tickInterval).toBe(10);
  expect(s.tickInterval).toBeLessThan(12);
});

test('restart resets all state', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    window.__snakeTest.setState({
      snake: [{ x: 19, y: 10 }, { x: 18, y: 10 }],
      direction: { x: 1, y: 0 },
      nextDirection: { x: 1, y: 0 },
      food: { x: 5, y: 5 },
      score: 100,
      highScore: 100,
      level: 3,
      foodEaten: 10,
      tickInterval: 8,
      tickCounter: 0,
      gameOver: false,
      frame: 0
    });
  });

  await advanceFrames(page, 12);
  let s = await getState(page);
  expect(s.gameOver).toBe(true);

  await page.keyboard.press('r');
  s = await getState(page);
  expect(s.gameOver).toBe(false);
  expect(s.score).toBe(0);
  expect(s.level).toBe(1);
  expect(s.foodEaten).toBe(0);
  expect(s.tickInterval).toBe(12);
  expect(s.snake.length).toBeGreaterThan(0);
  expect(s.food).not.toBeNull();
});

test.describe('mobile touch controls', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true
  });

  test('touch D-pad updates nextDirection and controls are below the canvas', async ({ page }) => {
    await openGame(page);

    await page.getByRole('button', { name: 'Up' }).dispatchEvent('pointerdown');
    let s = await page.evaluate(() => window.__snakeTest.getState());
    expect(s.nextDirection).toEqual({ x: 0, y: -1 });

    await page.getByRole('button', { name: 'Left' }).dispatchEvent('pointerdown');
    s = await page.evaluate(() => window.__snakeTest.getState());
    expect(s.nextDirection).toEqual({ x: -1, y: 0 });

    await page.getByRole('button', { name: 'Down' }).dispatchEvent('pointerdown');
    s = await page.evaluate(() => window.__snakeTest.getState());
    expect(s.nextDirection).toEqual({ x: 0, y: 1 });

    await page.getByRole('button', { name: 'Right' }).dispatchEvent('pointerdown');
    s = await page.evaluate(() => window.__snakeTest.getState());
    expect(s.nextDirection).toEqual({ x: 1, y: 0 });

    const layout = await page.evaluate(() => {
      const board    = document.getElementById('game').getBoundingClientRect();
      const controls = document.querySelector('.touch-controls').getBoundingClientRect();
      return { boardBottom: board.bottom, controlsTop: controls.top };
    });
    expect(layout.controlsTop).toBeGreaterThanOrEqual(layout.boardBottom - 1);
  });
});
