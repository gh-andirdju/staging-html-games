import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('snake-help-seen', '1'); } catch {} });
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

async function prepareVisualLayout(page) {
  await page.evaluate(() => {
    window.__snakeTest.setState({
      snake: [
        { x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 },
        { x: 7, y: 10 }, { x: 6, y: 10 }, { x: 6, y: 9 },
        { x: 6, y: 8 }, { x: 7, y: 8 }, { x: 8, y: 8 }
      ],
      direction: { x: 1, y: 0 },
      nextDirection: { x: 1, y: 0 },
      food: { x: 14, y: 7 },
      score: 80,
      highScore: 80,
      level: 2,
      foodEaten: 8,
      tickInterval: 10,
      tickCounter: 0,
      gameOver: false,
      frame: 40,
      statusMessage: '',
      statusTone: 'normal',
      statusMessageTimer: 0
    });
  });
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

  await page.keyboard.press('a');
  s = await getState(page);
  expect(s.nextDirection).toEqual({ x: -1, y: 0 });

  await page.keyboard.press('d');
  s = await getState(page);
  expect(s.nextDirection).toEqual({ x: 1, y: 0 });
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

test('score pop class appears on the score value after eating food and clears', async ({ page }) => {
  await openGame(page);
  const popped = await page.evaluate(async () => {
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
    await window.__snakeTest.advanceFrames(12);
    return document.getElementById('score').classList.contains('stat-pop');
  });
  expect(popped).toBe(true);
  const s = await getState(page);
  expect(s.score).toBe(10);
  await page.waitForFunction(() => !document.getElementById('score').classList.contains('stat-pop'));
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
  await expect(page.locator('#status')).toHaveText('Game Over');
});

test('top wall collision sets gameOver', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    window.__snakeTest.setState({
      snake: [{ x: 10, y: 0 }, { x: 10, y: 1 }, { x: 10, y: 2 }],
      direction: { x: 0, y: -1 },
      nextDirection: { x: 0, y: -1 },
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

test('bottom wall collision sets gameOver', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    window.__snakeTest.setState({
      snake: [{ x: 10, y: 19 }, { x: 10, y: 18 }, { x: 10, y: 17 }],
      direction: { x: 0, y: 1 },
      nextDirection: { x: 0, y: 1 },
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

test('left wall collision sets gameOver', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    window.__snakeTest.setState({
      snake: [{ x: 0, y: 10 }, { x: 1, y: 10 }, { x: 2, y: 10 }],
      direction: { x: -1, y: 0 },
      nextDirection: { x: -1, y: 0 },
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
    // U-shape: head at (5,6), body loops up to (5,5); moving up hits body at (5,5)
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

test('180-degree reversal is blocked during movement', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    window.__snakeTest.setState({
      snake: [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }],
      direction: { x: 1, y: 0 },
      nextDirection: { x: 1, y: 0 },
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

  await page.keyboard.press('ArrowLeft');
  await advanceFrames(page, 12);
  const s = await getState(page);
  expect(s.gameOver).toBe(false);
  expect(s.snake[0].x).toBe(11);
});

test('direction keys are no-op after gameOver', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    window.__snakeTest.setState({
      snake: [{ x: 19, y: 10 }, { x: 18, y: 10 }],
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
  let s = await getState(page);
  expect(s.gameOver).toBe(true);

  await page.keyboard.press('ArrowUp');
  s = await getState(page);
  expect(s.nextDirection).toEqual({ x: 1, y: 0 });
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
  expect(s.statusTone).toBe('milestone');
  await expect(page.locator('#status')).toHaveText('Level 2');
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

test('pressing P pauses the game and freezes the snake', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    window.__snakeTest.setState({
      snake: [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }],
      direction: { x: 1, y: 0 },
      nextDirection: { x: 1, y: 0 },
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

  await page.keyboard.press('p');
  let s = await getState(page);
  expect(s.paused).toBe(true);
  await expect(page.locator('#status')).toHaveText('Paused');

  await page.keyboard.press('ArrowUp');
  await advanceFrames(page, 24);
  s = await getState(page);
  expect(s.snake[0]).toEqual({ x: 10, y: 10 });
  expect(s.tickCounter).toBe(0);
  expect(s.nextDirection).toEqual({ x: 1, y: 0 });
});

test('pressing P again resumes movement', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    window.__snakeTest.setState({
      snake: [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }],
      direction: { x: 1, y: 0 },
      nextDirection: { x: 1, y: 0 },
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

  await page.keyboard.press('p');
  await advanceFrames(page, 12);
  let s = await getState(page);
  expect(s.snake[0]).toEqual({ x: 10, y: 10 });

  await page.keyboard.press('p');
  s = await getState(page);
  expect(s.paused).toBe(false);

  await advanceFrames(page, 12);
  s = await getState(page);
  expect(s.snake[0]).toEqual({ x: 11, y: 10 });
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
  await page.evaluate(() => {
    window.__snakeTest.setState({
      snake: [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }],
      direction: { x: 1, y: 0 },
      nextDirection: { x: 1, y: 0 },
      food: { x: 15, y: 15 },
      score: 70,
      highScore: 70,
      level: 2,
      foodEaten: 7,
      tickInterval: 10,
      tickCounter: 0,
      gameOver: false,
      frame: 0
    });
  });

  await page.keyboard.press('p');
  let s = await getState(page);
  expect(s.paused).toBe(true);

  await page.keyboard.press('r');
  s = await getState(page);
  expect(s.paused).toBe(false);
  expect(s.score).toBe(0);
  expect(s.level).toBe(1);

  await advanceFrames(page, 12);
  s = await getState(page);
  expect(s.snake[0].x).toBe(13);
});

test('matches the desktop layout baseline', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGame(page);
  await prepareVisualLayout(page);

  await expect(page).toHaveScreenshot('snake-desktop-layout.png', {
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

  test('touch D-pad direction buttons are no-op after gameOver', async ({ page }) => {
    await openGame(page);
    await page.evaluate(() => {
      window.__snakeTest.setState({
        snake: [{ x: 19, y: 10 }, { x: 18, y: 10 }],
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
    let s = await page.evaluate(() => window.__snakeTest.getState());
    expect(s.gameOver).toBe(true);

    await page.getByRole('button', { name: 'Up' }).dispatchEvent('pointerdown');
    s = await page.evaluate(() => window.__snakeTest.getState());
    expect(s.nextDirection).toEqual({ x: 1, y: 0 });
  });

  test('matches the portrait layout baseline', async ({ page }) => {
    await openGame(page);
    await prepareVisualLayout(page);

    await expect(page).toHaveScreenshot('snake-portrait-layout.png', {
      animations: 'disabled',
      fullPage: false,
      maxDiffPixels: 10
    });
  });
});

test.describe('how to play help', () => {
  async function clearHelpSeenOnce(page) {
    await page.addInitScript(() => {
      try {
        if (!localStorage.getItem('snake-help-clear-done')) {
          localStorage.removeItem('snake-help-seen');
          localStorage.setItem('snake-help-clear-done', '1');
        }
      } catch {}
    });
  }

  test('first visit shows the help panel and pauses the game', async ({ page }) => {
    await clearHelpSeenOnce(page);
    await openGame(page);

    await expect(page.locator('#help-overlay')).toBeVisible();
    const s = await getState(page);
    expect(s.helpOpen).toBe(true);
    expect(s.paused).toBe(true);
  });

  test('dismissing help sets the seen flag, unpauses, and stays hidden after reload', async ({ page }) => {
    await clearHelpSeenOnce(page);
    await openGame(page);
    await expect(page.locator('#help-overlay')).toBeVisible();

    await page.locator('#help-close').click();
    await expect(page.locator('#help-overlay')).toBeHidden();
    let s = await getState(page);
    expect(s.helpOpen).toBe(false);
    expect(s.paused).toBe(false);
    const flag = await page.evaluate(() => localStorage.getItem('snake-help-seen'));
    expect(flag).toBe('1');

    await openGame(page);
    await expect(page.locator('#help-overlay')).toBeHidden();
    s = await getState(page);
    expect(s.helpOpen).toBe(false);
  });

  test('help button reopens the panel and Escape closes it without pausing the game', async ({ page }) => {
    await openGame(page);
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
    await openGame(page);
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
  test('mute button toggles aria-pressed and persists snake-muted across reload', async ({ page }) => {
    await openGame(page);
    const muteBtn = page.locator('#mute');
    await expect(muteBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(muteBtn).toHaveText('🔊');

    await muteBtn.click();
    await expect(muteBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(muteBtn).toHaveText('🔇');
    let stored = await page.evaluate(() => localStorage.getItem('snake-muted'));
    expect(stored).toBe('1');

    await openGame(page);
    await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'true');
    let s = await getState(page);
    expect(s.muted).toBe(true);

    await page.locator('#mute').click();
    await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'false');
    stored = await page.evaluate(() => localStorage.getItem('snake-muted'));
    expect(stored).toBe('0');
  });

  test('muted state is exposed via getState and setMuted updates it', async ({ page }) => {
    await openGame(page);
    let s = await getState(page);
    expect(s.muted).toBe(false);

    await page.evaluate(() => window.__snakeTest.setMuted(true));
    s = await getState(page);
    expect(s.muted).toBe(true);
    await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'true');

    await page.evaluate(() => window.__snakeTest.setMuted(false));
    s = await getState(page);
    expect(s.muted).toBe(false);
  });

  test('eating food, leveling up, and game over run cleanly with sound wired', async ({ page }) => {
    await openGame(page);
    await page.evaluate(() => {
      window.__snakeTest.setSeededValue(7);
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
    let s = await getState(page);
    expect(s.foodEaten).toBe(5);
    expect(s.level).toBe(2);

    await advanceFrames(page, 200);
    s = await getState(page);
    expect(s.gameOver).toBe(true);
  });
});
