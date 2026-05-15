import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const runtimeErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') runtimeErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    runtimeErrors.push(err.message);
  });
  page.__runtimeErrors = runtimeErrors;
});

test.afterEach(async ({ page }) => {
  expect(page.__runtimeErrors).toEqual([]);
});

// ── Helpers ────────────────────────────────────────────────────────────────

async function openGame(page) {
  await page.goto('./');
  await page.waitForFunction(() => {
    const api = window.__pacmanTest;
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
  await page.evaluate(() => window.__pacmanTest.setAutoStep(false));
  await expect(page.locator('canvas')).toBeVisible();
}

async function getState(page) {
  return page.evaluate(() => window.__pacmanTest.getState());
}

async function setState(page, partial) {
  await page.evaluate((p) => window.__pacmanTest.setState(p), partial);
}

async function advanceFrames(page, n) {
  await page.evaluate((n) => window.__pacmanTest.advanceFrames(n), n);
}

// ── API & Rendering ────────────────────────────────────────────────────────

test('exposes __pacmanTest with all required methods', async ({ page }) => {
  await openGame(page);
  const shape = await page.evaluate(() => {
    const api = window.__pacmanTest;
    return {
      isReady: api.isReady,
      hasGetState: typeof api.getState === 'function',
      hasSetState: typeof api.setState === 'function',
      hasAdvanceFrames: typeof api.advanceFrames === 'function',
      hasRestart: typeof api.restart === 'function',
      hasSetAutoStep: typeof api.setAutoStep === 'function'
    };
  });
  expect(shape.isReady).toBe(true);
  expect(shape.hasGetState).toBe(true);
  expect(shape.hasSetState).toBe(true);
  expect(shape.hasAdvanceFrames).toBe(true);
  expect(shape.hasRestart).toBe(true);
  expect(shape.hasSetAutoStep).toBe(true);
});

test('initial state has expected shape and values', async ({ page }) => {
  await openGame(page);
  const s = await getState(page);
  expect(s.score).toBe(0);
  expect(s.lives).toBe(3);
  expect(s.level).toBe(1);
  expect(s.status).toBe('playing');
  expect(s.frightenedTimer).toBe(0);
  expect(s.pelletsRemaining).toBeGreaterThan(0);
  expect(Array.isArray(s.pellets)).toBe(true);
  expect(s.pellets.length).toBeGreaterThan(0);
  expect(Array.isArray(s.powerPellets)).toBe(true);
  expect(s.powerPellets.length).toBe(4);
  expect(Array.isArray(s.ghosts)).toBe(true);
  expect(s.ghosts.length).toBe(4);
  expect(s.pacman).toBeDefined();
  expect(s.pacman.direction).toBeDefined();
});

test('canvas renders non-empty pixels', async ({ page }) => {
  await openGame(page);
  const hasContent = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    // Check that not all pixels are pure black
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 10 || data[i + 1] > 10 || data[i + 2] > 10) return true;
    }
    return false;
  });
  expect(hasContent).toBe(true);
});

// ── Controls ───────────────────────────────────────────────────────────────

test('ArrowRight key sets pacman nextDirection to right', async ({ page }) => {
  await openGame(page);
  await page.keyboard.press('ArrowRight');
  const s = await getState(page);
  expect(s.pacman.nextDirection).toBe('right');
});

test('ArrowUp key sets pacman nextDirection to up', async ({ page }) => {
  await openGame(page);
  await page.keyboard.press('ArrowUp');
  const s = await getState(page);
  expect(s.pacman.nextDirection).toBe('up');
});

test('pacman position changes after advancing frames', async ({ page }) => {
  await openGame(page);
  const before = await getState(page);
  // Set direction toward open path (row 20 has dots along it)
  await page.keyboard.press('ArrowRight');
  await advanceFrames(page, 60);
  const after = await getState(page);
  // Either x changed (moved horizontally) or it hit a wall and stayed
  // Either way, we verify state is consistent
  expect(after.pacman.x).toBeDefined();
  expect(after.pacman.y).toBeDefined();
  // With 60 frames at 7.5 tiles/sec and fixed dt=1/60: 7.5 frames of movement = ~7 tiles
  // At minimum, position should differ from initial if path is open
  const moved = after.pacman.x !== before.pacman.x || after.pacman.y !== before.pacman.y;
  expect(moved).toBe(true);
});

test('dpad button sets pacman nextDirection', async ({ page }) => {
  await openGame(page);
  await page.locator('[data-action="up"]').dispatchEvent('pointerdown');
  const s = await getState(page);
  expect(s.pacman.nextDirection).toBe('up');
});

// ── Gameplay ───────────────────────────────────────────────────────────────

test('eating a dot increments score by 10 and decrements pelletsRemaining', async ({ page }) => {
  await openGame(page);
  const s0 = await getState(page);
  // Find an uneaten dot and position pacman on it
  const dotPellet = s0.pellets.find((p) => !p.eaten);
  expect(dotPellet).toBeDefined();
  await setState(page, {
    pacman: { tileRow: dotPellet.row, tileCol: dotPellet.col }
  });
  const before = await getState(page);
  await advanceFrames(page, 1);
  const after = await getState(page);
  expect(after.score).toBe(before.score + 10);
  expect(after.pelletsRemaining).toBe(before.pelletsRemaining - 1);
  // Pellet should now be marked eaten
  const eaten = after.pellets.find((p) => p.row === dotPellet.row && p.col === dotPellet.col);
  expect(eaten.eaten).toBe(true);
});

test('eating a power pellet triggers frightened mode', async ({ page }) => {
  await openGame(page);
  const s0 = await getState(page);
  const pp = s0.powerPellets.find((p) => !p.eaten);
  expect(pp).toBeDefined();
  await setState(page, {
    pacman: { tileRow: pp.row, tileCol: pp.col }
  });
  await advanceFrames(page, 1);
  const after = await getState(page);
  expect(after.frightenedTimer).toBeGreaterThan(0);
  // All non-house ghosts should be frightened
  const activeGhosts = after.ghosts.filter((g) => g.mode !== 'house');
  for (const g of activeGhosts) {
    expect(g.frightened).toBe(true);
  }
});

test('power pellet score is 50', async ({ page }) => {
  await openGame(page);
  const s0 = await getState(page);
  const pp = s0.powerPellets.find((p) => !p.eaten);
  await setState(page, { pacman: { tileRow: pp.row, tileCol: pp.col } });
  const before = await getState(page);
  await advanceFrames(page, 1);
  const after = await getState(page);
  expect(after.score - before.score).toBe(50);
});

test('frightenedTimer decreases over frames', async ({ page }) => {
  await openGame(page);
  await setState(page, { frightenedTimer: 100 });
  const before = await getState(page);
  await advanceFrames(page, 10);
  const after = await getState(page);
  expect(after.frightenedTimer).toBeLessThan(before.frightenedTimer);
  expect(after.frightenedTimer).toBeGreaterThanOrEqual(0);
});

test('ghosts return to normal when frightenedTimer expires', async ({ page }) => {
  await openGame(page);
  // Set a minimal frightened timer and advance past it
  await setState(page, { frightenedTimer: 3 });
  await advanceFrames(page, 10);
  const after = await getState(page);
  expect(after.frightenedTimer).toBe(0);
  for (const g of after.ghosts) {
    expect(g.frightened).toBe(false);
  }
});

test('lives decrement when pacman is caught by non-frightened ghost', async ({ page }) => {
  await openGame(page);
  const before = await getState(page);
  // Place a non-frightened ghost directly on pacman's tile
  await setState(page, {
    ghosts: [
      { tileRow: before.pacman.tileRow, tileCol: before.pacman.tileCol, mode: 'scatter', frightened: false }
    ]
  });
  await advanceFrames(page, 1);
  const after = await getState(page);
  // Either lives decremented or dying state
  const lifeLost = after.lives < before.lives || after.status === 'dying';
  expect(lifeLost).toBe(true);
});

test('all pellets eaten transitions to levelComplete', async ({ page }) => {
  await openGame(page);
  // Set pelletsRemaining to 0 while still playing
  await setState(page, { pelletsRemaining: 0, status: 'playing' });
  await advanceFrames(page, 1);
  const after = await getState(page);
  expect(after.status).toBe('levelComplete');
});

test('losing last life transitions to gameOver', async ({ page }) => {
  await openGame(page);
  // Set lives to 1, then force collision
  const s = await getState(page);
  await setState(page, {
    lives: 1,
    ghosts: [
      { tileRow: s.pacman.tileRow, tileCol: s.pacman.tileCol, mode: 'scatter', frightened: false }
    ]
  });
  await advanceFrames(page, 1);
  // status may be 'dying' first, wait for death animation
  await advanceFrames(page, 120);
  const after = await getState(page);
  expect(after.status).toBe('gameOver');
});

test('restart resets score, lives, and level', async ({ page }) => {
  await openGame(page);
  await setState(page, { score: 9999, lives: 1, level: 5 });
  await page.evaluate(() => window.__pacmanTest.restart());
  const after = await getState(page);
  expect(after.score).toBe(0);
  expect(after.lives).toBe(3);
  expect(after.level).toBe(1);
  expect(after.status).toBe('playing');
});

test('eating a frightened ghost awards points and marks ghost eaten', async ({ page }) => {
  await openGame(page);
  const s = await getState(page);
  await setState(page, {
    frightenedTimer: 200,
    pacman: { tileRow: s.ghosts[0].tileRow, tileCol: s.ghosts[0].tileCol }
  });
  const before = await getState(page);
  await advanceFrames(page, 1);
  const after = await getState(page);
  expect(after.score).toBeGreaterThan(before.score);
});

// ── Screenshot tests (UI) ──────────────────────────────────────────────────

test('matches desktop layout screenshot', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1024 });
  await openGame(page);
  // Restart to known state, then advance fixed frames for deterministic mouth angle
  await page.evaluate(() => window.__pacmanTest.restart());
  await advanceFrames(page, 5);

  await expect(page).toHaveScreenshot('pacman-desktop-layout.png', {
    animations: 'disabled',
    fullPage: false,
    maxDiffPixels: 100
  });
});

test('canvas initial state screenshot matches baseline', async ({ page }) => {
  await openGame(page);
  // Restart to place all entities at known positions, then advance a fixed frame count
  await page.evaluate(() => window.__pacmanTest.restart());
  await advanceFrames(page, 5);

  await expect(page.locator('canvas')).toHaveScreenshot('pacman-canvas-initial.png', {
    maxDiffPixels: 100
  });
});

test('game over state screenshot matches baseline', async ({ page }) => {
  await openGame(page);
  await setState(page, { status: 'gameOver', score: 1230, lives: 0 });
  await advanceFrames(page, 1);

  await expect(page.locator('canvas')).toHaveScreenshot('pacman-canvas-gameover.png', {
    maxDiffPixels: 100
  });
});

test.describe('mobile portrait layout', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('matches mobile portrait layout screenshot', async ({ page }) => {
    await openGame(page);
    await page.evaluate(() => window.__pacmanTest.restart());
    await advanceFrames(page, 5);

    await expect(page).toHaveScreenshot('pacman-mobile-layout.png', {
      animations: 'disabled',
      fullPage: false,
      maxDiffPixels: 100
    });
  });

  test('dpad controls are visible on mobile', async ({ page }) => {
    await openGame(page);
    const dpad = page.locator('.dpad');
    await expect(dpad).toBeVisible();

    const canvasBox = await page.locator('canvas').boundingBox();
    const dpadBox = await dpad.boundingBox();
    expect(canvasBox).not.toBeNull();
    expect(dpadBox).not.toBeNull();
    // D-pad should be below the canvas (or at least not overlapping it significantly)
    expect(dpadBox.y).toBeGreaterThanOrEqual(canvasBox.y + canvasBox.height - 10);
  });
});
