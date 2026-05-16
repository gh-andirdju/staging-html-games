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
  await page.evaluate(() => {
    window.localStorage.removeItem('2048-best');
    window.localStorage.setItem('2048-guide-seen', '1');
  });
  await page.reload();
  await page.waitForFunction(() => {
    const api = window.__2048Test;
    return (
      api &&
      api.isReady === true &&
      typeof api.getState === 'function' &&
      typeof api.setState === 'function' &&
      typeof api.advanceFrames === 'function' &&
      typeof api.restart === 'function' &&
      typeof api.setAutoStep === 'function' &&
      typeof api.spawnTile === 'function'
    );
  });
  await page.evaluate(() => window.__2048Test.setAutoStep(false));
}

async function getState(page) {
  return page.evaluate(() => window.__2048Test.getState());
}

async function setState(page, nextState) {
  await page.evaluate((payload) => window.__2048Test.setState(payload), nextState);
}

async function advanceFrames(page, n = 1) {
  await page.evaluate(async (value) => {
    await window.__2048Test.advanceFrames(value);
  }, n);
}

async function prepareVisualLayout(page) {
  await setState(page, {
    grid: [
      [2,    4,    8,    16  ],
      [32,   64,   128,  256 ],
      [512,  256,  64,   32  ],
      [0,    2,    4,    1024]
    ],
    score: 4820,
    best: 4820,
    gameOver: false,
    won: false,
    statusMessage: 'Playing'
  });
}

// Rendering & API

test('renders and exposes ready test API', async ({ page }) => {
  await openGame(page);
  const api = await page.evaluate(() => ({
    isReady: window.__2048Test.isReady,
    hasGetState: typeof window.__2048Test.getState === 'function',
    hasSetState: typeof window.__2048Test.setState === 'function',
    hasAdvanceFrames: typeof window.__2048Test.advanceFrames === 'function',
    hasSetAutoStep: typeof window.__2048Test.setAutoStep === 'function',
    hasRestart: typeof window.__2048Test.restart === 'function',
    hasSpawnTile: typeof window.__2048Test.spawnTile === 'function'
  }));
  expect(api.isReady).toBe(true);
  expect(api.hasGetState).toBe(true);
  expect(api.hasSetState).toBe(true);
  expect(api.hasAdvanceFrames).toBe(true);
  expect(api.hasSetAutoStep).toBe(true);
  expect(api.hasRestart).toBe(true);
  expect(api.hasSpawnTile).toBe(true);
});

test('grid renders with 16 cells', async ({ page }) => {
  await openGame(page);
  await expect(page.locator('#grid .cell')).toHaveCount(16);
});

test('two tiles spawn on game start', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);
  const tileCount = state.grid.flat().filter(v => v !== 0).length;
  expect(tileCount).toBe(2);
});

// Slide mechanics

test('slide left moves tiles left', async ({ page }) => {
  await openGame(page);
  await setState(page, {
    grid: [
      [0, 0, 0, 2],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ],
    score: 0, best: 0, gameOver: false, won: false, statusMessage: 'Playing'
  });
  await page.keyboard.press('ArrowLeft');
  const state = await getState(page);
  expect(state.grid[0][0]).toBe(2);
  const tileCount = state.grid.flat().filter(v => v !== 0).length;
  expect(tileCount).toBe(2);
});

test('slide right moves tiles right', async ({ page }) => {
  await openGame(page);
  await setState(page, {
    grid: [
      [2, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ],
    score: 0, best: 0, gameOver: false, won: false, statusMessage: 'Playing'
  });
  await page.keyboard.press('ArrowRight');
  const state = await getState(page);
  expect(state.grid[0][3]).toBe(2);
  const tileCount = state.grid.flat().filter(v => v !== 0).length;
  expect(tileCount).toBe(2);
});

test('slide up moves tiles up', async ({ page }) => {
  await openGame(page);
  await setState(page, {
    grid: [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [2, 0, 0, 0]
    ],
    score: 0, best: 0, gameOver: false, won: false, statusMessage: 'Playing'
  });
  await page.keyboard.press('ArrowUp');
  const state = await getState(page);
  expect(state.grid[0][0]).toBe(2);
  const tileCount = state.grid.flat().filter(v => v !== 0).length;
  expect(tileCount).toBe(2);
});

test('slide down moves tiles down', async ({ page }) => {
  await openGame(page);
  await setState(page, {
    grid: [
      [2, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ],
    score: 0, best: 0, gameOver: false, won: false, statusMessage: 'Playing'
  });
  await page.keyboard.press('ArrowDown');
  const state = await getState(page);
  expect(state.grid[3][0]).toBe(2);
  const tileCount = state.grid.flat().filter(v => v !== 0).length;
  expect(tileCount).toBe(2);
});

// Merge mechanics

test('equal tiles merge when slid together', async ({ page }) => {
  await openGame(page);
  await setState(page, {
    grid: [
      [2, 2, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ],
    score: 0, best: 0, gameOver: false, won: false, statusMessage: 'Playing'
  });
  await page.keyboard.press('ArrowLeft');
  const state = await getState(page);
  expect(state.grid[0][0]).toBe(4);
  const tileCount = state.grid.flat().filter(v => v !== 0).length;
  expect(tileCount).toBe(2);
});

test('merge adds the merged value to score', async ({ page }) => {
  await openGame(page);
  await setState(page, {
    grid: [
      [0, 0, 4, 4],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ],
    score: 0, best: 0, gameOver: false, won: false, statusMessage: 'Playing'
  });
  await page.keyboard.press('ArrowLeft');
  const state = await getState(page);
  expect(state.score).toBe(8);
  await expect(page.locator('#score')).toHaveText('8');
});

test('four equal tiles in a row produce two merged pairs not one chain', async ({ page }) => {
  await openGame(page);
  await setState(page, {
    grid: [
      [2, 2, 2, 2],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ],
    score: 0, best: 0, gameOver: false, won: false, statusMessage: 'Playing'
  });
  await page.keyboard.press('ArrowLeft');
  const state = await getState(page);
  expect(state.grid[0][0]).toBe(4);
  expect(state.grid[0][1]).toBe(4);
  expect(state.score).toBe(8);
  const tileCount = state.grid.flat().filter(v => v !== 0).length;
  expect(tileCount).toBe(3);
});

// No-move case

test('slide in direction with no valid moves does not change state', async ({ page }) => {
  await openGame(page);
  await setState(page, {
    grid: [
      [2, 4, 8, 16],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ],
    score: 100, best: 100, gameOver: false, won: false, statusMessage: 'Playing'
  });
  const before = await getState(page);
  await page.keyboard.press('ArrowLeft');
  const after = await getState(page);
  expect(after.grid).toEqual(before.grid);
  expect(after.score).toBe(before.score);
});

// New tile spawning

test('a new tile appears after each valid move', async ({ page }) => {
  await openGame(page);
  await setState(page, {
    grid: [
      [0, 0, 0, 2],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ],
    score: 0, best: 0, gameOver: false, won: false, statusMessage: 'Playing'
  });
  const before = await getState(page);
  const countBefore = before.grid.flat().filter(v => v !== 0).length;
  await page.keyboard.press('ArrowLeft');
  const after = await getState(page);
  const countAfter = after.grid.flat().filter(v => v !== 0).length;
  expect(countAfter).toBe(countBefore + 1);
});

// Win detection

test('merging two 1024 tiles triggers win', async ({ page }) => {
  await openGame(page);
  await setState(page, {
    grid: [
      [1024, 1024, 0, 0],
      [0,    0,    0, 0],
      [0,    0,    0, 0],
      [0,    0,    0, 0]
    ],
    score: 0, best: 0, gameOver: false, won: false, statusMessage: 'Playing'
  });
  await page.keyboard.press('ArrowLeft');
  const state = await getState(page);
  expect(state.won).toBe(true);
  expect(state.grid[0][0]).toBe(2048);
  await expect(page.locator('#status')).toContainText('Win');
});

// Game over detection

test('board with no valid moves triggers game over', async ({ page }) => {
  await openGame(page);
  await setState(page, {
    grid: [
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2]
    ],
    score: 0, best: 0, gameOver: false, won: false, statusMessage: 'Playing'
  });
  await page.keyboard.press('ArrowLeft');
  const state = await getState(page);
  expect(state.gameOver).toBe(true);
  await expect(page.locator('#status')).toContainText('Game Over');
});

test('game over still triggers after winning if board fills up', async ({ page }) => {
  await openGame(page);
  await setState(page, {
    grid: [
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2]
    ],
    score: 0, best: 0, gameOver: false, won: true, statusMessage: 'You Win!'
  });
  await page.keyboard.press('ArrowLeft');
  const state = await getState(page);
  expect(state.gameOver).toBe(true);
  await expect(page.locator('#status')).toContainText('Game Over');
});

// Restart

test('restart clears board and resets score', async ({ page }) => {
  await openGame(page);
  await setState(page, {
    grid: [
      [2, 4, 8, 16],
      [32, 64, 128, 256],
      [512, 256, 64, 32],
      [16, 8, 4, 2]
    ],
    score: 9999, best: 9999, gameOver: true, won: false, statusMessage: 'Game Over'
  });
  await page.locator('#restart').click();
  const state = await getState(page);
  expect(state.score).toBe(0);
  expect(state.gameOver).toBe(false);
  const tileCount = state.grid.flat().filter(v => v !== 0).length;
  expect(tileCount).toBe(2);
});

// Best score persistence

test('best score persists across restart', async ({ page }) => {
  await openGame(page);
  await setState(page, {
    grid: [[2, 4, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
    score: 5000, best: 5000, gameOver: false, won: false, statusMessage: 'Playing'
  });
  await page.locator('#restart').click();
  const state = await getState(page);
  expect(state.best).toBe(5000);
  await expect(page.locator('#best')).toHaveText('5000');
});

// spawnTile API

test('spawnTile places a specific tile at the given cell', async ({ page }) => {
  await openGame(page);
  await setState(page, {
    grid: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
    score: 0, best: 0, gameOver: false, won: false, statusMessage: 'Playing'
  });
  await page.evaluate(() => window.__2048Test.spawnTile(512, 2, 2));
  const state = await getState(page);
  expect(state.grid[2][2]).toBe(512);
  await expect(page.locator('#grid .cell').nth(10)).toHaveText('512');
});

// Layout

test('HUD and grid are visible and properly positioned', async ({ page }) => {
  await openGame(page);
  const hudBox = await page.locator('.hud').boundingBox();
  const gridBox = await page.locator('#grid').boundingBox();
  const scoreBox = await page.locator('#score').boundingBox();
  const bestBox = await page.locator('#best').boundingBox();

  expect(hudBox).not.toBeNull();
  expect(gridBox).not.toBeNull();
  expect(scoreBox).not.toBeNull();
  expect(bestBox).not.toBeNull();
  expect(gridBox.y).toBeGreaterThan(hudBox.y + hudBox.height - 1);
  expect(Math.abs(gridBox.width - gridBox.height)).toBeLessThan(gridBox.width * 0.1);
});

// Touch swipe controls

test.describe('touch swipe controls', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('swipe left moves tiles left', async ({ page }) => {
    await openGame(page);
    await setState(page, {
      grid: [[0, 0, 0, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
      score: 0, best: 0, gameOver: false, won: false, statusMessage: 'Playing'
    });
    await page.evaluate(() => {
      const cx = 200, cy = 400;
      document.dispatchEvent(new TouchEvent('touchstart', {
        touches: [new Touch({ identifier: 1, target: document.body, clientX: cx, clientY: cy })],
        bubbles: true, cancelable: true
      }));
      document.dispatchEvent(new TouchEvent('touchend', {
        changedTouches: [new Touch({ identifier: 1, target: document.body, clientX: cx - 80, clientY: cy })],
        bubbles: true, cancelable: true
      }));
    });
    const state = await getState(page);
    expect(state.grid[0][0]).toBe(2);
    const tileCount = state.grid.flat().filter(v => v !== 0).length;
    expect(tileCount).toBe(2);
  });

  test('swipe right moves tiles right', async ({ page }) => {
    await openGame(page);
    await setState(page, {
      grid: [[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
      score: 0, best: 0, gameOver: false, won: false, statusMessage: 'Playing'
    });
    await page.evaluate(() => {
      const cx = 200, cy = 400;
      document.dispatchEvent(new TouchEvent('touchstart', {
        touches: [new Touch({ identifier: 1, target: document.body, clientX: cx, clientY: cy })],
        bubbles: true, cancelable: true
      }));
      document.dispatchEvent(new TouchEvent('touchend', {
        changedTouches: [new Touch({ identifier: 1, target: document.body, clientX: cx + 80, clientY: cy })],
        bubbles: true, cancelable: true
      }));
    });
    const state = await getState(page);
    expect(state.grid[0][3]).toBe(2);
    const tileCount = state.grid.flat().filter(v => v !== 0).length;
    expect(tileCount).toBe(2);
  });

  test('swipe up moves tiles up', async ({ page }) => {
    await openGame(page);
    await setState(page, {
      grid: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [2, 0, 0, 0]],
      score: 0, best: 0, gameOver: false, won: false, statusMessage: 'Playing'
    });
    await page.evaluate(() => {
      const cx = 200, cy = 400;
      document.dispatchEvent(new TouchEvent('touchstart', {
        touches: [new Touch({ identifier: 1, target: document.body, clientX: cx, clientY: cy })],
        bubbles: true, cancelable: true
      }));
      document.dispatchEvent(new TouchEvent('touchend', {
        changedTouches: [new Touch({ identifier: 1, target: document.body, clientX: cx, clientY: cy - 80 })],
        bubbles: true, cancelable: true
      }));
    });
    const state = await getState(page);
    expect(state.grid[0][0]).toBe(2);
    const tileCount = state.grid.flat().filter(v => v !== 0).length;
    expect(tileCount).toBe(2);
  });

  test('swipe down moves tiles down', async ({ page }) => {
    await openGame(page);
    await setState(page, {
      grid: [[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
      score: 0, best: 0, gameOver: false, won: false, statusMessage: 'Playing'
    });
    await page.evaluate(() => {
      const cx = 200, cy = 400;
      document.dispatchEvent(new TouchEvent('touchstart', {
        touches: [new Touch({ identifier: 1, target: document.body, clientX: cx, clientY: cy })],
        bubbles: true, cancelable: true
      }));
      document.dispatchEvent(new TouchEvent('touchend', {
        changedTouches: [new Touch({ identifier: 1, target: document.body, clientX: cx, clientY: cy + 80 })],
        bubbles: true, cancelable: true
      }));
    });
    const state = await getState(page);
    expect(state.grid[3][0]).toBe(2);
    const tileCount = state.grid.flat().filter(v => v !== 0).length;
    expect(tileCount).toBe(2);
  });

  test('swipe below threshold does not move tiles', async ({ page }) => {
    await openGame(page);
    await setState(page, {
      grid: [[0, 0, 0, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
      score: 0, best: 0, gameOver: false, won: false, statusMessage: 'Playing'
    });
    const before = await getState(page);
    await page.evaluate(() => {
      const cx = 200, cy = 400;
      document.dispatchEvent(new TouchEvent('touchstart', {
        touches: [new Touch({ identifier: 1, target: document.body, clientX: cx, clientY: cy })],
        bubbles: true, cancelable: true
      }));
      document.dispatchEvent(new TouchEvent('touchend', {
        changedTouches: [new Touch({ identifier: 1, target: document.body, clientX: cx - 10, clientY: cy })],
        bubbles: true, cancelable: true
      }));
    });
    const after = await getState(page);
    expect(after.grid).toEqual(before.grid);
  });
});

// Beginner guide

test.describe('beginner guide', () => {
  async function openGameFresh(page) {
    await page.goto('./');
    await page.evaluate(() => {
      window.localStorage.removeItem('2048-best');
      window.localStorage.removeItem('2048-guide-seen');
    });
    await page.reload();
    await page.waitForFunction(() => {
      const api = window.__2048Test;
      return (
        api && api.isReady &&
        typeof api.isGuideVisible === 'function' &&
        typeof api.getGuideStep === 'function' &&
        typeof api.showGuide === 'function' &&
        typeof api.dismissGuide === 'function' &&
        api.isGuideVisible() === true
      );
    });
    await page.evaluate(() => window.__2048Test.setAutoStep(false));
  }

  async function openGameSeen(page) {
    await page.goto('./');
    await page.evaluate(() => {
      window.localStorage.removeItem('2048-best');
      window.localStorage.setItem('2048-guide-seen', '1');
    });
    await page.reload();
    await page.waitForFunction(() => {
      const api = window.__2048Test;
      return (
        api && api.isReady &&
        typeof api.isGuideVisible === 'function' &&
        typeof api.getGuideStep === 'function' &&
        typeof api.showGuide === 'function' &&
        typeof api.dismissGuide === 'function'
      );
    });
    await page.evaluate(() => window.__2048Test.setAutoStep(false));
  }

  test('shows on first visit', async ({ page }) => {
    await openGameFresh(page);
    const visible = await page.evaluate(() => window.__2048Test.isGuideVisible());
    expect(visible).toBe(true);
  });

  test('starts on step 0', async ({ page }) => {
    await openGameFresh(page);
    const step = await page.evaluate(() => window.__2048Test.getGuideStep());
    expect(step).toBe(0);
  });

  test('Next advances to step 1', async ({ page }) => {
    await openGameFresh(page);
    await page.click('#guide-next');
    const step = await page.evaluate(() => window.__2048Test.getGuideStep());
    expect(step).toBe(1);
  });

  test('Back retreats step', async ({ page }) => {
    await openGameFresh(page);
    await page.evaluate(() => window.__2048Test.showGuide(2));
    await page.click('#guide-prev');
    const step = await page.evaluate(() => window.__2048Test.getGuideStep());
    expect(step).toBe(1);
  });

  test('Next on last step closes guide', async ({ page }) => {
    await openGameFresh(page);
    const domStepCount = await page.evaluate(() => document.querySelectorAll('.guide-step').length);
    expect(domStepCount).toBe(4);
    await page.evaluate(() => window.__2048Test.showGuide(3));
    const stepBefore = await page.evaluate(() => window.__2048Test.getGuideStep());
    expect(stepBefore).toBe(3);
    await page.click('#guide-next');
    const visible = await page.evaluate(() => window.__2048Test.isGuideVisible());
    expect(visible).toBe(false);
  });

  test('Skip button closes guide', async ({ page }) => {
    await openGameFresh(page);
    await page.click('#guide-close');
    const visible = await page.evaluate(() => window.__2048Test.isGuideVisible());
    expect(visible).toBe(false);
  });

  test('does not show if already seen', async ({ page }) => {
    await openGameSeen(page);
    const visible = await page.evaluate(() => window.__2048Test.isGuideVisible());
    expect(visible).toBe(false);
  });

  test('help button reopens guide at step 0', async ({ page }) => {
    await openGameFresh(page);
    await page.evaluate(() => window.__2048Test.dismissGuide());
    await page.click('#guide-help');
    const visible = await page.evaluate(() => window.__2048Test.isGuideVisible());
    const step = await page.evaluate(() => window.__2048Test.getGuideStep());
    expect(visible).toBe(true);
    expect(step).toBe(0);
  });

  test('guide does not reappear after restart', async ({ page }) => {
    await openGameFresh(page);
    await page.evaluate(() => window.__2048Test.dismissGuide());
    await page.click('#restart');
    const visible = await page.evaluate(() => window.__2048Test.isGuideVisible());
    expect(visible).toBe(false);
  });

  test('Back hidden on step 0', async ({ page }) => {
    await openGameFresh(page);
    const backHidden = await page.evaluate(() => document.getElementById('guide-prev').hidden);
    expect(backHidden).toBe(true);
  });

  test('Next shows Start Playing on last step', async ({ page }) => {
    await openGameFresh(page);
    const lastStep = await page.evaluate(() => document.querySelectorAll('.guide-step').length - 1);
    await page.evaluate((step) => window.__2048Test.showGuide(step), lastStep);
    const text = await page.textContent('#guide-next');
    expect(text).toBe('Start Playing');
  });

  test('arrow keys do not move tiles while guide is open', async ({ page }) => {
    await openGameFresh(page);
    const before = await page.evaluate(() => window.__2048Test.getState());
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowRight');
    const after = await page.evaluate(() => window.__2048Test.getState());
    expect(after.grid).toEqual(before.grid);
    expect(after.score).toBe(before.score);
  });

  test('Escape closes guide', async ({ page }) => {
    await openGameFresh(page);
    await page.keyboard.press('Escape');
    const visible = await page.evaluate(() => window.__2048Test.isGuideVisible());
    expect(visible).toBe(false);
  });

  test('Tab wraps from last button to first', async ({ page }) => {
    await openGameFresh(page);
    const focusedId = await page.evaluate(() => document.activeElement?.id);
    expect(focusedId).toBe('guide-next');
    await page.keyboard.press('Tab');
    const afterTab = await page.evaluate(() => document.activeElement?.id);
    expect(afterTab).toBe('guide-close');
  });

  test('Shift+Tab wraps from first button to last', async ({ page }) => {
    await openGameFresh(page);
    await page.evaluate(() => document.getElementById('guide-close').focus());
    await page.keyboard.press('Shift+Tab');
    const id = await page.evaluate(() => document.activeElement?.id);
    expect(id).toBe('guide-next');
  });

  test('arrow keys do not scroll page while guide is open', async ({ page }) => {
    await openGameFresh(page);
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowRight');
    const scrollAfter = await page.evaluate(() => window.scrollY);
    expect(scrollAfter).toBe(scrollBefore);
  });

  test('swipe does not move tiles while guide is open', async ({ page }) => {
    await openGameFresh(page);
    const before = await page.evaluate(() => window.__2048Test.getState());
    await page.evaluate(() => {
      const cx = 200, cy = 400;
      document.dispatchEvent(new TouchEvent('touchstart', {
        touches: [new Touch({ identifier: 1, target: document.body, clientX: cx, clientY: cy })],
        bubbles: true, cancelable: true
      }));
      document.dispatchEvent(new TouchEvent('touchend', {
        changedTouches: [new Touch({ identifier: 1, target: document.body, clientX: cx - 80, clientY: cy })],
        bubbles: true, cancelable: true
      }));
    });
    const after = await page.evaluate(() => window.__2048Test.getState());
    expect(after.grid).toEqual(before.grid);
    expect(after.score).toBe(before.score);
  });

  test('guide does not reshow after dismiss and page reload', async ({ page }) => {
    await openGameFresh(page);
    await page.evaluate(() => window.__2048Test.dismissGuide());
    await page.reload();
    await page.waitForFunction(() => window.__2048Test?.isReady === true);
    const visible = await page.evaluate(() => window.__2048Test.isGuideVisible());
    expect(visible).toBe(false);
  });
});

// Screenshot tests

test('matches desktop layout baseline', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGame(page);
  await prepareVisualLayout(page);
  await expect(page).toHaveScreenshot('2048-desktop-layout.png', {
    animations: 'disabled',
    fullPage: false,
    maxDiffPixels: 10
  });
});

test.describe('mobile layout', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true });

  test('matches portrait layout baseline', async ({ page }) => {
    await openGame(page);
    await prepareVisualLayout(page);
    await expect(page).toHaveScreenshot('2048-portrait-layout.png', {
      animations: 'disabled',
      fullPage: false,
      maxDiffPixels: 10
    });
  });
});
