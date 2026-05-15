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
    const api = window.__pinballTest;
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
  await page.evaluate(() => window.__pinballTest.setAutoStep(false));
  await expect(page.locator('canvas').first()).toBeVisible();
}

async function getState(page) {
  return page.evaluate(() => {
    const api = window.__pinballTest;
    const readState = api.getState ?? api.readState;
    return readState.call(api);
  });
}

async function advanceFrames(page, frames = 1) {
  await page.evaluate(async (frameCount) => {
    await window.__pinballTest.advanceFrames(frameCount);
  }, frames);
}

test('exposes the test control contract and renders the canvas', async ({ page }) => {
  await openGame(page);

  const state = await getState(page);

  expect(state.ball).toBeDefined();
  expect(typeof state.score).toBe('number');
  expect(typeof state.balls).toBe('number');
  expect(typeof state.level).toBe('number');
  expect(typeof state.status).toBe('string');
  expect(Array.isArray(state.bumpers)).toBe(true);
  expect(state.bumpers.length).toBeGreaterThanOrEqual(3);
  expect(Array.isArray(state.targets)).toBe(true);
  expect(state.leftFlipper).toBeDefined();
  expect(state.rightFlipper).toBeDefined();

  const pixelCount = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let drawn = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) drawn++;
    }
    return drawn;
  });

  expect(pixelCount).toBeGreaterThan(1000);
});

test('left flipper responds to z key', async ({ page }) => {
  await openGame(page);
  const before = await getState(page);
  const restAngle = before.leftFlipper.angle;

  await page.keyboard.down('z');
  await advanceFrames(page, 6);
  await page.keyboard.up('z');
  const after = await getState(page);

  expect(after.leftFlipper.angle).not.toBeCloseTo(restAngle, 1);
});

test('right flipper responds to x key', async ({ page }) => {
  await openGame(page);
  const before = await getState(page);
  const restAngle = before.rightFlipper.angle;

  await page.keyboard.down('x');
  await advanceFrames(page, 6);
  await page.keyboard.up('x');
  const after = await getState(page);

  expect(after.rightFlipper.angle).not.toBeCloseTo(restAngle, 1);
});

test('ball launches when plunger is compressed and released', async ({ page }) => {
  await openGame(page);

  await page.evaluate(() => {
    window.__pinballTest.setState({ status: 'ready', plunger: { compressed: 0.9 } });
  });

  await page.keyboard.up(' ');
  await advanceFrames(page, 5);
  const after = await getState(page);

  expect(after.status === 'playing' || after.ball.launched === true).toBe(true);
  expect(after.ball.vy).toBeLessThan(0);
});

test('bumper collision increments score', async ({ page }) => {
  await openGame(page);
  const s = await getState(page);
  const bumper = s.bumpers[0];

  await page.evaluate((b) => {
    window.__pinballTest.setState({
      status: 'playing',
      score: 0,
      ball: {
        x: b.x,
        y: b.y,
        vx: 0,
        vy: 0,
        radius: 10,
        launched: true
      }
    });
  }, bumper);

  await advanceFrames(page, 3);
  const after = await getState(page);
  expect(after.score).toBeGreaterThan(0);
});

test('ball drain decrements ball count', async ({ page }) => {
  await openGame(page);

  await page.evaluate(() => {
    window.__pinballTest.setState({
      status: 'playing',
      balls: 3,
      ball: { x: 200, y: 720, vx: 0, vy: 200, radius: 10, launched: true }
    });
  });

  await advanceFrames(page, 5);
  const after = await getState(page);
  expect(after.balls).toBeLessThan(3);
});

test('game over when last ball drains', async ({ page }) => {
  await openGame(page);

  await page.evaluate(() => {
    window.__pinballTest.setState({
      status: 'playing',
      balls: 1,
      ball: { x: 200, y: 720, vx: 0, vy: 200, radius: 10, launched: true }
    });
  });

  await advanceFrames(page, 5);
  const after = await getState(page);
  expect(after.status).toBe('game_over');
  expect(after.balls).toBe(0);
});

test('restart resets game state', async ({ page }) => {
  await openGame(page);

  await page.evaluate(() => {
    window.__pinballTest.setState({ status: 'game_over', balls: 0, score: 9999, level: 7 });
  });

  await page.evaluate(() => window.__pinballTest.restart());
  const after = await getState(page);

  expect(after.status).toBe('ready');
  expect(after.balls).toBe(3);
  expect(after.score).toBe(0);
  expect(after.level).toBe(1);
});

test('HUD reflects state changes', async ({ page }) => {
  await openGame(page);

  await page.evaluate(() => {
    window.__pinballTest.setState({ score: 1200, balls: 2, level: 3, status: 'playing' });
  });

  await expect(page.locator('#score')).toHaveText('1200');
  await expect(page.locator('#balls')).toHaveText('2');
  await expect(page.locator('#level')).toHaveText('3');
  await expect(page.locator('#status')).toHaveText('Playing');
});

test('all targets hit resets them and increments level', async ({ page }) => {
  await openGame(page);

  await page.evaluate(() => {
    const api = window.__pinballTest;
    const s = (api.getState ?? api.readState).call(api);
    const hitAll = s.targets.map((t) => ({ ...t, hit: true }));
    api.setState({
      status: 'playing',
      level: 1,
      targets: hitAll,
      ball: { x: 200, y: 500, vx: 0, vy: 0, radius: 10, launched: true }
    });
  });

  await advanceFrames(page, 1);
  const after = await getState(page);

  expect(after.targets.every((t) => !t.hit)).toBe(true);
  expect(after.level).toBe(2);
});

test('desktop layout screenshot', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGame(page);
  await page.locator('canvas').first().scrollIntoViewIfNeeded();
  await expect(page).toHaveScreenshot('pinball-desktop.png', {
    animations: 'disabled',
    fullPage: false,
    maxDiffPixels: 50
  });
});

test.describe('mobile layout', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('canvas and touch controls do not overlap', async ({ page }) => {
    await openGame(page);
    const canvasBox = await page.locator('#game').boundingBox();
    const controlsBox = await page.locator('.touch-controls').boundingBox();
    expect(controlsBox.y).toBeGreaterThanOrEqual(canvasBox.y + canvasBox.height);
  });

  test('mobile portrait layout screenshot', async ({ page }) => {
    await openGame(page);
    await page.locator('canvas').first().scrollIntoViewIfNeeded();
    await expect(page).toHaveScreenshot('pinball-mobile.png', {
      animations: 'disabled',
      fullPage: false,
      maxDiffPixels: 50
    });
  });
});
