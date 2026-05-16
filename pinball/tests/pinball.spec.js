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
      typeof api.getState === 'function' &&
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
  return page.evaluate(() => window.__pinballTest.getState());
}

async function advanceFrames(page, frames = 1) {
  await page.evaluate((frameCount) => {
    window.__pinballTest.advanceFrames(frameCount);
  }, frames);
}

async function restartGame(page) {
  await page.evaluate(() => window.__pinballTest.restart());
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
  await advanceFrames(page, 1);
  const after = await getState(page);

  expect(after.status).toBe('playing');
  expect(after.ball.launched).toBe(true);
  expect(after.ball.vy).toBeLessThan(0);
  expect(after.ball.x).toBeCloseTo(360, 0);
  expect(after.ball.y).toBeCloseTo(600, 0);
});

test('minimum-power launch still reaches the playfield', async ({ page }) => {
  await openGame(page);

  await page.evaluate(() => {
    window.__pinballTest.setState({ status: 'ready', plunger: { compressed: 0.001 } });
  });

  await page.keyboard.up(' ');
  await advanceFrames(page, 1);

  // A launch that drains straight down the right gutter never leaves x~360.
  // Reaching the playfield means the lane deflector caught the ball.
  let minX = 999;
  for (let i = 0; i < 120; i += 1) {
    await advanceFrames(page, 2);
    const state = await getState(page);
    minX = Math.min(minX, state.ball.x);
    if (state.status !== 'playing') break;
  }
  expect(minX).toBeLessThan(300);
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
  expect(after.balls).toBe(2);
  expect(after.status).toBe('ready');
  expect(after.ball.x).toBeCloseTo(360, 0);
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

test('restart button resets game state', async ({ page }) => {
  await openGame(page);

  await page.evaluate(() => {
    window.__pinballTest.setState({ status: 'game_over', balls: 0, score: 5000, level: 4 });
  });

  await page.click('#restart');
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
    const s = api.getState();
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

test('frame counter increments during playing but not during ready', async ({ page }) => {
  await openGame(page);

  const before = await getState(page);
  expect(before.status).toBe('ready');
  const frameBefore = before.frame;

  await advanceFrames(page, 5);
  const afterReady = await getState(page);
  expect(afterReady.frame).toBe(frameBefore);

  await page.evaluate(() => {
    window.__pinballTest.setState({
      status: 'playing',
      ball: { x: 200, y: 400, vx: 0, vy: 0, radius: 10, launched: true }
    });
  });

  await advanceFrames(page, 5);
  const afterPlaying = await getState(page);
  expect(afterPlaying.frame).toBe(frameBefore + 5);
});

test('left flipper boost launches ball upward', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    window.__pinballTest.setState({
      status: 'playing',
      // ball just above the left flipper arm (pivot y=540) so the activating flipper sweeps it upward
      ball: { x: 196, y: 552, vx: 0, vy: 50, radius: 10, launched: true }
    });
  });
  await page.keyboard.down('z');
  await advanceFrames(page, 4);
  await page.keyboard.up('z');
  const after = await getState(page);
  expect(after.ball.vy).toBeLessThan(0);
});

test('right flipper boost launches ball upward', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    window.__pinballTest.setState({
      status: 'playing',
      // ball above pivot y=540, in path of right flipper active sweep
      ball: { x: 200, y: 525, vx: 0, vy: 50, radius: 10, launched: true }
    });
  });
  await page.keyboard.down('x');
  await advanceFrames(page, 4);
  await page.keyboard.up('x');
  const after = await getState(page);
  expect(after.ball.vy).toBeLessThan(0);
});

test('level caps at 10 when all targets cleared', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    const api = window.__pinballTest;
    const s = api.getState();
    api.setState({
      status: 'playing',
      level: 10,
      targets: s.targets.map((t) => ({ ...t, hit: true })),
      ball: { x: 200, y: 500, vx: 0, vy: 0, radius: 10, launched: true }
    });
  });
  await advanceFrames(page, 1);
  const after = await getState(page);
  expect(after.level).toBe(10);
  expect(after.targets.every((t) => !t.hit)).toBe(true);
});

test('score multiplier increases with level', async ({ page }) => {
  await openGame(page);
  const s = await getState(page);
  const bumper = s.bumpers[0];
  await page.evaluate((b) => {
    window.__pinballTest.setState({
      status: 'playing',
      score: 0,
      level: 2,
      ball: { x: b.x, y: b.y, vx: 0, vy: 0, radius: 10, launched: true }
    });
  }, bumper);
  await advanceFrames(page, 3);
  const after = await getState(page);
  expect(after.score).toBeGreaterThanOrEqual(100);
});

test('game_over status blocks physics advancement', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    window.__pinballTest.setState({
      status: 'game_over',
      ball: { x: 200, y: 400, vx: 100, vy: 100, radius: 10, launched: true }
    });
  });
  const before = await getState(page);
  await advanceFrames(page, 10);
  const after = await getState(page);
  expect(after.frame).toBe(before.frame);
  expect(after.ball.y).toBe(before.ball.y);
});

test('ball reflects off left wall', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    window.__pinballTest.setState({
      status: 'playing',
      ball: { x: 32, y: 400, vx: -100, vy: 0, radius: 10, launched: true }
    });
  });
  await advanceFrames(page, 3);
  const after = await getState(page);
  expect(after.ball.vx).toBeGreaterThan(0);
});

test('ball reflects off right wall', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    window.__pinballTest.setState({
      status: 'playing',
      ball: { x: 368, y: 400, vx: 100, vy: 0, radius: 10, launched: true }
    });
  });
  await advanceFrames(page, 3);
  const after = await getState(page);
  expect(after.ball.vx).toBeLessThan(0);
});

test('HUD score updates in DOM after bumper hit via advanceFrames', async ({ page }) => {
  await openGame(page);
  const s = await getState(page);
  const bumper = s.bumpers[0];
  await page.evaluate((b) => {
    window.__pinballTest.setState({
      status: 'playing',
      score: 0,
      ball: { x: b.x, y: b.y, vx: 0, vy: 0, radius: 10, launched: true }
    });
  }, bumper);
  await advanceFrames(page, 3);
  const after = await getState(page);
  const hudScore = await page.locator('#score').innerText();
  expect(Number(hudScore)).toBe(after.score);
  expect(after.score).toBeGreaterThan(0);
});

test('ball speed is capped after flipper boost', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    window.__pinballTest.setState({
      status: 'playing',
      ball: { x: 196, y: 552, vx: 0, vy: 50, radius: 10, launched: true }
    });
  });
  await page.keyboard.down('z');
  await advanceFrames(page, 4);
  await page.keyboard.up('z');
  const after = await getState(page);
  const speed = Math.sqrt(after.ball.vx ** 2 + after.ball.vy ** 2);
  expect(speed).toBeLessThanOrEqual(900);
});

test('plunger compresses while launch key is held', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    window.__pinballTest.setState({ status: 'ready', plunger: { compressed: 0 } });
  });
  await page.keyboard.down(' ');
  await advanceFrames(page, 10);
  await page.keyboard.up(' ');
  const s = await getState(page);
  expect(s.plunger.compressed).toBeCloseTo(0.30, 1);
  expect(s.status).toBe('ready');
});

test('ArrowLeft activates left flipper', async ({ page }) => {
  await openGame(page);
  const before = await getState(page);
  const restAngle = before.leftFlipper.angle;
  await page.keyboard.down('ArrowLeft');
  await advanceFrames(page, 6);
  await page.keyboard.up('ArrowLeft');
  const after = await getState(page);
  expect(after.leftFlipper.angle).not.toBeCloseTo(restAngle, 1);
});

test('ArrowRight activates right flipper', async ({ page }) => {
  await openGame(page);
  const before = await getState(page);
  const restAngle = before.rightFlipper.angle;
  await page.keyboard.down('ArrowRight');
  await advanceFrames(page, 6);
  await page.keyboard.up('ArrowRight');
  const after = await getState(page);
  expect(after.rightFlipper.angle).not.toBeCloseTo(restAngle, 1);
});

test('r key triggers restart', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    window.__pinballTest.setState({ status: 'game_over', balls: 0, score: 5000, level: 5 });
  });
  await page.keyboard.press('r');
  const after = await getState(page);
  expect(after.status).toBe('ready');
  expect(after.balls).toBe(3);
  expect(after.score).toBe(0);
  expect(after.level).toBe(1);
});

test('bumper hitTimer is 14 immediately after collision', async ({ page }) => {
  await openGame(page);
  const s = await getState(page);
  const bumper = s.bumpers[0];
  await page.evaluate((b) => {
    window.__pinballTest.setState({
      status: 'playing',
      score: 0,
      ball: { x: b.x, y: b.y, vx: 0, vy: 0, radius: 10, launched: true }
    });
  }, bumper);
  await advanceFrames(page, 1);
  const after = await getState(page);
  expect(after.bumpers[0].hitTimer).toBe(14);
});

test('slash key activates right flipper', async ({ page }) => {
  await openGame(page);
  const before = await getState(page);
  const restAngle = before.rightFlipper.angle;
  await page.keyboard.down('/');
  await advanceFrames(page, 6);
  await page.keyboard.up('/');
  const after = await getState(page);
  expect(after.rightFlipper.angle).not.toBeCloseTo(restAngle, 1);
});

test('target hit detection marks target hit and scores', async ({ page }) => {
  await openGame(page);
  const s = await getState(page);
  const target = s.targets[0];
  await page.evaluate((t) => {
    window.__pinballTest.setState({
      status: 'playing',
      score: 0,
      level: 1,
      ball: { x: t.x + t.w / 2, y: t.y + t.h / 2, vx: 0, vy: -50, radius: 10, launched: true }
    });
  }, target);
  await advanceFrames(page, 1);
  const after = await getState(page);
  expect(after.targets[0].hit).toBe(true);
  expect(after.score).toBeGreaterThan(0);
});

test('ball reflects off curved top wall', async ({ page }) => {
  await openGame(page);
  // Ball outside the arc boundary on the lateral side (x=80, adist≈193 > arcR-radius=160)
  await page.evaluate(() => {
    window.__pinballTest.setState({
      status: 'playing',
      ball: { x: 80, y: 170, vx: -100, vy: -300, radius: 10, launched: true }
    });
  });
  await advanceFrames(page, 10);
  const after = await getState(page);
  // Ball must remain inside the arc (not escape through the curved wall)
  const adist = Math.sqrt((after.ball.x - 200) ** 2 + after.ball.y ** 2);
  expect(adist).toBeLessThanOrEqual(170);
  expect(after.ball.y).toBeGreaterThan(0);
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
