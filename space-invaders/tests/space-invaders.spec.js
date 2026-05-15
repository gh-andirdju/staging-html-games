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
  expect(state.enemies.length).toBe(55); // 5 rows × 11 cols
  expect(state.enemies.filter(e => e.alive).length).toBe(55);
  expect(state.shields.length).toBe(4);
  expect(state.enemyDir).toBe(1);
});

// ─── Player movement ─────────────────────────────────────────────────────────

test('player moves left with ArrowLeft', async ({ page }) => {
  await openGame(page);
  const before = (await getState(page)).player.x;

  await page.keyboard.down('ArrowLeft');
  const frames = 30;
  await advanceFrames(page, frames);
  await page.keyboard.up('ArrowLeft');

  // PLAYER_SPEED=220 px/s, FIXED_DT=1/60 → 220/60*30 = 110 px
  const expectedDelta = (220 / 60) * frames;
  const after = (await getState(page)).player.x;
  expect(before - after).toBeCloseTo(expectedDelta, 0);
});

test('player moves right with ArrowRight', async ({ page }) => {
  await openGame(page);
  const before = (await getState(page)).player.x;

  await page.keyboard.down('ArrowRight');
  const frames = 30;
  await advanceFrames(page, frames);
  await page.keyboard.up('ArrowRight');

  // PLAYER_SPEED=220 px/s, FIXED_DT=1/60 → 220/60*30 = 110 px
  const expectedDelta = (220 / 60) * frames;
  const after = (await getState(page)).player.x;
  expect(after - before).toBeCloseTo(expectedDelta, 0);
});

test('holding both arrow keys simultaneously does not move the player', async ({ page }) => {
  await openGame(page);
  const before = (await getState(page)).player.x;

  await page.keyboard.down('ArrowLeft');
  await page.keyboard.down('ArrowRight');
  await advanceFrames(page, 10);
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.up('ArrowRight');

  const after = (await getState(page)).player.x;
  expect(after).toBe(before);
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
  // max valid x = WIDTH - PLAYER_WIDTH = 600 - 40 = 560
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

  // Fire once; BULLET_COOLDOWN=30 means a second press within 30 frames is ignored
  await page.keyboard.down('Space');
  await advanceFrames(page, 1);
  await page.keyboard.up('Space');
  await page.keyboard.down('Space');
  await advanceFrames(page, 1);
  await page.keyboard.up('Space');

  const state = await getState(page);
  expect(state.bullets.length).toBe(1);
});

test('bullets move upward at the correct speed', async ({ page }) => {
  await openGame(page);
  const startY = 300;
  await setState(page, {
    bullets: [{ x: 295, y: startY }],
    bulletCooldown: 30
  });

  const frames = 10;
  await advanceFrames(page, frames);

  // BULLET_SPEED=380 px/s, FIXED_DT=1/60 s → 380/60*10 ≈ 63.33 px per 10 frames
  const expectedY = startY - (380 / 60) * frames;
  const state = await getState(page);
  expect(state.bullets[0].y).toBeCloseTo(expectedY, 1);
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

test('bullet hitting enemy kills it and removes the bullet', async ({ page }) => {
  await openGame(page);
  const stateBefore = await getState(page);
  // Target bottom-right enemy (last in array, row 4, lowest score row)
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
  expect(stateAfter.bullets.length).toBe(0); // bullet is consumed on hit
});

test('bullet hitting a middle-row enemy scores correctly', async ({ page }) => {
  await openGame(page);
  const stateBefore = await getState(page);
  // Row 2 enemy (mid-type, worth 20 points per SCORE_BY_ROW)
  const midEnemy = stateBefore.enemies.find(e => e.row === 2);

  await setState(page, {
    bullets: [{ x: midEnemy.x + 8, y: midEnemy.y + 4 }],
    bulletCooldown: 30
  });

  await advanceFrames(page, 2);

  const stateAfter = await getState(page);
  expect(stateAfter.score).toBe(20);
});

// ─── Enemy movement ───────────────────────────────────────────────────────────

test('enemies move horizontally', async ({ page }) => {
  await openGame(page);
  const before = (await getState(page)).enemies[0].x;

  // Ensure direction is right so movement is predictable
  await setState(page, { enemyDir: 1, enemyMoveTimer: 1 });
  await advanceFrames(page, 2);

  const after = (await getState(page)).enemies[0].x;
  expect(after).not.toBe(before);
});

test('enemies drop down when hitting the right wall', async ({ page }) => {
  await openGame(page);
  const stateBefore = await getState(page);
  const yBefore = stateBefore.enemies[0].y;

  // Shift enemies +520 px right so the next rightward step hits the wall.
  // ENEMY_START_X(40) + 10*col_spacing(46) + ENEMY_W(32) + 520 ≈ wall edge.
  await setState(page, {
    enemyDir: 1,
    enemyDropPending: false,
    enemyMoveTimer: 1,
    enemies: stateBefore.enemies.map(e => ({ ...e, x: e.x + 520 }))
  });
  await advanceFrames(page, 1); // move hits wall → sets dropPending
  await setState(page, { enemyMoveTimer: 1 });
  await advanceFrames(page, 1); // next tick executes the drop

  const yAfter = (await getState(page)).enemies[0].y;
  expect(yAfter).toBeGreaterThan(yBefore);
});

// ─── Player hit / lives ───────────────────────────────────────────────────────

test('enemy bullet hitting player reduces lives and sets death timer', async ({ page }) => {
  await openGame(page);
  const livesBefore = (await getState(page)).lives;

  // Place bullet overlapping the player position (player is centered at x≈280, PLAYER_Y=440)
  await setState(page, {
    enemyBullets: [{ x: 280, y: 436 }]
  });
  // One frame: bullet moves into player → hit, deathTimer set, step returns early
  await advanceFrames(page, 1);

  const stateAfter = await getState(page);
  expect(stateAfter.lives).toBeLessThan(livesBefore);
  expect(stateAfter.deathTimer).toBe(60); // DEATH_TIMER_FRAMES = 60
  expect(stateAfter.bullets.length).toBe(0); // player bullets cleared on hit
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

test('enemy reaching player y position triggers game over', async ({ page }) => {
  await openGame(page);
  const stateBefore = await getState(page);
  // PLAYER_Y = HEIGHT - 40 = 440; enemy hits when y + ENEMY_H >= PLAYER_Y
  const movedEnemies = stateBefore.enemies.map((e, i) =>
    i === 0 ? { ...e, y: 440 } : e
  );
  await setState(page, { enemies: movedEnemies, enemyMoveTimer: 999 });

  await advanceFrames(page, 2);

  const state = await getState(page);
  expect(state.status).toBe('gameover');
});

test('player bullet degrades a shield cell', async ({ page }) => {
  await openGame(page);
  const stateBefore = await getState(page);
  const sh = stateBefore.shields[0];
  const hpBefore = sh.cells[0]; // should be 3

  // Keep one enemy alive so the win condition doesn't rebuild shields mid-test
  const oneAlive = stateBefore.enemies.map((e, i) =>
    i === 0 ? { ...e, x: 0, y: 0, alive: true } : { ...e, alive: false }
  );
  // Bullet starts just inside the shield cell (travels up into cell 0)
  await setState(page, {
    bullets: [{ x: sh.x + 2, y: sh.y + 5 }],
    enemies: oneAlive,
    bulletCooldown: 30,
    enemyMoveTimer: 999,
    enemyFireTimer: 999,
    deathTimer: 0
  });
  await advanceFrames(page, 4);

  const stateAfter = await getState(page);
  expect(stateAfter.shields[0].cells[0]).toBeLessThan(hpBefore);
});

test('player cannot fire bullets when game is over', async ({ page }) => {
  await openGame(page);
  await setState(page, { status: 'gameover' });

  await page.keyboard.down('Space');
  await advanceFrames(page, 2);
  await page.keyboard.up('Space');

  const state = await getState(page);
  expect(state.bullets.length).toBe(0);
});

test('a destroyed shield cell (HP 0) does not stop bullets', async ({ page }) => {
  await openGame(page);
  const stateBefore = await getState(page);
  const sh = stateBefore.shields[0];

  // Set cell 0 to HP 0 (destroyed) and keep one enemy alive so wave doesn't reset
  const destroyedShields = stateBefore.shields.map((s, si) =>
    si === 0 ? { ...s, cells: s.cells.map((c, ci) => ci === 0 ? 0 : c) } : s
  );
  const oneAlive = stateBefore.enemies.map((e, i) =>
    i === 0 ? { ...e, x: 0, y: 0, alive: true } : { ...e, alive: false }
  );
  // Bullet aimed at the destroyed cell
  await setState(page, {
    bullets: [{ x: sh.x + 2, y: sh.y + 5 }],
    shields: destroyedShields,
    enemies: oneAlive,
    bulletCooldown: 30,
    enemyMoveTimer: 999,
    enemyFireTimer: 999,
    deathTimer: 0
  });
  await advanceFrames(page, 4);

  const stateAfter = await getState(page);
  // Bullet should pass through the destroyed cell (not blocked); cell stays at 0
  expect(stateAfter.shields[0].cells[0]).toBe(0);
});

// ─── Enemy fire ───────────────────────────────────────────────────────────────

test('enemy fires a bullet from the correct position', async ({ page }) => {
  await openGame(page);
  const stateBefore = await getState(page);

  // Force the fire timer to trigger on the next frame
  await setState(page, { enemyFireTimer: 1, rngSeed: 12345 });
  await advanceFrames(page, 1);

  const stateAfter = await getState(page);
  expect(stateAfter.enemyBullets.length).toBeGreaterThan(0);

  // Bullet must originate within the horizontal bounds of the enemy grid
  const b = stateAfter.enemyBullets[0];
  const minX = stateBefore.enemies[0].x;
  const maxX = stateBefore.enemies[stateBefore.enemies.length - 1].x + 32; // ENEMY_W
  expect(b.x).toBeGreaterThanOrEqual(minX);
  expect(b.x).toBeLessThanOrEqual(maxX);
  // Bullet must start at or below the top enemy row
  expect(b.y).toBeGreaterThan(stateBefore.enemies[0].y);
});

// ─── Wave progression ─────────────────────────────────────────────────────────

test('clearing all enemies advances the wave and resets direction', async ({ page }) => {
  await openGame(page);
  const stateBefore = await getState(page);
  const waveBefore = stateBefore.wave;

  const last = stateBefore.enemies[stateBefore.enemies.length - 1];
  const killedEnemies = stateBefore.enemies.map((e, i) =>
    i < stateBefore.enemies.length - 1 ? { ...e, alive: false } : e
  );

  await setState(page, {
    enemies: killedEnemies,
    bullets: [{ x: last.x + 8, y: last.y + 4 }],
    enemyBullets: [],
    bulletCooldown: 30,
    enemyMoveTimer: 999,
    // Flip direction so we can verify it resets to 1 on new wave
    enemyDir: -1
  });

  await advanceFrames(page, 3);

  const waveAfter = await getState(page);
  expect(waveAfter.wave).toBe(waveBefore + 1);
  expect(waveAfter.enemyDir).toBe(1); // always resets to moving right
  expect(waveAfter.enemyDropPending).toBe(false);
  expect(waveAfter.enemies.filter(e => e.alive).length).toBe(55); // full grid spawned
  // Row types must match initial layout: row 0 = type 2, rows 1-2 = type 1, rows 3-4 = type 0
  expect(waveAfter.enemies.filter(e => e.row === 0).every(e => e.type === 2)).toBe(true);
  expect(waveAfter.enemies.filter(e => e.row === 1 || e.row === 2).every(e => e.type === 1)).toBe(true);
  expect(waveAfter.enemies.filter(e => e.row >= 3).every(e => e.type === 0)).toBe(true);
  // New wave enemies must start at ENEMY_START_Y = 60
  expect(waveAfter.enemies[0].y).toBe(60);
});

test('shields reset to full health when a new wave starts', async ({ page }) => {
  await openGame(page);

  const stateBefore = await getState(page);
  const last = stateBefore.enemies[stateBefore.enemies.length - 1];
  const killedEnemies = stateBefore.enemies.map((e, i) =>
    i < stateBefore.enemies.length - 1 ? { ...e, alive: false } : e
  );
  const damagedShields = stateBefore.shields.map((sh, si) =>
    si === 0 ? { ...sh, cells: sh.cells.map((c, ci) => ci === 0 ? 1 : c) } : sh
  );

  await setState(page, {
    enemies: killedEnemies,
    shields: damagedShields,
    bullets: [{ x: last.x + 8, y: last.y + 4 }],
    enemyBullets: [],
    bulletCooldown: 30,
    enemyMoveTimer: 999
  });

  await advanceFrames(page, 3);

  const stateAfter = await getState(page);
  expect(stateAfter.wave).toBe(stateBefore.wave + 1);
  expect(stateAfter.shields[0].cells[0]).toBe(3);
});

// ─── Screenshot tests ─────────────────────────────────────────────────────────

test('matches the desktop layout baseline', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1024 });
  await openGame(page);
  // Restart to guarantee a fully deterministic initial state for the snapshot
  await page.evaluate(() => window.__spaceInvadersTest.restart());

  await expect(page).toHaveScreenshot('space-invaders-desktop-layout.png', {
    animations: 'disabled',
    fullPage: false,
    maxDiffPixels: 10
  });
});

test('matches the mobile layout baseline', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openGame(page);
  // Restart to guarantee a fully deterministic initial state for the snapshot
  await page.evaluate(() => window.__spaceInvadersTest.restart());

  await expect(page).toHaveScreenshot('space-invaders-mobile-layout.png', {
    animations: 'disabled',
    fullPage: false,
    maxDiffPixels: 10
  });
});
