import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('pong-help-seen', '1'); } catch {} });
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
  await page.evaluate((value) => {
    window.__pongTest.advanceFrames(value);
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

test('pressing R restarts the match', async ({ page }) => {
  await openGame(page);
  await setState(page, { playerScore: 4, aiScore: 3, gameState: 'playing' });

  await page.keyboard.press('r');

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

test('paddle edge hit deflects ball at steeper angle than center hit', async ({ page }) => {
  await openGame(page);

  // Center hit: ball hits middle of player paddle
  await setState(page, {
    ball: { x: 48, y: 260, dx: -200, dy: 0 },
    playerPaddle: { y: 220 },
    gameState: 'playing'
  });
  await advanceFrames(page, 4);
  const centerState = await getState(page);
  const centerDy = Math.abs(centerState.ball.dy);

  // Edge hit: ball hits near top edge of player paddle
  await setState(page, {
    ball: { x: 48, y: 226, dx: -200, dy: 0 },
    playerPaddle: { y: 220 },
    gameState: 'playing'
  });
  await advanceFrames(page, 4);
  const edgeState = await getState(page);
  const edgeDy = Math.abs(edgeState.ball.dy);

  expect(edgeDy).toBeGreaterThan(centerDy);
});

test('restart button click resets HUD scores', async ({ page }) => {
  await openGame(page);
  await setState(page, { playerScore: 4, aiScore: 2 });

  await page.locator('#restart').click();

  const playerText = await page.locator('#player-score').textContent();
  const aiText = await page.locator('#ai-score').textContent();
  expect(playerText).toBe('0');
  expect(aiText).toBe('0');
  const state = await getState(page);
  expect(state.gameState).toBe('serving');
});

test('won state freezes ball and paddles', async ({ page }) => {
  await openGame(page);
  await setState(page, {
    ball: { x: 400, y: 260, dx: 200, dy: 100 },
    gameState: 'won',
    winner: 'player'
  });
  const before = await getState(page);

  await advanceFrames(page, 10);

  const after = await getState(page);
  expect(after.ball.x).toBeCloseTo(before.ball.x, 1);
  expect(after.ball.y).toBeCloseTo(before.ball.y, 1);
});

test('ball speed is capped at BALL_SPEED_MAX after paddle hit at near-cap speed', async ({ page }) => {
  await openGame(page);
  // dx = -660: one uncapped bounce would give 660 * 1.08 = 712.8, exceeding the 700 cap
  await setState(page, {
    ball: { x: 48, y: 260, dx: -660, dy: 0 },
    playerPaddle: { y: 220 },
    gameState: 'playing'
  });
  await advanceFrames(page, 4);
  const state = await getState(page);
  expect(Math.abs(state.ball.dx)).toBeLessThanOrEqual(700);
});

test('HUD displays correct scores', async ({ page }) => {
  await openGame(page);
  await setState(page, { playerScore: 5, aiScore: 3 });

  const playerText = await page.locator('#player-score').textContent();
  const aiText = await page.locator('#ai-score').textContent();

  expect(playerText).toBe('5');
  expect(aiText).toBe('3');
});

test('AI moves faster with higher scores', async ({ page }) => {
  await openGame(page);

  await setState(page, {
    ball: { x: 600, y: 50, dx: 100, dy: 0 },
    aiPaddle: { y: 300 },
    playerScore: 0,
    aiScore: 0,
    gameState: 'playing'
  });
  const before1 = await getState(page);
  await advanceFrames(page, 20);
  const after1 = await getState(page);
  const easyMovement = before1.aiPaddle.y - after1.aiPaddle.y;

  await setState(page, {
    ball: { x: 600, y: 50, dx: 100, dy: 0 },
    aiPaddle: { y: 300 },
    playerScore: 5,
    aiScore: 5,
    gameState: 'playing'
  });
  const before2 = await getState(page);
  await advanceFrames(page, 20);
  const after2 = await getState(page);
  const hardMovement = before2.aiPaddle.y - after2.aiPaddle.y;

  expect(hardMovement).toBeGreaterThan(easyMovement);
});

test('serve speed increases with score', async ({ page }) => {
  await openGame(page);

  await setState(page, { gameState: 'serving', serveTimer: 0, playerScore: 0, aiScore: 0 });
  await advanceFrames(page, 1);
  const earlySpeed = Math.abs((await getState(page)).ball.dx);

  await setState(page, { gameState: 'serving', serveTimer: 0, playerScore: 5, aiScore: 5 });
  await advanceFrames(page, 1);
  const lateSpeed = Math.abs((await getState(page)).ball.dx);

  expect(lateSpeed).toBeGreaterThan(earlySpeed);
});

test('pressing P pauses play and freezes the ball and serve timer', async ({ page }) => {
  await openGame(page);
  await setState(page, {
    ball: { x: 400, y: 260, dx: 200, dy: 100 },
    gameState: 'playing'
  });

  await page.keyboard.press('p');
  const before = await getState(page);
  expect(before.paused).toBe(true);
  await expect(page.locator('#status')).toHaveText('Paused');

  await advanceFrames(page, 10);
  let after = await getState(page);
  expect(after.ball.x).toBeCloseTo(before.ball.x, 1);
  expect(after.ball.y).toBeCloseTo(before.ball.y, 1);

  // The serve timer also freezes while paused
  await setState(page, { gameState: 'serving', serveTimer: 5 });
  await advanceFrames(page, 10);
  after = await getState(page);
  expect(after.gameState).toBe('serving');
  expect(after.serveTimer).toBe(5);
});

test('pressing P again resumes play', async ({ page }) => {
  await openGame(page);
  await setState(page, {
    ball: { x: 400, y: 260, dx: 200, dy: 100 },
    gameState: 'playing'
  });

  await page.keyboard.press('p');
  const before = await getState(page);

  await page.keyboard.press('p');
  const resumed = await getState(page);
  expect(resumed.paused).toBe(false);

  await advanceFrames(page, 10);
  const after = await getState(page);
  expect(after.ball.x).not.toBeCloseTo(before.ball.x, 1);
});

test('pause button toggles pause and flips its label', async ({ page }) => {
  await openGame(page);
  const pauseBtn = page.locator('#pause');
  await expect(pauseBtn).toHaveText('Pause');
  await expect(pauseBtn).toHaveAttribute('aria-pressed', 'false');

  await pauseBtn.click();
  let state = await getState(page);
  expect(state.paused).toBe(true);
  await expect(pauseBtn).toHaveText('Resume');
  await expect(pauseBtn).toHaveAttribute('aria-pressed', 'true');

  await pauseBtn.click();
  state = await getState(page);
  expect(state.paused).toBe(false);
  await expect(pauseBtn).toHaveText('Pause');
  await expect(pauseBtn).toHaveAttribute('aria-pressed', 'false');
});

test('pressing R while paused restarts the match unpaused', async ({ page }) => {
  await openGame(page);
  await setState(page, { playerScore: 3, aiScore: 2, gameState: 'playing' });

  await page.keyboard.press('p');
  let state = await getState(page);
  expect(state.paused).toBe(true);

  await page.keyboard.press('r');
  state = await getState(page);
  expect(state.paused).toBe(false);
  expect(state.playerScore).toBe(0);
  expect(state.aiScore).toBe(0);
  expect(state.gameState).toBe('serving');
});

test('pressing P is ignored in the won state', async ({ page }) => {
  await openGame(page);
  await setState(page, { gameState: 'won', winner: 'player' });

  await page.keyboard.press('p');

  const state = await getState(page);
  expect(state.paused).toBe(false);
  expect(state.gameState).toBe('won');
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

  test('player-up button moves paddle up', async ({ page }) => {
    await openGame(page);
    await setState(page, { playerPaddle: { y: 220 }, gameState: 'playing' });
    const before = await getState(page);

    await page.locator('#player-up').dispatchEvent('pointerdown');
    await advanceFrames(page, 10);
    await page.locator('#player-up').dispatchEvent('pointerup');

    const after = await getState(page);
    expect(after.playerPaddle.y).toBeLessThan(before.playerPaddle.y);
  });

  test('player-down button moves paddle down', async ({ page }) => {
    await openGame(page);
    await setState(page, { playerPaddle: { y: 220 }, gameState: 'playing' });
    const before = await getState(page);

    await page.locator('#player-down').dispatchEvent('pointerdown');
    await advanceFrames(page, 10);
    await page.locator('#player-down').dispatchEvent('pointerup');

    const after = await getState(page);
    expect(after.playerPaddle.y).toBeGreaterThan(before.playerPaddle.y);
  });

  test('touch controls are below the game canvas', async ({ page }) => {
    await openGame(page);

    const canvasBox = await page.locator('#game').boundingBox();
    const controlsBox = await page.locator('.touch-controls').boundingBox();

    expect(canvasBox).not.toBeNull();
    expect(controlsBox).not.toBeNull();
    expect(controlsBox.y).toBeGreaterThanOrEqual(canvasBox.y + canvasBox.height - 2);
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

  test('page has no horizontal overflow and canvas fits the viewport width', async ({ page }) => {
    await openGame(page);

    const noOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    );
    expect(noOverflow).toBe(true);

    const canvasBox = await page.locator('#game').boundingBox();
    expect(canvasBox).not.toBeNull();
    expect(canvasBox.x).toBeGreaterThanOrEqual(0);
    expect(canvasBox.x + canvasBox.width).toBeLessThanOrEqual(390);
  });
});

test.describe('how to play help', () => {
  async function clearHelpSeenOnce(page) {
    await page.addInitScript(() => {
      try {
        if (!localStorage.getItem('pong-help-clear-done')) {
          localStorage.removeItem('pong-help-seen');
          localStorage.setItem('pong-help-clear-done', '1');
        }
      } catch {}
    });
  }

  test('first visit shows the help panel and pauses the game', async ({ page }) => {
    await clearHelpSeenOnce(page);
    await openGame(page);

    await expect(page.locator('#help-overlay')).toBeVisible();
    const state = await getState(page);
    expect(state.helpOpen).toBe(true);
    expect(state.paused).toBe(true);
  });

  test('dismissing help sets the seen flag, unpauses, and stays hidden after reload', async ({ page }) => {
    await clearHelpSeenOnce(page);
    await openGame(page);
    await expect(page.locator('#help-overlay')).toBeVisible();

    await page.locator('#help-close').click();
    await expect(page.locator('#help-overlay')).toBeHidden();
    let state = await getState(page);
    expect(state.helpOpen).toBe(false);
    expect(state.paused).toBe(false);
    const flag = await page.evaluate(() => localStorage.getItem('pong-help-seen'));
    expect(flag).toBe('1');

    await openGame(page);
    await expect(page.locator('#help-overlay')).toBeHidden();
    state = await getState(page);
    expect(state.helpOpen).toBe(false);
  });

  test('help button reopens the panel and Escape closes it without pausing the game', async ({ page }) => {
    await openGame(page);
    await expect(page.locator('#help-overlay')).toBeHidden();

    await page.locator('#help').click();
    let state = await getState(page);
    expect(state.helpOpen).toBe(true);
    expect(state.paused).toBe(true);
    await expect(page.locator('#help-close')).toBeFocused();

    await page.keyboard.press('Escape');
    state = await getState(page);
    expect(state.helpOpen).toBe(false);
    expect(state.paused).toBe(false);
    await expect(page.locator('#help')).toBeFocused();
  });

  test('closing help keeps a manually paused game paused', async ({ page }) => {
    await openGame(page);
    await page.keyboard.press('p');
    let state = await getState(page);
    expect(state.paused).toBe(true);

    await page.locator('#help').click();
    state = await getState(page);
    expect(state.helpOpen).toBe(true);

    await page.locator('#help-close').click();
    state = await getState(page);
    expect(state.helpOpen).toBe(false);
    expect(state.paused).toBe(true);
  });
});

test.describe('sound and mute', () => {
  test('mute button toggles aria-pressed and persists pong-muted across reload', async ({ page }) => {
    await openGame(page);
    const muteBtn = page.locator('#mute');
    await expect(muteBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(muteBtn).toHaveText('🔊');

    await muteBtn.click();
    await expect(muteBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(muteBtn).toHaveText('🔇');
    let stored = await page.evaluate(() => localStorage.getItem('pong-muted'));
    expect(stored).toBe('1');

    await openGame(page);
    await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'true');
    let state = await getState(page);
    expect(state.muted).toBe(true);

    await page.locator('#mute').click();
    await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'false');
    stored = await page.evaluate(() => localStorage.getItem('pong-muted'));
    expect(stored).toBe('0');
  });

  test('muted state is exposed via getState and setMuted updates it', async ({ page }) => {
    await openGame(page);
    let state = await getState(page);
    expect(state.muted).toBe(false);

    await page.evaluate(() => window.__pongTest.setMuted(true));
    state = await getState(page);
    expect(state.muted).toBe(true);
    await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'true');

    await page.evaluate(() => window.__pongTest.setMuted(false));
    state = await getState(page);
    expect(state.muted).toBe(false);
  });

  test('paddle hits, wall bounces, scoring, and winning run cleanly with sound wired', async ({ page }) => {
    await openGame(page);

    await setState(page, {
      ball: { x: 400, y: 12, dx: 150, dy: -200 },
      gameState: 'playing'
    });
    await advanceFrames(page, 4);
    let state = await getState(page);
    expect(state.ball.dy).toBeGreaterThan(0);

    await setState(page, {
      ball: { x: 60, y: 220, dx: -200, dy: 0 },
      playerPaddle: { y: 180 },
      gameState: 'playing'
    });
    await advanceFrames(page, 10);
    state = await getState(page);
    expect(state.ball.dx).toBeGreaterThan(0);

    await setState(page, {
      ball: { x: 780, y: 260, dx: 400, dy: 0 },
      aiPaddle: { y: 0 },
      gameState: 'playing'
    });
    await advanceFrames(page, 8);
    state = await getState(page);
    expect(state.playerScore).toBe(1);

    await setState(page, {
      playerScore: 6,
      aiScore: 0,
      ball: { x: 780, y: 260, dx: 400, dy: 0 },
      aiPaddle: { y: 0 },
      gameState: 'playing'
    });
    await advanceFrames(page, 8);
    state = await getState(page);
    expect(state.gameState).toBe('won');
    expect(state.winner).toBe('player');
  });
});
