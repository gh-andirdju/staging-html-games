import { test, expect } from '@playwright/test';

const buildId = 'dash-arena-2026-10-31.2';
const runtimeAssets = ['styles.css', 'bootstrap.js', 'app.js', 'engine.js', 'dash-arena.wasm'];
const visualOptions = { animations: 'disabled', fullPage: false, maxDiffPixels: 10, timeout: 15000 };

test.beforeEach(async ({ page }) => {
  page.__runtimeErrors = [];
  page.__expectedFailurePaths = [];
  page.on('pageerror', error => page.__runtimeErrors.push({ text: error.message, url: '' }));
  page.on('console', message => {
    if (message.type() === 'error') page.__runtimeErrors.push({ text: message.text(), url: message.location().url || '' });
  });
});

test.afterEach(async ({ page }) => {
  const unexpected = page.__runtimeErrors.filter(error => !(
    error.text.startsWith('Failed to load resource') &&
    page.__expectedFailurePaths.some(path => error.url.includes(path))
  ));
  expect(unexpected).toEqual([]);
});

async function openArena(page) {
  await page.goto('./');
  await page.waitForFunction(() => window.__dashArenaTest?.isReady);
  await page.evaluate(() => window.__dashArenaTest.setAutoStep(false));
  await expect(page.locator('#arena')).toBeVisible();
}

async function call(page, method, ...args) {
  return page.evaluate(async ({ method, args }) => window.__dashArenaTest[method](...args), { method, args });
}

const state = page => call(page, 'getState');
const advanceFrames = (page, frames = 1) => call(page, 'advanceFrames', frames);

async function startArena(page) {
  await openArena(page);
  await call(page, 'start', 1);
  await call(page, 'setAutoStep', false);
}

async function emptyCombat(page) {
  await call(page, 'clearEnemies');
  await call(page, 'clearBullets');
  await call(page, 'clearProps');
  await call(page, 'setPlayer', 0, 0, 100);
  await call(page, 'setInput', { moveX: 0, moveY: 0, fire: false, dash: false });
}

async function prepareVisualLayout(page) {
  await call(page, 'prepareVisualLayout');
  await page.evaluate(() => document.fonts.ready);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

async function killEnemy(page, x = 4, z = 0) {
  await call(page, 'spawnEnemy', 0, x, z, 1);
  await call(page, 'spawnBullet', 0, 0, x - 1, z, 120, 0, 100);
  await advanceFrames(page, 1);
}

test('starts ready with a 90-second round and requires an explicit start', async ({ page }) => {
  await openArena(page);
  const ready = await state(page);
  expect(ready.phase).toBe(0);
  expect(ready.timeLeft).toBe(90);
  await expect(page.locator('#start')).toBeVisible();
  await advanceFrames(page, 120);
  expect((await state(page)).tick).toBe(ready.tick);
  await page.keyboard.press('Enter');
  expect((await state(page)).phase).toBe(1);
  await advanceFrames(page, 60);
  expect((await state(page)).timeLeft).toBeCloseTo(89, 1);
});

test('loads a real Rust Wasm engine and draws a nonempty WebGL mesh', async ({ page, request }) => {
  await openArena(page);
  await prepareVisualLayout(page);
  expect(await page.evaluate(() => ({
    engine: window.__dashArenaTest.engine,
    renderer: window.__dashArenaTest.renderer,
    buildId: window.__dashArenaTest.buildId
  }))).toEqual({ engine: 'rust-wasm', renderer: 'rust-webgl2', buildId });
  const response = await request.get(`src/dash-arena.wasm?v=${buildId}`);
  expect(response.ok()).toBe(true);
  expect(response.headers()['content-type']).toContain('application/wasm');
  const bytes = await response.body();
  expect([...bytes.subarray(0, 4)]).toEqual([0, 97, 115, 109]);
  const module = await WebAssembly.compile(bytes);
  expect(WebAssembly.Module.exports(module).map(item => item.name)).toEqual(expect.arrayContaining([
    'engine_version', 'step', 'render', 'vertices_ptr'
  ]));
  const pixels = await page.evaluate(async () => {
    await window.__dashArenaTest.advanceFrames(0);
    const canvas = document.getElementById('arena');
    const gl = canvas.getContext('webgl2');
    const data = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
    const colors = new Set();
    for (let i = 0; i < data.length; i += 32) colors.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    return { colors: colors.size, error: gl.getError(), metrics: window.__dashArenaTest.getMetrics() };
  });
  expect(pixels.colors).toBeGreaterThan(12);
  expect(pixels.error).toBe(0);
  expect(pixels.metrics.vertexCount).toBeGreaterThan(100);
});

test('requests every startup asset with the same build version', async ({ page }) => {
  const requests = [];
  page.on('request', request => {
    const url = new URL(request.url());
    const name = url.pathname.split('/').at(-1);
    if (runtimeAssets.includes(name)) requests.push({ name, version: url.searchParams.get('v') });
  });
  await openArena(page);
  for (const name of runtimeAssets) {
    const matching = requests.filter(request => request.name === name);
    expect(matching.length, `${name} was requested`).toBeGreaterThan(0);
    expect(matching.every(request => request.version === buildId), `${name} uses current build`).toBe(true);
  }
});

test('failed engine download shows retry and recovers when the download returns', async ({ page }) => {
  page.__expectedFailurePaths.push('/src/dash-arena.wasm');
  const failedModule = '**/dash-arena.wasm*';
  await page.route(failedModule, route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.goto('./');
  const retry = page.getByRole('button', { name: /try again|retry/i });
  await expect(retry).toBeVisible();
  expect(await page.evaluate(() => window.__dashArenaTest?.isReady)).not.toBe(true);
  await page.unroute(failedModule);
  await retry.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__dashArenaTest?.isReady);
  expect(await page.evaluate(() => window.__dashArenaTest.engine)).toBe('rust-wasm');
});

test('WASD moves in screen-relative directions and releasing a key stops movement', async ({ page }) => {
  await startArena(page);
  await emptyCombat(page);
  const before = (await state(page)).player;
  await page.keyboard.down('w');
  await advanceFrames(page, 12);
  await page.keyboard.up('w');
  const north = (await state(page)).player;
  expect(north.x + north.z).toBeLessThan(before.x + before.z);
  await page.keyboard.down('d');
  await advanceFrames(page, 12);
  await page.keyboard.up('d');
  const east = (await state(page)).player;
  expect(east.x - east.z).toBeGreaterThan(north.x - north.z);
  await advanceFrames(page, 12);
  expect(distance((await state(page)).player, east)).toBeLessThan(0.01);
});

test('arrow keys aim and fire in cardinal screen directions without moving the player', async ({ page }) => {
  await startArena(page);
  for (const [key, expectedX, expectedY] of [
    ['ArrowRight', 1, 0], ['ArrowUp', 0, -1], ['ArrowLeft', -1, 0], ['ArrowDown', 0, 1]
  ]) {
    await call(page, 'start', 1);
    await emptyCombat(page);
    const before = (await state(page)).player;
    await page.keyboard.down(key);
    await advanceFrames(page, 8);
    const firing = await state(page);
    expect(firing.shots).toBeGreaterThan(0);
    expect(distance(firing.player, before)).toBeLessThan(0.001);
    const screenX = 0.8660254 * (firing.player.aimX - firing.player.aimZ);
    const screenY = 0.5 * (firing.player.aimX + firing.player.aimZ);
    if (expectedX) expect(Math.sign(screenX)).toBe(expectedX);
    else expect(Math.abs(screenX)).toBeLessThan(0.001);
    if (expectedY) expect(Math.sign(screenY)).toBe(expectedY);
    else expect(Math.abs(screenY)).toBeLessThan(0.001);
    await page.keyboard.up(key);
    const shots = (await state(page)).shots;
    await advanceFrames(page, 16);
    expect((await state(page)).shots).toBe(shots);
    expect((await call(page, 'getMetrics')).input.fire).toBe(false);
  }
});

test('paired arrow keys aim diagonally and releasing one preserves the remaining direction', async ({ page }) => {
  await startArena(page);
  await emptyCombat(page);
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('ArrowRight');
  await advanceFrames(page, 8);
  const diagonal = await state(page);
  const screenX = 0.8660254 * (diagonal.player.aimX - diagonal.player.aimZ);
  const screenY = 0.5 * (diagonal.player.aimX + diagonal.player.aimZ);
  expect(screenX).toBeGreaterThan(0);
  expect(screenY).toBeLessThan(0);
  expect(screenX).toBeCloseTo(-screenY, 4);
  expect(Math.hypot(diagonal.player.aimX, diagonal.player.aimZ)).toBeCloseTo(1, 4);
  await page.keyboard.up('ArrowUp');
  await advanceFrames(page, 8);
  const right = await state(page);
  expect(right.shots).toBeGreaterThan(diagonal.shots);
  expect(right.player.aimX - right.player.aimZ).toBeGreaterThan(0);
  expect(right.player.aimX + right.player.aimZ).toBeCloseTo(0, 4);
  await page.keyboard.up('ArrowRight');
  const shots = (await state(page)).shots;
  await advanceFrames(page, 16);
  expect((await state(page)).shots).toBe(shots);
});

test('WASD movement and arrow-key shooting work independently at the same time', async ({ page }) => {
  await startArena(page);
  await emptyCombat(page);
  const before = (await state(page)).player;
  await page.keyboard.down('w');
  await page.keyboard.down('ArrowRight');
  await advanceFrames(page, 12);
  const moving = await state(page);
  expect(moving.player.x + moving.player.z).toBeLessThan(before.x + before.z);
  expect(moving.player.aimX - moving.player.aimZ).toBeGreaterThan(0);
  expect(moving.player.aimX + moving.player.aimZ).toBeCloseTo(0, 4);
  expect(moving.shots).toBeGreaterThan(0);
  await page.keyboard.up('w');
  await advanceFrames(page, 12);
  const standing = await state(page);
  expect(distance(standing.player, moving.player)).toBeLessThan(0.001);
  expect(standing.shots).toBeGreaterThan(moving.shots);
  await page.keyboard.up('ArrowRight');
});

test('number shortcuts and keyboard-activated weapon buttons select distinct projectile patterns', async ({ page }) => {
  await startArena(page);
  const samples = [];
  for (const weapon of [0, 1, 2]) {
    await call(page, 'start', 1);
    await emptyCombat(page);
    await page.keyboard.press(String(weapon + 1));
    expect((await state(page)).weapon).toBe(weapon);
    await page.keyboard.down('ArrowRight');
    await advanceFrames(page, 1);
    await page.keyboard.up('ArrowRight');
    const shots = (await state(page)).bullets.filter(bullet => bullet.owner === 0);
    expect(shots.length).toBeGreaterThan(0);
    expect(shots.every(bullet => bullet.kind === weapon)).toBe(true);
    samples.push(shots);
  }
  expect(samples[1].length).toBeGreaterThan(samples[0].length);
  expect(Math.hypot(samples[2][0].dx, samples[2][0].dz)).toBeLessThan(Math.hypot(samples[0][0].dx, samples[0][0].dz));
  await page.locator('[data-weapon="1"]').focus();
  await page.keyboard.press('Space');
  expect((await state(page)).weapon).toBe(1);
});

test('dash travels farther than walking and cannot retrigger during cooldown', async ({ page }) => {
  await startArena(page);
  await emptyCombat(page);
  await call(page, 'setInput', { moveX: 1 });
  await advanceFrames(page, 8);
  const walk = distance((await state(page)).player, { x: 0, z: 0 });
  await call(page, 'start', 1);
  await emptyCombat(page);
  await call(page, 'setInput', { moveX: 1, dash: true });
  await advanceFrames(page, 8);
  const dash = await state(page);
  expect(distance(dash.player, { x: 0, z: 0 })).toBeGreaterThan(walk * 2);
  expect(dash.player.dashCd).toBeGreaterThan(0);
  expect(dash.dashes).toBe(1);
  await call(page, 'setInput', { dash: true });
  await advanceFrames(page, 1);
  expect((await state(page)).dashes).toBe(1);
});

test('dash makes the player invulnerable to an overlapping enemy projectile', async ({ page }) => {
  await startArena(page);
  await emptyCombat(page);
  await call(page, 'setInput', { dash: true });
  await advanceFrames(page, 1);
  const before = await state(page);
  expect(before.player.dashFrames).toBeGreaterThan(0);
  await call(page, 'spawnBullet', 1, 3, before.player.x, before.player.z, 0, 0, 50);
  await advanceFrames(page, 1);
  expect((await state(page)).player.hp).toBe(before.player.hp);
});

test('rusher, gunner and flanker enemies actively reposition', async ({ page }) => {
  await startArena(page);
  await emptyCombat(page);
  const ids = [];
  for (const [kind, x, z] of [[0, 8, 0], [1, 0, 8], [2, -8, 0]]) {
    ids.push(await call(page, 'spawnEnemy', kind, x, z, 50));
  }
  const before = await state(page);
  await advanceFrames(page, 45);
  const after = await state(page);
  for (const id of ids) {
    const original = before.enemies.find(enemy => enemy.id === id);
    const moved = after.enemies.find(enemy => enemy.id === id);
    expect(moved).toBeDefined();
    expect(distance(moved, original)).toBeGreaterThan(0.05);
  }
});

test('swept projectiles hit enemies they cross within one simulation frame', async ({ page }) => {
  await startArena(page);
  await emptyCombat(page);
  const id = await call(page, 'spawnEnemy', 0, 4, 0, 1);
  await call(page, 'spawnBullet', 0, 0, 0, 0, 300, 0, 100);
  await advanceFrames(page, 1);
  const after = await state(page);
  expect(after.enemies.some(enemy => enemy.id === id)).toBe(false);
  expect(after.kills).toBe(1);
  expect(after.score).toBeGreaterThan(0);
});

test('quick successive kills build a combo and update the HUD score', async ({ page }) => {
  await startArena(page);
  await emptyCombat(page);
  await killEnemy(page, 4, 0);
  const first = await state(page);
  await killEnemy(page, 5, 0);
  const second = await state(page);
  expect(second.kills).toBe(2);
  expect(second.combo).toBeGreaterThan(first.combo);
  expect(second.maxCombo).toBeGreaterThanOrEqual(second.combo);
  expect(second.score).toBeGreaterThan(first.score);
  expect(Number((await page.locator('#score').textContent()).replace(/\D/g, ''))).toBe(second.score);
});

test('cover absorbs damage and breaks into debris', async ({ page }) => {
  await startArena(page);
  const before = await state(page);
  const cover = before.props.find(prop => prop.kind === 0 && prop.hp > 0);
  expect(cover).toBeDefined();
  await call(page, 'spawnBullet', 0, 0, cover.x, cover.z, 0, 0, 10000);
  await advanceFrames(page, 1);
  const after = await state(page);
  expect(after.props.find(prop => prop.x === cover.x && prop.z === cover.z)?.hp ?? 0).toBeLessThanOrEqual(0);
  expect(after.propsDestroyed).toBeGreaterThan(before.propsDestroyed);
  expect(after.particleCount).toBeGreaterThan(0);
});

test('an explosive barrel triggers a nearby barrel and damages nearby enemies', async ({ page }) => {
  await startArena(page);
  await call(page, 'clearEnemies');
  const before = await state(page);
  const barrels = before.props.filter(prop => prop.kind === 1 && prop.hp > 0);
  const pair = barrels.flatMap((a, i) => barrels.slice(i + 1).map(b => ({ a, b, distance: distance(a, b) })))
    .sort((a, b) => a.distance - b.distance)[0];
  expect(pair.distance).toBeLessThan(3);
  const enemyId = await call(page, 'spawnEnemy', 0, pair.a.x + 0.6, pair.a.z, 1);
  await call(page, 'spawnBullet', 0, 0, pair.a.x, pair.a.z, 0, 0, 10000);
  await advanceFrames(page, 1);
  const after = await state(page);
  expect(after.explosions).toBeGreaterThanOrEqual(2);
  expect(after.propsDestroyed).toBeGreaterThanOrEqual(2);
  expect(after.props.find(prop => prop.x === pair.b.x && prop.z === pair.b.z)?.hp ?? 0).toBeLessThanOrEqual(0);
  expect(after.enemies.some(enemy => enemy.id === enemyId)).toBe(false);
});

test('enemy damage ends a depleted run and Play again starts a clean round', async ({ page }) => {
  await startArena(page);
  await emptyCombat(page);
  await call(page, 'setPlayer', 0, 0, 5);
  await call(page, 'spawnBullet', 1, 3, 0, 0, 0, 0, 50);
  await advanceFrames(page, 1);
  const ended = await state(page);
  expect(ended.phase).toBe(4);
  expect(ended.player.hp).toBeLessThanOrEqual(0);
  await expect(page.locator('#play-again')).toBeVisible();
  await page.keyboard.press('Enter');
  const next = await state(page);
  expect(next.phase).toBe(1);
  expect(next.tick).toBe(0);
  expect(next.player.hp).toBe(100);
  expect(next.score).toBe(0);
});

test('pause freezes the simulation and Resume returns to the same run', async ({ page }) => {
  await startArena(page);
  await advanceFrames(page, 30);
  await page.keyboard.press('p');
  const paused = await state(page);
  expect(paused.phase).toBe(2);
  await advanceFrames(page, 120);
  const frozen = await state(page);
  expect(frozen.tick).toBe(paused.tick);
  expect(frozen.player).toEqual(paused.player);
  await page.keyboard.press('Enter');
  await advanceFrames(page, 1);
  expect((await state(page)).tick).toBe(paused.tick + 1);
});

test('losing window focus pauses play and releases held movement and fire', async ({ page }) => {
  await startArena(page);
  await page.keyboard.down('d');
  await page.keyboard.down('ArrowRight');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const paused = await state(page);
  expect(paused.phase).toBe(2);
  await advanceFrames(page, 60);
  expect((await state(page)).tick).toBe(paused.tick);
  const controls = await call(page, 'getMetrics');
  expect(controls.input.fire).toBe(false);
  expect(controls.input.moveX).toBe(0);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('d');
});

test('hiding the document pauses without automatically resuming when visible', async ({ page }) => {
  await startArena(page);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    delete document.hidden;
    delete document.visibilityState;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect((await state(page)).phase).toBe(2);
});

test('help pauses the game, explains controls and closes with Escape', async ({ page }) => {
  await startArena(page);
  await page.keyboard.press('h');
  await expect(page.locator('#help-overlay')).toBeVisible();
  await expect(page.locator('#help-overlay')).toHaveAttribute('aria-modal', 'true');
  expect((await state(page)).phase).toBe(2);
  await page.keyboard.press('Escape');
  await expect(page.locator('#help-overlay')).toBeHidden();
  expect((await state(page)).phase).toBe(1);
});

test('boss arrives at 60 seconds and defeating it wins the round', async ({ page }) => {
  await startArena(page);
  await emptyCombat(page);
  await call(page, 'setTick', 3599);
  await advanceFrames(page, 1);
  let after = await state(page);
  expect(after.bossSpawned).toBe(true);
  expect(after.enemies.some(enemy => enemy.kind === 3)).toBe(true);
  await advanceFrames(page, 60);
  after = await state(page);
  const boss = after.enemies.find(enemy => enemy.kind === 3);
  await call(page, 'spawnBullet', 0, 0, boss.x, boss.z, 0, 0, 10000);
  await advanceFrames(page, 1);
  after = await state(page);
  expect(after.bossDead).toBe(true);
  expect(after.phase).toBe(3);
  await expect(page.locator('#play-again')).toBeVisible();
});

test('the 90-second deadline ends an unfinished boss encounter', async ({ page }) => {
  await startArena(page);
  await emptyCombat(page);
  await call(page, 'setTick', 5399);
  await advanceFrames(page, 1);
  expect((await state(page)).phase).toBe(4);
  expect((await state(page)).timeLeft).toBe(0);
  await expect(page.locator('#play-again')).toBeVisible();
});

test('best score and mute choice persist across reloads', async ({ page }) => {
  await startArena(page);
  await emptyCombat(page);
  await killEnemy(page);
  const scored = await state(page);
  await call(page, 'setPlayer', 0, 0, 1);
  await call(page, 'spawnBullet', 1, 3, 0, 0, 0, 0, 100);
  await advanceFrames(page, 1);
  expect(Number((await page.locator('#best').textContent()).replace(/\D/g, ''))).toBeGreaterThanOrEqual(scored.score);
  const initialMute = await page.locator('#mute').getAttribute('aria-pressed');
  await page.keyboard.press('m');
  const selectedMute = await page.locator('#mute').getAttribute('aria-pressed');
  expect(selectedMute).not.toBe(initialMute);
  await page.reload();
  await page.waitForFunction(() => window.__dashArenaTest?.isReady);
  await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', selectedMute);
  expect(Number((await page.locator('#best').textContent()).replace(/\D/g, ''))).toBeGreaterThanOrEqual(scored.score);
});

for (const viewport of [{ width: 1280, height: 720 }, { width: 1470, height: 850 }, { width: 1864, height: 1123 }]) {
  test(`keeps a large arena and all controls inside a ${viewport.width}×${viewport.height} desktop viewport`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openArena(page);
    await prepareVisualLayout(page);
    const layout = await page.evaluate(() => {
      const rect = document.getElementById('arena').getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom,
        scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight };
    });
    expect(layout.width).toBeGreaterThan(viewport.width * 0.7);
    expect(layout.height).toBeGreaterThan(viewport.height * 0.55);
    expect(layout.x).toBeGreaterThanOrEqual(0);
    expect(layout.y).toBeGreaterThanOrEqual(0);
    expect(layout.right).toBeLessThanOrEqual(viewport.width + 1);
    expect(layout.bottom).toBeLessThanOrEqual(viewport.height + 1);
    expect(layout.scrollWidth).toBeLessThanOrEqual(viewport.width + 1);
    expect(layout.scrollHeight).toBeLessThanOrEqual(viewport.height + 1);
  });
}

test('matches the desktop layout baseline', async ({ page }) => {
  await page.setViewportSize({ width: 1470, height: 850 });
  await openArena(page);
  await prepareVisualLayout(page);
  await expect(page).toHaveScreenshot('dash-arena-desktop-layout.png', visualOptions);
});

test.describe('Retina rendering', () => {
  test.use({ viewport: { width: 1470, height: 850 }, deviceScaleFactor: 2 });
  test('backs the visible arena with double-resolution GPU pixels', async ({ page }) => {
    await openArena(page);
    await prepareVisualLayout(page);
    const size = await page.locator('#arena').evaluate(canvas => ({
      width: canvas.width, height: canvas.height, cssWidth: canvas.clientWidth, cssHeight: canvas.clientHeight
    }));
    expect(size.width).toBeCloseTo(size.cssWidth * 2, -1);
    expect(size.height).toBeCloseTo(size.cssHeight * 2, -1);
  });
});

test.describe('portrait touch controls', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('keeps movement, fire and dash controls outside the visible arena without scrolling', async ({ page }) => {
    await openArena(page);
    await prepareVisualLayout(page);
    const layout = await page.evaluate(() => {
      const box = selector => {
        const rect = document.querySelector(selector).getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom };
      };
      return { canvas: box('#arena'), controls: ['#move-pad', '#touch-fire', '#touch-dash'].map(box),
        scrollHeight: document.documentElement.scrollHeight, scrollWidth: document.documentElement.scrollWidth };
    });
    expect(layout.canvas.height).toBeGreaterThan(844 * 0.4);
    expect(layout.canvas.width).toBeGreaterThan(390 * 0.85);
    for (const control of layout.controls) {
      expect(control.width).toBeGreaterThan(30);
      expect(control.y).toBeGreaterThanOrEqual(layout.canvas.bottom - 1);
      expect(control.bottom).toBeLessThanOrEqual(845);
    }
    expect(layout.scrollHeight).toBeLessThanOrEqual(845);
    expect(layout.scrollWidth).toBeLessThanOrEqual(391);
  });

  test('touch movement, held auto-aim fire and dash reach the Rust simulation', async ({ page }) => {
    await startArena(page);
    await emptyCombat(page);
    const pad = await page.locator('#move-pad').boundingBox();
    const before = (await state(page)).player;
    const pointer = { pointerType: 'touch', pointerId: 7, isPrimary: true, clientX: pad.x + pad.width * 0.8, clientY: pad.y + pad.height * 0.5 };
    await page.locator('#move-pad').dispatchEvent('pointerdown', pointer);
    await advanceFrames(page, 8);
    await page.locator('#move-pad').dispatchEvent('pointerup', pointer);
    expect(distance((await state(page)).player, before)).toBeGreaterThan(0.1);
    await page.locator('#touch-fire').dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 8 });
    await advanceFrames(page, 12);
    await page.locator('#touch-fire').dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 8 });
    expect((await state(page)).shots).toBeGreaterThan(0);
    await page.locator('#touch-dash').dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 9 });
    await advanceFrames(page, 1);
    await page.locator('#touch-dash').dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 9 });
    expect((await state(page)).dashes).toBeGreaterThan(0);
  });

  test('matches the portrait layout baseline', async ({ page }) => {
    await openArena(page);
    await prepareVisualLayout(page);
    await expect(page).toHaveScreenshot('dash-arena-portrait-layout.png', visualOptions);
  });
});

test('a dense stress scene stays finite and produces a renderable GPU batch', async ({ page }) => {
  await startArena(page);
  await call(page, 'stress', 300);
  await advanceFrames(page, 6);
  const scene = await state(page);
  expect(scene.enemies.length).toBeGreaterThan(100);
  expect(scene.enemies.every(enemy => Number.isFinite(enemy.x) && Number.isFinite(enemy.z))).toBe(true);
  const metrics = await call(page, 'getMetrics');
  expect(metrics.vertexCount).toBeGreaterThan(1000);
  expect(Number.isFinite(metrics.lastRenderMs)).toBe(true);
  expect(Number.isFinite(metrics.lastStepMs)).toBe(true);
});

test('a complete desktop round can start, move, shoot, dash, pause and replay using only the keyboard', async ({ page }) => {
  await openArena(page);
  await page.keyboard.press('Enter');
  expect((await state(page)).phase).toBe(1);
  await emptyCombat(page);
  await page.keyboard.down('w');
  await page.keyboard.down('ArrowRight');
  await advanceFrames(page, 10);
  await page.keyboard.up('w');
  await page.keyboard.up('ArrowRight');
  const played = await state(page);
  expect(played.shots).toBeGreaterThan(0);
  expect(played.player.x + played.player.z).toBeLessThan(0);
  await page.keyboard.press('Space');
  await advanceFrames(page, 1);
  expect((await state(page)).dashes).toBe(1);
  await page.keyboard.press('2');
  expect((await state(page)).weapon).toBe(1);
  await page.keyboard.press('p');
  const paused = await state(page);
  expect(paused.phase).toBe(2);
  await advanceFrames(page, 30);
  expect((await state(page)).tick).toBe(paused.tick);
  await page.keyboard.press('Enter');
  expect((await state(page)).phase).toBe(1);
  await advanceFrames(page, 20);
  await call(page, 'setPlayer', 0, 0, 1);
  await call(page, 'spawnBullet', 1, 3, 0, 0, 0, 0, 100);
  await advanceFrames(page, 1);
  expect((await state(page)).phase).toBe(4);
  await page.keyboard.press('Enter');
  const replay = await state(page);
  expect(replay.phase).toBe(1);
  expect(replay.tick).toBe(0);
  expect(replay.score).toBe(0);
  expect(replay.player.hp).toBe(100);
});
