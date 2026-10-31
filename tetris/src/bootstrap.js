import { loadTetrisEngine } from './wasm-engine.js';
import { startGame } from './game.js';

const loading = document.getElementById('engine-loading');
try {
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
  retry.addEventListener('click', () => window.location.reload());
  loading.append(message, retry);
  loading.dataset.error = String(error.message);
}
