const loading = document.getElementById('engine-loading');
const version = new URL(import.meta.url).searchParams.get('v')
  || document.querySelector('meta[name="dash-arena-build"]').content;
const versionedUrl = (path) => {
  const url = new URL(path, import.meta.url);
  url.searchParams.set('v', version);
  return url.href;
};

try {
  const [{ loadEngine }, { startApp }] = await Promise.all([
    import(versionedUrl('./engine.js')),
    import(versionedUrl('./app.js'))
  ]);
  const engine = await loadEngine(version);
  startApp(engine, version);
  document.documentElement.dataset.dashArenaEngine = engine.kind;
  document.documentElement.dataset.dashArenaRenderer = engine.renderer;
  loading.remove();
} catch (error) {
  loading.replaceChildren();
  const title = document.createElement('strong');
  title.textContent = 'The arena could not open.';
  const message = document.createElement('span');
  message.textContent = /graphics|WebGL/i.test(error.message)
    ? 'Try updating Chrome or enabling graphics acceleration, then try again.'
    : 'Check your connection and try again.';
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'primary-button';
  retry.textContent = 'Try again';
  retry.addEventListener('click', () => {
    const url = new URL(window.location.href);
    url.searchParams.set('v', version);
    window.location.replace(url.href);
  });
  loading.append(title, message, retry);
  retry.focus({ preventScroll: true });
  loading.dataset.error = String(error.message);
}
