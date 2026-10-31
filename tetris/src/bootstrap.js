const loading = document.getElementById('engine-loading');
const version = new URL(import.meta.url).searchParams.get('v')
  || document.querySelector('meta[name="tetris-build"]').content;
const versionedUrl = (path) => {
  const url = new URL(path, import.meta.url);
  url.searchParams.set('v', version);
  return url.href;
};

try {
  // Import inside the error boundary: stale or unavailable modules must show a
  // retry action instead of leaving the loading screen up indefinitely.
  const [{ loadTetrisEngine }, { startGame }] = await Promise.all([
    import(versionedUrl('./wasm-engine.js')),
    import(versionedUrl('./game.js'))
  ]);
  const engine = await loadTetrisEngine();
  startGame(engine);
  document.documentElement.dataset.tetrisEngine = engine.kind;
  document.documentElement.dataset.tetrisRenderer = engine.renderer;
  loading.remove();
} catch (error) {
  loading.replaceChildren();
  const message = document.createElement('p');
  message.textContent = 'The WebAssembly engine could not load. Check your connection and try again.';
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = 'Try again';
  // A failed ES module remains cached in this document. A versioned navigation
  // obtains a new document and revalidates the entry point on GitHub Pages.
  retry.addEventListener('click', () => {
    const url = new URL(window.location.href);
    url.searchParams.set('v', version);
    window.location.replace(url.href);
  });
  loading.append(message, retry);
  loading.dataset.error = String(error.message);
}
