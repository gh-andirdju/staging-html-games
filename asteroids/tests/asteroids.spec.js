import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const runtimeErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') runtimeErrors.push(msg.text());
  });
  page.on('pageerror', (err) => runtimeErrors.push(err.message));
  page.__runtimeErrors = runtimeErrors;
});

test.afterEach(async ({ page }) => {
  expect(page.__runtimeErrors).toEqual([]);
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function openGame(page) {
  await page.goto('./');
  await page.waitForFunction(() => {
    const api = window.__asteroidsTest;
    return (
      api &&
      api.isReady === true &&
      typeof api.getState === 'function' &&
      typeof api.setState === 'function' &&
      typeof api.advanceFrames === 'function' &&
      typeof api.setAutoStep === 'function' &&
      typeof api.restart === 'function'
    );
  });
  await page.evaluate(() => window.__asteroidsTest.setAutoStep(false));
  await expect(page.locator('canvas').first()).toBeVisible();
}

async function getState(page) {
  return page.evaluate(() => window.__asteroidsTest.getState());
}

async function setState(page, s) {
  await page.evaluate((payload) => window.__asteroidsTest.setState(payload), s);
}

async function advanceFrames(page, n = 1) {
  await page.evaluate(async (count) => {
    await window.__asteroidsTest.advanceFrames(count);
  }, n);
}

async function restart(page) {
  await page.evaluate(async () => {
    await window.__asteroidsTest.restart();
  });
}

async function prepareVisualLayout(page) {
  const s = await getState(page);
  await setState(page, {
    ...s,
    ship: {
      x: 400, y: 300,
      angle: -Math.PI / 2,
      vx: 0, vy: 0,
      radius: 14,
      invincible: false,
      invincibleFrames: 0
    },
    asteroids: [
      { x: 180, y: 160, vx: 0, vy: 0, radius: 80, size: 3, seed: 3001, vertices: [] },
      { x: 620, y: 440, vx: 0, vy: 0, radius: 40, size: 2, seed: 3002, vertices: [] },
      { x: 650, y: 150, vx: 0, vy: 0, radius: 20, size: 1, seed: 3003, vertices: [] }
    ],
    bullets: [],
    particles: [],
    score: 340,
    lives: 3,
    level: 2,
    status: 'playing',
    fireCooldown: 0,
    respawnCountdown: 0
  });
  await page.locator('canvas').first().scrollIntoViewIfNeeded();
}

// ── Rendering ─────────────────────────────────────────────────────────────────

test('canvas is visible after load', async ({ page }) => {
  await openGame(page);
  await expect(page.locator('canvas#game')).toBeVisible();
});

test('test API is exposed and ready', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => window.__asteroidsTest && window.__asteroidsTest.isReady === true);
  const api = await page.evaluate(() => ({
    isReady: window.__asteroidsTest.isReady,
    hasGetState: typeof window.__asteroidsTest.getState === 'function',
    hasSetState: typeof window.__asteroidsTest.setState === 'function',
    hasAdvanceFrames: typeof window.__asteroidsTest.advanceFrames === 'function',
    hasSetAutoStep: typeof window.__asteroidsTest.setAutoStep === 'function',
    hasRestart: typeof window.__asteroidsTest.restart === 'function'
  }));
  expect(api.isReady).toBe(true);
  expect(api.hasGetState).toBe(true);
  expect(api.hasSetState).toBe(true);
  expect(api.hasAdvanceFrames).toBe(true);
  expect(api.hasSetAutoStep).toBe(true);
  expect(api.hasRestart).toBe(true);
});

// ── Screenshot tests ──────────────────────────────────────────────────────────

test('matches the desktop layout baseline', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1024 });
  await openGame(page);
  await prepareVisualLayout(page);

  await expect(page).toHaveScreenshot('asteroids-desktop-layout.png', {
    animations: 'disabled',
    fullPage: false,
    maxDiffPixels: 10
  });
});

test.describe('mobile portrait layout', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true
  });

  test('matches the mobile portrait layout baseline', async ({ page }) => {
    await openGame(page);
    await prepareVisualLayout(page);

    await expect(page).toHaveScreenshot('asteroids-mobile-layout.png', {
      animations: 'disabled',
      fullPage: false,
      maxDiffPixels: 10
    });
  });

  test('touch controls are below the canvas', async ({ page }) => {
    await openGame(page);

    const playfieldBox = await page.locator('.playfield').boundingBox();
    const controlsBox = await page.locator('.touch-controls').boundingBox();

    expect(playfieldBox).not.toBeNull();
    expect(controlsBox).not.toBeNull();
    expect(controlsBox.y).toBeGreaterThanOrEqual(playfieldBox.y + playfieldBox.height - 1);
  });
});

// ── HUD ───────────────────────────────────────────────────────────────────────

test('HUD shows correct initial values', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);

  await expect(page.locator('#hud-score')).toHaveText(String(state.score));
  await expect(page.locator('#hud-lives')).toHaveText(String(state.lives));
  await expect(page.locator('#hud-level')).toHaveText(String(state.level));
});

// ── Controls — keyboard ───────────────────────────────────────────────────────

test('left arrow rotates ship counter-clockwise', async ({ page }) => {
  await openGame(page);
  const before = await getState(page);
  const angleBefore = before.ship.angle;

  await page.keyboard.down('ArrowLeft');
  await advanceFrames(page, 5);
  await page.keyboard.up('ArrowLeft');

  const after = await getState(page);
  expect(after.ship.angle).toBeLessThan(angleBefore);
});

test('right arrow rotates ship clockwise', async ({ page }) => {
  await openGame(page);
  const before = await getState(page);
  const angleBefore = before.ship.angle;

  await page.keyboard.down('ArrowRight');
  await advanceFrames(page, 5);
  await page.keyboard.up('ArrowRight');

  const after = await getState(page);
  expect(after.ship.angle).toBeGreaterThan(angleBefore);
});

test('up arrow applies thrust in the facing direction', async ({ page }) => {
  await openGame(page);
  const s = await getState(page);
  // Point ship straight right (angle=0)
  await setState(page, { ...s, ship: { ...s.ship, angle: 0, vx: 0, vy: 0 } });

  await page.keyboard.down('ArrowUp');
  await advanceFrames(page, 4);
  await page.keyboard.up('ArrowUp');

  const after = await getState(page);
  expect(after.ship.vx).toBeGreaterThan(0);
  expect(Math.abs(after.ship.vy)).toBeLessThan(Math.abs(after.ship.vx));
});

test('space key fires a bullet', async ({ page }) => {
  await openGame(page);
  const s = await getState(page);
  await setState(page, { ...s, bullets: [], fireCooldown: 0 });

  await page.keyboard.down('Space');
  await advanceFrames(page, 1);
  await page.keyboard.up('Space');

  const after = await getState(page);
  expect(after.bullets.length).toBeGreaterThan(0);
});

test('R key restarts game from game over', async ({ page }) => {
  await openGame(page);
  const s = await getState(page);
  await setState(page, { ...s, status: 'gameOver', lives: 0, score: 999 });

  await page.keyboard.press('r');
  await advanceFrames(page, 1);

  const after = await getState(page);
  expect(after.status).toBe('playing');
  expect(after.score).toBe(0);
  expect(after.lives).toBe(3);
});

// ── Controls — touch ──────────────────────────────────────────────────────────

test('rotate-left touch button rotates ship counter-clockwise', async ({ page }) => {
  await openGame(page);
  const before = await getState(page);
  const angleBefore = before.ship.angle;

  await page.locator('#rotate-left').dispatchEvent('pointerdown');
  await advanceFrames(page, 5);
  await page.locator('#rotate-left').dispatchEvent('pointerup');

  const after = await getState(page);
  expect(after.ship.angle).toBeLessThan(angleBefore);
});

test('rotate-right touch button rotates ship clockwise', async ({ page }) => {
  await openGame(page);
  const before = await getState(page);
  const angleBefore = before.ship.angle;

  await page.locator('#rotate-right').dispatchEvent('pointerdown');
  await advanceFrames(page, 5);
  await page.locator('#rotate-right').dispatchEvent('pointerup');

  const after = await getState(page);
  expect(after.ship.angle).toBeGreaterThan(angleBefore);
});

test('thrust touch button accelerates ship', async ({ page }) => {
  await openGame(page);
  const s = await getState(page);
  await setState(page, { ...s, ship: { ...s.ship, angle: 0, vx: 0, vy: 0 } });

  await page.locator('#thrust').dispatchEvent('pointerdown');
  await advanceFrames(page, 4);
  await page.locator('#thrust').dispatchEvent('pointerup');

  const after = await getState(page);
  const speed = Math.sqrt(after.ship.vx ** 2 + after.ship.vy ** 2);
  expect(speed).toBeGreaterThan(0);
});

test('fire touch button fires a bullet', async ({ page }) => {
  await openGame(page);
  const s = await getState(page);
  await setState(page, { ...s, bullets: [], fireCooldown: 0 });

  await page.locator('#fire').dispatchEvent('pointerdown');
  await advanceFrames(page, 1);
  await page.locator('#fire').dispatchEvent('pointerup');

  const after = await getState(page);
  expect(after.bullets.length).toBeGreaterThan(0);
});

// ── Physics ───────────────────────────────────────────────────────────────────

test('ship moves forward after thrust', async ({ page }) => {
  await openGame(page);
  const s = await getState(page);
  await setState(page, {
    ...s,
    ship: { ...s.ship, x: 400, y: 300, angle: 0, vx: 0, vy: 0, invincible: true, invincibleFrames: 999 }
  });

  await page.keyboard.down('ArrowUp');
  await advanceFrames(page, 10);
  await page.keyboard.up('ArrowUp');

  const after = await getState(page);
  expect(after.ship.x).toBeGreaterThan(400);
});

test('ship wraps from right edge to left edge', async ({ page }) => {
  await openGame(page);
  const s = await getState(page);
  await setState(page, {
    ...s,
    ship: { ...s.ship, x: 798, y: 300, angle: 0, vx: 8, vy: 0, invincible: true, invincibleFrames: 999 },
    asteroids: []
  });

  await advanceFrames(page, 1);

  const after = await getState(page);
  expect(after.ship.x).toBeLessThan(20);
});

test('ship wraps from bottom edge to top edge', async ({ page }) => {
  await openGame(page);
  const s = await getState(page);
  await setState(page, {
    ...s,
    ship: { ...s.ship, x: 400, y: 598, angle: Math.PI / 2, vx: 0, vy: 8, invincible: true, invincibleFrames: 999 },
    asteroids: []
  });

  await advanceFrames(page, 1);

  const after = await getState(page);
  expect(after.ship.y).toBeLessThan(20);
});

test('bullet travels forward and expires after its lifetime', async ({ page }) => {
  await openGame(page);
  const s = await getState(page);
  await setState(page, {
    ...s,
    bullets: [{ x: 400, y: 300, vx: 10, vy: 0, life: 3 }],
    asteroids: []
  });

  await advanceFrames(page, 1);
  const mid = await getState(page);
  expect(mid.bullets.length).toBe(1);
  expect(mid.bullets[0].x).toBeGreaterThan(400);

  // life: 3 → after 2 more frames (3 total) life reaches 0 and bullet is removed
  await advanceFrames(page, 2);
  const gone = await getState(page);
  expect(gone.bullets.length).toBe(0);
});

test('asteroid moves each frame', async ({ page }) => {
  await openGame(page);
  const s = await getState(page);
  await setState(page, {
    ...s,
    asteroids: [{ x: 200, y: 200, vx: 2, vy: 1, radius: 80, size: 3, seed: 999, vertices: [] }]
  });

  const before = await getState(page);
  await advanceFrames(page, 3);
  const after = await getState(page);

  expect(after.asteroids[0].x).not.toBe(before.asteroids[0].x);
});

// ── Collisions ────────────────────────────────────────────────────────────────

test('bullet hitting a large asteroid splits it into two medium ones', async ({ page }) => {
  await openGame(page);
  const s = await getState(page);
  await setState(page, {
    ...s,
    ship: { ...s.ship, invincible: true, invincibleFrames: 999 },
    asteroids: [{ x: 400, y: 200, vx: 0, vy: 0, radius: 80, size: 3, seed: 5001, vertices: [] }],
    bullets: [{ x: 400, y: 200, vx: 0, vy: 0, life: 10 }],
    score: 0
  });

  await advanceFrames(page, 1);

  const after = await getState(page);
  expect(after.asteroids.length).toBe(2);
  expect(after.asteroids.every(a => a.size === 2)).toBe(true);
  expect(after.score).toBe(20);
});

test('bullet hitting a small asteroid removes it entirely', async ({ page }) => {
  await openGame(page);
  const s = await getState(page);
  await setState(page, {
    ...s,
    ship: { ...s.ship, invincible: true, invincibleFrames: 999 },
    asteroids: [
      { x: 400, y: 200, vx: 0, vy: 0, radius: 20, size: 1, seed: 5002, vertices: [] },
      { x: 100, y: 100, vx: 0, vy: 0, radius: 80, size: 3, seed: 5099, vertices: [] }
    ],
    bullets: [{ x: 400, y: 200, vx: 0, vy: 0, life: 10 }],
    score: 0
  });

  await advanceFrames(page, 1);

  const after = await getState(page);
  // Size-1 asteroid destroyed (no fragments); size-3 background asteroid remains
  expect(after.asteroids.length).toBe(1);
  expect(after.asteroids[0].size).toBe(3);
  expect(after.score).toBe(100);
});

test('score increases when asteroid is destroyed', async ({ page }) => {
  await openGame(page);
  const s = await getState(page);
  await setState(page, {
    ...s,
    ship: { ...s.ship, invincible: true, invincibleFrames: 999 },
    asteroids: [{ x: 300, y: 300, vx: 0, vy: 0, radius: 40, size: 2, seed: 5003, vertices: [] }],
    bullets: [{ x: 300, y: 300, vx: 0, vy: 0, life: 10 }],
    score: 0
  });

  await advanceFrames(page, 1);

  const after = await getState(page);
  expect(after.score).toBe(50);
});

test('ship colliding with asteroid loses a life', async ({ page }) => {
  await openGame(page);
  const s = await getState(page);
  await setState(page, {
    ...s,
    ship: { x: 400, y: 300, angle: 0, vx: 0, vy: 0, radius: 14, invincible: false, invincibleFrames: 0 },
    asteroids: [{ x: 404, y: 300, vx: 0, vy: 0, radius: 20, size: 1, seed: 6001, vertices: [] }],
    bullets: [],
    lives: 3,
    status: 'playing'
  });

  await advanceFrames(page, 1);

  const after = await getState(page);
  expect(after.lives).toBe(2);
  expect(after.status === 'dead' || after.status === 'gameOver').toBe(true);
});

test('invincible ship does not lose a life on asteroid contact', async ({ page }) => {
  await openGame(page);
  const s = await getState(page);
  await setState(page, {
    ...s,
    ship: { x: 400, y: 300, angle: 0, vx: 0, vy: 0, radius: 14, invincible: true, invincibleFrames: 180 },
    asteroids: [{ x: 404, y: 300, vx: 0, vy: 0, radius: 20, size: 1, seed: 6002, vertices: [] }],
    bullets: [],
    lives: 3,
    status: 'playing'
  });

  await advanceFrames(page, 1);

  const after = await getState(page);
  expect(after.lives).toBe(3);
  expect(after.status).toBe('playing');
});

// ── Progression ───────────────────────────────────────────────────────────────

test('game over when lives reach zero', async ({ page }) => {
  await openGame(page);
  const s = await getState(page);
  await setState(page, {
    ...s,
    ship: { x: 400, y: 300, angle: 0, vx: 0, vy: 0, radius: 14, invincible: false, invincibleFrames: 0 },
    asteroids: [{ x: 404, y: 300, vx: 0, vy: 0, radius: 20, size: 1, seed: 7001, vertices: [] }],
    bullets: [],
    lives: 1,
    status: 'playing'
  });

  await advanceFrames(page, 1);

  const after = await getState(page);
  expect(after.lives).toBe(0);
  expect(after.status).toBe('gameOver');
});

test('restart resets score, lives, and level', async ({ page }) => {
  await openGame(page);
  const s = await getState(page);
  await setState(page, { ...s, score: 5000, lives: 0, level: 7, status: 'gameOver' });

  await restart(page);

  const after = await getState(page);
  expect(after.score).toBe(0);
  expect(after.lives).toBe(3);
  expect(after.level).toBe(1);
  expect(after.status).toBe('playing');
});

test('clearing all asteroids advances the level', async ({ page }) => {
  await openGame(page);
  const s = await getState(page);
  await setState(page, {
    ...s,
    ship: { ...s.ship, invincible: true, invincibleFrames: 999 },
    asteroids: [{ x: 400, y: 200, vx: 0, vy: 0, radius: 20, size: 1, seed: 8001, vertices: [] }],
    bullets: [{ x: 400, y: 200, vx: 0, vy: 0, life: 10 }],
    level: 1,
    status: 'playing'
  });

  await advanceFrames(page, 1);

  const after = await getState(page);
  expect(after.level).toBe(2);
  expect(after.asteroids.length).toBeGreaterThan(0);
});

// ── HUD updates ───────────────────────────────────────────────────────────────

test('HUD score updates after asteroid is destroyed', async ({ page }) => {
  await openGame(page);
  const s = await getState(page);
  await setState(page, {
    ...s,
    ship: { ...s.ship, invincible: true, invincibleFrames: 999 },
    asteroids: [{ x: 400, y: 200, vx: 0, vy: 0, radius: 20, size: 1, seed: 9001, vertices: [] }],
    bullets: [{ x: 400, y: 200, vx: 0, vy: 0, life: 10 }],
    score: 0
  });

  await advanceFrames(page, 1);

  await expect(page.locator('#hud-score')).toHaveText('100');
});

test('HUD lives decrements after ship is hit', async ({ page }) => {
  await openGame(page);
  const s = await getState(page);
  await setState(page, {
    ...s,
    ship: { x: 400, y: 300, angle: 0, vx: 0, vy: 0, radius: 14, invincible: false, invincibleFrames: 0 },
    asteroids: [{ x: 404, y: 300, vx: 0, vy: 0, radius: 20, size: 1, seed: 9002, vertices: [] }],
    bullets: [],
    lives: 3,
    status: 'playing'
  });

  await advanceFrames(page, 1);

  await expect(page.locator('#hud-lives')).toHaveText('2');
});

test('HUD level updates when wave is cleared', async ({ page }) => {
  await openGame(page);
  const s = await getState(page);
  await setState(page, {
    ...s,
    ship: { ...s.ship, invincible: true, invincibleFrames: 999 },
    asteroids: [{ x: 400, y: 200, vx: 0, vy: 0, radius: 20, size: 1, seed: 9003, vertices: [] }],
    bullets: [{ x: 400, y: 200, vx: 0, vy: 0, life: 10 }],
    level: 3,
    status: 'playing'
  });

  await advanceFrames(page, 1);

  await expect(page.locator('#hud-level')).toHaveText('4');
});

// ── Fire cooldown ─────────────────────────────────────────────────────────────

test('fire cooldown prevents rapid bullet creation', async ({ page }) => {
  await openGame(page);
  const s = await getState(page);
  await setState(page, { ...s, bullets: [], fireCooldown: 0 });

  // Fire once — creates a bullet and starts cooldown
  await page.keyboard.down('Space');
  await advanceFrames(page, 1);
  const after1 = await getState(page);
  expect(after1.bullets.length).toBe(1);
  expect(after1.fireCooldown).toBeGreaterThan(0);

  // Holding space down for cooldown duration should not create a second bullet yet
  await advanceFrames(page, 3);
  const after2 = await getState(page);
  expect(after2.bullets.length).toBe(1);

  await page.keyboard.up('Space');
});

// ── Respawn sequence ──────────────────────────────────────────────────────────

test('ship respawns to playing after RESPAWN_FRAMES frames in dead state', async ({ page }) => {
  await openGame(page);
  const s = await getState(page);
  await setState(page, {
    ...s,
    status: 'dead',
    respawnCountdown: 3,
    lives: 2
  });

  await advanceFrames(page, 3);

  const after = await getState(page);
  expect(after.status).toBe('playing');
  expect(after.ship).toBeTruthy();
  expect(after.ship.invincible).toBe(true);
});

// ── Game over halts simulation ────────────────────────────────────────────────

test('advancing frames after game over does not change score or asteroids', async ({ page }) => {
  await openGame(page);
  const s = await getState(page);
  await setState(page, {
    ...s,
    status: 'gameOver',
    lives: 0,
    score: 1234,
    asteroids: [{ x: 400, y: 200, vx: 2, vy: 0, radius: 20, size: 1, seed: 7777, vertices: [] }]
  });

  await advanceFrames(page, 10);

  const after = await getState(page);
  expect(after.score).toBe(1234);
  expect(after.asteroids.length).toBe(1);
});

// ── Pause ─────────────────────────────────────────────────────────────────────

test('pressing P pauses and freezes ship, asteroids, bullets, and invincibility', async ({ page }) => {
  await openGame(page);
  const s = await getState(page);
  await setState(page, {
    ...s,
    ship: { x: 400, y: 300, angle: 0, vx: 2, vy: 1, radius: 14, invincible: true, invincibleFrames: 120 },
    asteroids: [{ x: 200, y: 200, vx: 2, vy: 1, radius: 80, size: 3, seed: 4001, vertices: [] }],
    bullets: [{ x: 600, y: 300, vx: 5, vy: 0, life: 30 }],
    status: 'playing'
  });

  await page.keyboard.press('p');
  const before = await getState(page);
  expect(before.paused).toBe(true);
  await expect(page.locator('#hud-status')).toHaveText('Paused');

  await advanceFrames(page, 10);

  const after = await getState(page);
  expect(after.ship.x).toBe(before.ship.x);
  expect(after.ship.y).toBe(before.ship.y);
  expect(after.ship.invincibleFrames).toBe(before.ship.invincibleFrames);
  expect(after.asteroids[0].x).toBe(before.asteroids[0].x);
  expect(after.asteroids[0].y).toBe(before.asteroids[0].y);
  expect(after.bullets[0].x).toBe(before.bullets[0].x);
  expect(after.bullets[0].life).toBe(before.bullets[0].life);
});

test('pressing P again resumes the simulation', async ({ page }) => {
  await openGame(page);
  const s = await getState(page);
  await setState(page, {
    ...s,
    asteroids: [{ x: 200, y: 200, vx: 2, vy: 1, radius: 80, size: 3, seed: 4002, vertices: [] }],
    status: 'playing'
  });

  await page.keyboard.press('p');
  const before = await getState(page);

  await page.keyboard.press('p');
  let after = await getState(page);
  expect(after.paused).toBe(false);
  await expect(page.locator('#hud-status')).toHaveText('Playing');

  await advanceFrames(page, 5);
  after = await getState(page);
  expect(after.asteroids[0].x).not.toBe(before.asteroids[0].x);
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

test('pressing R while paused restarts the game unpaused', async ({ page }) => {
  await openGame(page);
  const s = await getState(page);
  await setState(page, { ...s, score: 740, level: 3, status: 'playing' });

  await page.keyboard.press('p');
  let state = await getState(page);
  expect(state.paused).toBe(true);

  await page.keyboard.press('r');
  state = await getState(page);
  expect(state.paused).toBe(false);
  expect(state.score).toBe(0);
  expect(state.level).toBe(1);
  expect(state.status).toBe('playing');
});

// ── Bullet edge wrapping ──────────────────────────────────────────────────────

test('bullet wraps from right edge to left edge', async ({ page }) => {
  await openGame(page);
  const s = await getState(page);
  await setState(page, {
    ...s,
    ship: { ...s.ship, invincible: true, invincibleFrames: 999 },
    asteroids: [],
    bullets: [{ x: 798, y: 300, vx: 8, vy: 0, life: 10 }]
  });

  await advanceFrames(page, 1);

  const after = await getState(page);
  expect(after.bullets.length).toBe(1);
  expect(after.bullets[0].x).toBeLessThan(20);
});
