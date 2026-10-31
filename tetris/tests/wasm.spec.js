import { test, expect } from '@playwright/test';

test('boots the Rust Wasm engine and serves a valid module', async ({ page, request }) => {
  await page.addInitScript(() => localStorage.setItem('tetris-help-seen', '1'));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await page.waitForFunction(() => window.__tetrisTest?.isReady);
  expect(await page.evaluate(() => window.__tetrisTest.engine)).toBe('rust-wasm');
  expect(await page.evaluate(() => window.__tetrisTest.renderer)).toBe('rust-wasm-canvas2d');
  await expect(page.locator('html')).toHaveAttribute('data-tetris-renderer', 'rust-wasm-canvas2d');
  await expect(page.locator('#engine-loading')).toHaveCount(0);
  const response = await request.get('src/tetris-engine.wasm');
  expect(response.ok()).toBe(true);
  expect(response.headers()['content-type']).toContain('application/wasm');
  const bytes = await response.body();
  expect([...bytes.subarray(0, 4)]).toEqual([0, 97, 115, 109]);
  const module = await WebAssembly.compile(bytes);
  expect(module).toBeInstanceOf(WebAssembly.Module);
  const exports = WebAssembly.Module.exports(module).map(item => item.name);
  expect(exports).toEqual(expect.arrayContaining(['render_board', 'render_background', 'render_preview', 'render_overlay']));
  expect(WebAssembly.Module.imports(module).some(item => item.module === 'canvas2d')).toBe(true);
  expect(errors).toEqual([]);
});

test('a missing Wasm engine shows a retry action instead of starting a fallback', async ({ page }) => {
  await page.route('**/tetris-engine.wasm*', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.goto('./');
  await expect(page.locator('#engine-loading')).toContainText('WebAssembly engine could not load');
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  expect(await page.evaluate(() => window.__tetrisTest)).toBeUndefined();
});
