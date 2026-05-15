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
    const api = window.__spaceInvadersTest;
    return (
      api &&
      api.isReady === true &&
      typeof api.getState === 'function' &&
      typeof api.setState === 'function' &&
      typeof api.advanceFrames === 'function' &&
      typeof api.setAutoStep === 'function' &&
      typeof api.restart === 'function' &&
      typeof api.getControlsState === 'function'
    );
  });
  await page.evaluate(() => window.__spaceInvadersTest.setAutoStep(false));
  await expect(page.locator('canvas')).toBeVisible();
}

async function getState(page) {
  return page.evaluate(() => window.__spaceInvadersTest.getState());
}

async function setState(page, patch) {
  await page.evaluate((p) => window.__spaceInvadersTest.setState(p), patch);
}

async function advanceFrames(page, frames) {
  await page.evaluate((n) => window.__spaceInvadersTest.advanceFrames(n), frames);
}

// ─── Initialization ──────────────────────────────────────────────────────────

test('game initializes with correct defaults', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);

  expect(state.score).toBe(0);
  expect(state.lives).toBe(3);
  expect(state.wave).toBe(1);
  expect(state.status).toBe('playing');
  expect(state.enemies.length).toBe(55);
  expect(state.enemies.filter(e => e.alive).length).toBe(55);
  expect(state.shields.length).toBe(4);
});

// ─── Player movement ─────────────────────────────────────────────────────────

test('player moves left with ArrowLeft', async ({ page }) => {
  await openGame(page);
  const before = (await getState(page)).player.x;

  await page.keyboard.down('ArrowLeft');
  await advanceFrames(page, 30);
  await page.keyboard.up('ArrowLeft');

  const after = (await getState(page)).player.x;
  expect(after).toBeLessThan(before);
});

test('player moves right with ArrowRight', async ({ page }) => {
  await openGame(page);
  const before = (await getState(page)).player.x;

  await page.keyboard.down('ArrowRight');
  await advanceFrames(page, 30);
  await page.keyboard.up('ArrowRight');

  const after = (await getState(page)).player.x;
  expect(after).toBeGreaterThan(before);
});

test('player does not move past left edge', async ({ page }) => {
  await openGame(page);
  await setState(page, { player: { x: 0 } });

  await page.keyboard.down('ArrowLeft');
  await advanceFrames(page, 10);
  await page.keyboard.up('ArrowLeft');

  const after = (await getState(page)).player.x;
  expect(after).toBeGreaterThanOrEqual(0);
});

test('player does not move past right edge', async ({ page }) => {
  await openGame(page);
  await setState(page, { player: { x: 560 } });

  await page.keyboard.down('ArrowRight');
  await advanceFrames(page, 10);
  await page.keyboard.up('ArrowRight');

  const after = (await getState(page)).player.x;
  expect(after).toBeLessThanOrEqual(560);
});

// ─── Shooting ─────────────────────────────────────────────────────────────────

test('player fires a bullet with Space', async ({ page }) => {
  await openGame(page);

  await page.keyboard.down('Space');
  await advanceFrames(page, 2);
  await page.keyboard.up('Space');

  const state = await getState(page);
  expect(state.bullets.length).toBeGreaterThan(0);
});

test('player bullet cooldown prevents rapid fire', async ({ page }) => {
  await openGame(page);

  await page.keyboard.down('Space');
  await advanceFrames(page, 1);
  await page.keyboard.up('Space');
  await page.keyboard.down('Space');
  await advanceFrames(page, 1);
  await page.keyboard.up('Space');

  const state = await getState(page);
  expect(state.bullets.length).toBe(1);
});

test('bullets move upward across frames', async ({ page }) => {
  await openGame(page);
  await setState(page, {
    bullets: [{ x: 295, y: 300 }],
    bulletCooldown: 30
  });

  await advanceFrames(page, 10);

  const state = await getState(page);
  expect(state.bullets[0].y).toBeLessThan(300);
});

test('bullets are removed when they leave the top of the screen', async ({ page }) => {
  await openGame(page);
  await setState(page, {
    bullets: [{ x: 295, y: 2 }],
    bulletCooldown: 30
  });

  await advanceFrames(page, 10);

  const state = await getState(page);
  expect(state.bullets.length).toBe(0);
});

// ─── Enemy collision ──────────────────────────────────────────────────────────

test('bullet hitting enemy kills it and adds score', async ({ page }) => {
  await openGame(page);
  const stateBefore = await getState(page);
  const target = stateBefore.enemies[stateBefore.enemies.length - 1];

  await setState(page, {
    bullets: [{ x: target.x + 8, y: target.y + 4 }],
    bulletCooldown: 30
  });

  await advanceFrames(page, 2);

  const stateAfter = await getState(page);
  const killed = stateAfter.enemies[stateAfter.enemies.length - 1];
  expect(killed.alive).toBe(false);
  expect(stateAfter.score).toBeGreaterThan(0);
});

// ─── Enemy movement ───────────────────────────────────────────────────────────

test('enemies move horizontally', async ({ page }) => {
  await openGame(page);
  const before = (await getState(page)).enemies[0].x;

  await setState(page, { enemyMoveTimer: 1 });
  await advanceFrames(page, 2);

  const after = (await getState(page)).enemies[0].x;
  expect(after).not.toBe(before);
});

test('enemies drop down when hitting the right wall', async ({ page }) => {
  await openGame(page);
  const stateBefore = await getState(page);
  const yBefore = stateBefore.enemies[0].y;

  // Push enemies so the next move will hit the right wall
  await setState(page, {
    enemyDir: 1,
    enemyDropPending: false,
    enemyMoveTimer: 1,
    enemies: stateBefore.enemies.map(e => ({ ...e, x: e.x + 520 }))
  });
  await advanceFrames(page, 1);  // triggers move that hits wall → sets dropPending
  await setState(page, { enemyMoveTimer: 1 });
  await advanceFrames(page, 1);  // next step triggers drop

  const yAfter = (await getState(page)).enemies[0].y;
  expect(yAfter).toBeGreaterThan(yBefore);
});

// ─── Player hit / lives ───────────────────────────────────────────────────────

test('enemy bullet hitting player reduces lives', async ({ page }) => {
  await openGame(page);
  const livesBefore = (await getState(page)).lives;

  await setState(page, {
    enemyBullets: [{ x: 280, y: 436 }]
  });
  await advanceFrames(page, 2);

  const livesAfter = (await getState(page)).lives;
  expect(livesAfter).toBeLessThan(livesBefore);
});

test('losing last life sets status to gameover', async ({ page }) => {
  await openGame(page);
  await setState(page, {
    lives: 1,
    enemyBullets: [{ x: 280, y: 436 }],
    deathTimer: 0
  });

  await advanceFrames(page, 2);

  const state = await getState(page);
  expect(state.status).toBe('gameover');
});

// ─── Wave progression ─────────────────────────────────────────────────────────

test('clearing all enemies advances the wave', async ({ page }) => {
  await openGame(page);
  const waveBefore = (await getState(page)).wave;

  // Kill all but one enemy, then aim a bullet at the last one
  const stateBefore = await getState(page);
  const last = stateBefore.enemies[stateBefore.enemies.length - 1];
  const killedEnemies = stateBefore.enemies.map((e, i) =>
    i < stateBefore.enemies.length - 1 ? { ...e, alive: false } : e
  );

  await setState(page, {
    enemies: killedEnemies,
    bullets: [{ x: last.x + 8, y: last.y + 4 }],
    enemyBullets: [],
    bulletCooldown: 30,
    enemyMoveTimer: 999
  });

  await advanceFrames(page, 3);

  const waveAfter = (await getState(page)).wave;
  expect(waveAfter).toBe(waveBefore + 1);
});

// ─── Screenshot tests ─────────────────────────────────────────────────────────

test('matches the desktop layout baseline', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1024 });
  await openGame(page);

  await expect(page).toHaveScreenshot('space-invaders-desktop-layout.png', {
    animations: 'disabled',
    fullPage: false,
    maxDiffPixels: 10
  });
});

test('matches the mobile layout baseline', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openGame(page);

  await expect(page).toHaveScreenshot('space-invaders-mobile-layout.png', {
    animations: 'disabled',
    fullPage: false,
    maxDiffPixels: 10
  });
});
