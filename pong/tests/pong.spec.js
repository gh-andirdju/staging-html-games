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
    const api = window.__pongTest;
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
  await page.evaluate(() => window.__pongTest.setAutoStep(false));
  await expect(page.locator('canvas').first()).toBeVisible();
}

async function getState(page) {
  return page.evaluate(() => {
    const api = window.__pongTest;
    const reader = api.getState ?? api.readState;
    return reader.call(api);
  });
}

async function setState(page, nextState) {
  await page.evaluate((payload) => {
    window.__pongTest.setState(payload);
  }, nextState);
}

async function advanceFrames(page, frames = 1) {
  await page.evaluate(async (value) => {
    await window.__pongTest.advanceFrames(value);
  }, frames);
}

async function prepareVisualLayout(page) {
  await setState(page, {
    ball: { x: 400, y: 200, dx: 220, dy: 140 },
    playerPaddle: { y: 180 },
    aiPaddle: { y: 180 },
    playerScore: 3,
    aiScore: 1,
    gameState: 'playing',
    winner: null
  });
  await page.locator('canvas').first().scrollIntoViewIfNeeded();
}

async function dragTouchOnLane(page, relativePoints) {
  await page.evaluate((points) => {
    const lane = document.getElementById('player-drag-lane');
    if (!lane) throw new Error('Drag lane not found.');
    const rect = lane.getBoundingClientRect();
    const makeInit = (pt, type) => ({
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      clientX: rect.left + rect.width * pt.x,
      clientY: rect.top + rect.height * pt.y,
      buttons: type === 'pointerup' ? 0 : 1
    });
    lane.dispatchEvent(new PointerEvent('pointerdown', makeInit(points[0], 'pointerdown')));
    for (let i = 1; i < points.length; i++) {
      lane.dispatchEvent(new PointerEvent('pointermove', makeInit(points[i], 'pointermove')));
    }
    lane.dispatchEvent(new PointerEvent('pointerup', makeInit(points[points.length - 1], 'pointerup')));
  }, relativePoints);
}

test('renders the game canvas and exposes the test API', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);

  expect(state.gameState).toBeDefined();
  expect(typeof state.playerScore).toBe('number');
  expect(typeof state.aiScore).toBe('number');
  expect(state.ball).toMatchObject({ x: expect.any(Number), y: expect.any(Number) });
  expect(state.playerPaddle).toMatchObject({ y: expect.any(Number) });
  expect(state.aiPaddle).toMatchObject({ y: expect.any(Number) });

  const pixelCount = await page.evaluate(() => {
    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let nonBlack = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 10 || data[i + 1] > 10 || data[i + 2] > 10) nonBlack++;
    }
    return nonBlack;
  });
  expect(pixelCount).toBeGreaterThan(500);
});

test('ball moves across frames when playing', async ({ page }) => {
  await openGame(page);
  await setState(page, {
    ball: { x: 400, y: 260, dx: 200, dy: 100 },
    gameState: 'playing'
  });
  const before = await getState(page);

  await advanceFrames(page, 10);

  const after = await getState(page);
  expect(after.ball.x).not.toBeCloseTo(before.ball.x, 1);
  expect(after.ball.y).not.toBeCloseTo(before.ball.y, 1);
});

test('ball bounces off the top wall', async ({ page }) => {
  await openGame(page);
  await setState(page, {
    ball: { x: 400, y: 10, dx: 100, dy: -150 },
    gameState: 'playing'
  });

  await advanceFrames(page, 4);

  const state = await getState(page);
  expect(state.ball.dy).toBeGreaterThan(0);
});

test('ball bounces off the bottom wall', async ({ page }) => {
  await openGame(page);
  await setState(page, {
    ball: { x: 400, y: 510, dx: 100, dy: 150 },
    gameState: 'playing'
  });

  await advanceFrames(page, 4);

  const state = await getState(page);
  expect(state.ball.dy).toBeLessThan(0);
});

test('ball bounces off the player paddle', async ({ page }) => {
  await openGame(page);
  // Position ball approaching player paddle from the right
  await setState(page, {
    ball: { x: 48, y: 260, dx: -200, dy: 0 },
    playerPaddle: { y: 220 },
    gameState: 'playing'
  });

  await advanceFrames(page, 4);

  const state = await getState(page);
  expect(state.ball.dx).toBeGreaterThan(0);
});

test('ball bounces off the AI paddle', async ({ page }) => {
  await openGame(page);
  // Position ball approaching AI paddle from the left
  const aiX = 800 - 24 - 12;
  await setState(page, {
    ball: { x: aiX - 12, y: 260, dx: 200, dy: 0 },
    aiPaddle: { y: 220 },
    gameState: 'playing'
  });

  await advanceFrames(page, 4);

  const state = await getState(page);
  expect(state.ball.dx).toBeLessThan(0);
});

test('player scores when ball passes the AI side', async ({ page }) => {
  await openGame(page);
  await setState(page, {
    ball: { x: 790, y: 260, dx: 300, dy: 0 },
    playerScore: 0,
    aiScore: 0,
    gameState: 'playing'
  });

  await advanceFrames(page, 6);

  const state = await getState(page);
  expect(state.playerScore).toBe(1);
  expect(state.gameState).toBe('serving');
});

test('AI scores when ball passes the player side', async ({ page }) => {
  await openGame(page);
  await setState(page, {
    ball: { x: 10, y: 260, dx: -300, dy: 0 },
    playerScore: 0,
    aiScore: 0,
    gameState: 'playing'
  });

  await advanceFrames(page, 6);

  const state = await getState(page);
  expect(state.aiScore).toBe(1);
  expect(state.gameState).toBe('serving');
});

test('ball is stationary in serving state', async ({ page }) => {
  await openGame(page);
  await setState(page, { gameState: 'serving', serveTimer: 30 });
  const before = await getState(page);

  await advanceFrames(page, 5);

  const after = await getState(page);
  expect(after.ball.x).toBeCloseTo(before.ball.x, 1);
  expect(after.ball.y).toBeCloseTo(before.ball.y, 1);
});

test('ball launches after serve timer expires', async ({ page }) => {
  await openGame(page);
  await setState(page, {
    ball: { x: 400, y: 260, dx: 0, dy: 0 },
    gameState: 'serving',
    serveTimer: 2
  });

  await advanceFrames(page, 5);

  const state = await getState(page);
  expect(state.gameState).toBe('playing');
  expect(Math.abs(state.ball.dx)).toBeGreaterThan(0);
});

test('AI paddle moves toward the ball', async ({ page }) => {
  await openGame(page);
  await setState(page, {
    ball: { x: 600, y: 50, dx: 100, dy: 0 },
    aiPaddle: { y: 300 },
    gameState: 'playing'
  });
  const before = await getState(page);

  await advanceFrames(page, 20);

  const after = await getState(page);
  expect(after.aiPaddle.y).toBeLessThan(before.aiPaddle.y);
});

test('W key moves player paddle up', async ({ page }) => {
  await openGame(page);
  await setState(page, { playerPaddle: { y: 220 }, gameState: 'playing' });
  const before = await getState(page);

  await page.keyboard.down('w');
  await advanceFrames(page, 10);
  await page.keyboard.up('w');

  const after = await getState(page);
  expect(after.playerPaddle.y).toBeLessThan(before.playerPaddle.y);
});

test('S key moves player paddle down', async ({ page }) => {
  await openGame(page);
  await setState(page, { playerPaddle: { y: 220 }, gameState: 'playing' });
  const before = await getState(page);

  await page.keyboard.down('s');
  await advanceFrames(page, 10);
  await page.keyboard.up('s');

  const after = await getState(page);
  expect(after.playerPaddle.y).toBeGreaterThan(before.playerPaddle.y);
});

test('ArrowUp key moves player paddle up', async ({ page }) => {
  await openGame(page);
  await setState(page, { playerPaddle: { y: 220 }, gameState: 'playing' });
  const before = await getState(page);

  await page.keyboard.down('ArrowUp');
  await advanceFrames(page, 10);
  await page.keyboard.up('ArrowUp');

  const after = await getState(page);
  expect(after.playerPaddle.y).toBeLessThan(before.playerPaddle.y);
});

test('ArrowDown key moves player paddle down', async ({ page }) => {
  await openGame(page);
  await setState(page, { playerPaddle: { y: 220 }, gameState: 'playing' });
  const before = await getState(page);

  await page.keyboard.down('ArrowDown');
  await advanceFrames(page, 10);
  await page.keyboard.up('ArrowDown');

  const after = await getState(page);
  expect(after.playerPaddle.y).toBeGreaterThan(before.playerPaddle.y);
});

test('restart resets scores and state', async ({ page }) => {
  await openGame(page);
  await setState(page, { playerScore: 4, aiScore: 3, gameState: 'playing' });

  await page.evaluate(() => window.__pongTest.restart());

  const state = await getState(page);
  expect(state.playerScore).toBe(0);
  expect(state.aiScore).toBe(0);
  expect(state.gameState).toBe('serving');
  expect(state.winner).toBeNull();
});

test('game transitions to won state when player reaches win score', async ({ page }) => {
  await openGame(page);
  await setState(page, {
    ball: { x: 790, y: 260, dx: 300, dy: 0 },
    playerScore: 6,
    aiScore: 2,
    gameState: 'playing'
  });

  await advanceFrames(page, 6);

  const state = await getState(page);
  expect(state.gameState).toBe('won');
  expect(state.winner).toBe('player');
});

test('game transitions to won state when AI reaches win score', async ({ page }) => {
  await openGame(page);
  await setState(page, {
    ball: { x: 10, y: 260, dx: -300, dy: 0 },
    playerScore: 2,
    aiScore: 6,
    gameState: 'playing'
  });

  await advanceFrames(page, 6);

  const state = await getState(page);
  expect(state.gameState).toBe('won');
  expect(state.winner).toBe('ai');
});

test('HUD displays correct scores', async ({ page }) => {
  await openGame(page);
  await setState(page, { playerScore: 5, aiScore: 3 });

  const playerText = await page.locator('#player-score').textContent();
  const aiText = await page.locator('#ai-score').textContent();

  expect(playerText).toBe('5');
  expect(aiText).toBe('3');
});

test('matches the desktop layout baseline', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGame(page);
  await prepareVisualLayout(page);

  await expect(page).toHaveScreenshot('pong-desktop-layout.png', {
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

  test('touch drag moves the player paddle', async ({ page }) => {
    await openGame(page);
    await setState(page, { playerPaddle: { y: 220 }, gameState: 'playing' });
    const before = await getState(page);

    await dragTouchOnLane(page, [
      { x: 0.5, y: 0.2 },
      { x: 0.5, y: 0.5 },
      { x: 0.5, y: 0.8 }
    ]);
    await advanceFrames(page, 2);

    const after = await getState(page);
    expect(after.playerPaddle.y).not.toBeCloseTo(before.playerPaddle.y, 0);
  });

  test('touch controls are below the game canvas', async ({ page }) => {
    await openGame(page);

    const canvasBox = await page.locator('#game').boundingBox();
    const controlsBox = await page.locator('.touch-controls').boundingBox();

    expect(canvasBox).not.toBeNull();
    expect(controlsBox).not.toBeNull();
    expect(controlsBox.y).toBeGreaterThanOrEqual(canvasBox.y + canvasBox.height - 2);
  });

  test('drag lane is full width within touch controls', async ({ page }) => {
    await openGame(page);

    const controlsBox = await page.locator('.touch-controls').boundingBox();
    const laneBox = await page.locator('#player-drag-lane').boundingBox();

    expect(laneBox).not.toBeNull();
    expect(laneBox.width).toBeGreaterThanOrEqual(controlsBox.width - 2);
  });

  test('matches the mobile layout baseline', async ({ page }) => {
    await openGame(page);
    await prepareVisualLayout(page);

    await expect(page).toHaveScreenshot('pong-mobile-layout.png', {
      animations: 'disabled',
      fullPage: false,
      maxDiffPixels: 10
    });
  });
});
