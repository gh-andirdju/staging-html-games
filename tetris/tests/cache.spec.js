import { test, expect } from '@playwright/test';

const expectedBuild = 'tetris-wasm-desktop-2026-10-31.2';
const runtimeAssets = ['bootstrap.js', 'game.js', 'wasm-engine.js', 'tetris-engine.wasm'];

function runtimeAssetName(url) {
  const asset = url.pathname.split('/').at(-1);
  return url.pathname.includes('/src/') && runtimeAssets.includes(asset) ? asset : null;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tetris-help-seen', '1'));
});

test('loads bootstrap, game modules and Wasm with the same HTML build version', async ({ page }) => {
  const requests = [];
  const errors = [];
  page.on('request', request => {
    const url = new URL(request.url());
    const asset = runtimeAssetName(url);
    if (asset) requests.push({ asset, version: url.searchParams.get('v') });
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await page.waitForFunction(() => window.__tetrisTest?.isReady);
  const build = await page.locator('meta[name="tetris-build"]').getAttribute('content');
  expect(build).toBe(expectedBuild);
  const bootstrapSrc = await page.locator('script[type="module"][src*="bootstrap.js"]').getAttribute('src');
  expect(new URL(bootstrapSrc, page.url()).searchParams.get('v')).toBe(build);
  for (const asset of runtimeAssets) {
    const matching = requests.filter(request => request.asset === asset);
    expect(matching.length, asset + ' was requested').toBeGreaterThan(0);
    expect(matching.every(request => request.version === build), asset + ' uses the current build').toBe(true);
  }
  expect(await page.evaluate(() => window.__tetrisTest.buildId)).toBe(build);
  await expect(page.locator('#engine-loading')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('bypasses obsolete unversioned cached modules and Wasm when starting the current build', async ({ page }) => {
  const staleRequests = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/src/**', async route => {
    const url = new URL(route.request().url());
    const asset = runtimeAssetName(url);
    if (asset && !url.search) {
      staleRequests.push(asset);
      await route.fulfill({
        status: 200,
        contentType: asset.endsWith('.wasm') ? 'application/wasm' : 'text/javascript',
        body: asset.endsWith('.wasm') ? 'obsolete binary' : 'window.__legacyTetrisCacheUsed = true;'
      });
      return;
    }
    await route.continue();
  });
  await page.goto('./');
  await page.waitForFunction(() => window.__tetrisTest?.isReady);
  expect(await page.evaluate(() => ({
    build: window.__tetrisTest.buildId,
    engine: window.__tetrisTest.engine,
    legacyCacheUsed: window.__legacyTetrisCacheUsed
  }))).toEqual({ build: expectedBuild, engine: 'rust-wasm', legacyCacheUsed: undefined });
  expect(staleRequests).toEqual([]);
  await expect(page.locator('#engine-loading')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a failed versioned game module shows retry and recovers after the download is restored', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const gameModule = url => url.pathname.endsWith('/src/game.js') && url.searchParams.has('v');
  await page.route(gameModule, route => route.fulfill({
    status: 503,
    contentType: 'text/javascript',
    body: 'Unavailable'
  }));
  await page.goto('./');
  await expect(page.locator('#engine-loading')).toContainText('WebAssembly engine could not load');
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(page.locator('#engine-loading')).not.toContainText('Loading WebAssembly');
  expect(await page.evaluate(() => window.__tetrisTest)).toBeUndefined();
  expect(errors).toEqual([]);
  await page.unroute(gameModule);
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.waitForFunction(() => window.__tetrisTest?.isReady);
  expect(await page.evaluate(() => window.__tetrisTest.buildId)).toBe(expectedBuild);
  await expect(page.locator('#engine-loading')).toHaveCount(0);
  expect(errors).toEqual([]);
});
