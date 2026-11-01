const STEP_MS = 1000 / 60;
const WEAPONS = ['Blaster', 'Shotgun', 'Launcher'];
const BEST_KEY = 'dash-arena-best';
const MUTE_KEY = 'dash-arena-muted';

function readStored(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function store(key, value) {
  try { localStorage.setItem(key, String(value)); } catch { /* Private browsing may disable storage. */ }
}
function freshSeed() {
  try { return crypto.getRandomValues(new Uint32Array(1))[0] || 1; } catch { return Date.now() >>> 0 || 1; }
}
function createAudio() {
  let muted = readStored(MUTE_KEY, '0') === '1';
  let context = null;
  let master = null;
  function unlock() {
    if (navigator.webdriver || muted) return;
    try {
      if (!context) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return;
        context = new Audio({ latencyHint: 'interactive' });
        master = context.createGain();
        master.gain.value = 0.11;
        master.connect(context.destination);
      }
      if (context.state === 'suspended') context.resume().catch(() => {});
    } catch { /* Audio is optional; gameplay always stays available. */ }
  }
  function tone(frequency, endFrequency, duration, type = 'triangle', volume = 0.5, delay = 0) {
    if (muted || !context || context.state !== 'running' || navigator.webdriver) return;
    const now = context.currentTime + delay;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + duration + 0.01);
  }
  return {
    unlock,
    get muted() { return muted; },
    setMuted(value) { muted = Boolean(value); store(MUTE_KEY, muted ? 1 : 0); if (!muted) unlock(); },
    shoot(weapon) {
      if (weapon === 2) tone(130, 45, 0.13, 'sawtooth', 0.55);
      else if (weapon === 1) tone(270, 70, 0.085, 'sawtooth', 0.4);
      else tone(950, 360, 0.035, 'square', 0.18);
    },
    dash() { tone(190, 780, 0.11, 'triangle', 0.45); },
    explosion() { tone(95, 25, 0.22, 'sawtooth', 0.6); tone(180, 40, 0.12, 'square', 0.15); },
    hit() { tone(170, 70, 0.09, 'square', 0.25); },
    end(won) {
      if (won) { tone(440, 440, 0.11); tone(660, 660, 0.11, 'triangle', 0.5, 0.12); tone(880, 880, 0.25, 'triangle', 0.5, 0.24); }
      else tone(210, 45, 0.4, 'triangle', 0.5);
    }
  };
}

export function startApp(engine, buildId) {
  const byId = id => document.getElementById(id);
  const shell = document.querySelector('.game-shell');
  const canvas = byId('arena');
  const stage = byId('arena-stage');
  const overlay = byId('run-overlay');
  const helpOverlay = byId('help-overlay');
  const pauseButton = byId('pause');
  const muteButton = byId('mute');
  const fireButton = byId('touch-fire');
  const dashButton = byId('touch-dash');
  const movePad = byId('move-pad');
  const weaponButtons = [...document.querySelectorAll('[data-weapon]')];
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: true, depth: true,
    powerPreference: 'high-performance', preserveDrawingBuffer: true });
  if (!gl) throw new Error('WebGL2 graphics are unavailable');

  const audio = createAudio();
  let bestScore = Math.max(0, Number(readStored(BEST_KEY, '0')) || 0);
  let autoStep = true;
  let rafId = null;
  let lastTime = 0;
  let accumulator = 0;
  let aspect = 1;
  let pixelRatio = window.devicePixelRatio || 1;
  let lastHud = null;
  let helpDidPause = false;
  let helpReturnFocus = null;
  let finishedRecord = false;
  let movePointer = null;
  let firePointer = null;
  let keyboardTouchFire = false;
  let touchMoveX = 0;
  let touchMoveY = 0;
  let contextLost = false;
  const keys = new Set();
  const controls = { moveX: 0, moveY: 0, aimX: 0.4, aimY: 0.15,
    continuousAim: true, turnAim: 0, fineAim: false,
    fire: false, dash: false, weapon: 0, autoAim: false };
  const metrics = { ready: false, renderCount: 0, vertexCount: 0, frameCount: 0,
    lastStepMs: 0, lastRenderMs: 0, frameTimes: [], width: 0, height: 0 };

  const setText = (id, value) => {
    const element = byId(id);
    const text = String(value);
    if (element.textContent !== text) element.textContent = text;
  };
  function announce(text) { setText('announcer', text); }
  function currentPhase() { return engine.hud().phase; }
  function resetControls() {
    keys.clear();
    controls.moveX = controls.moveY = 0;
    controls.fire = controls.dash = controls.autoAim = false;
    touchMoveX = touchMoveY = 0;
    movePointer = firePointer = null;
    keyboardTouchFire = false;
    controls.continuousAim = true;
    controls.turnAim = 0;
    controls.fineAim = false;
    movePad.style.setProperty('--stick-x', '0px');
    movePad.style.setProperty('--stick-y', '0px');
    fireButton.classList.remove('pressed');
    engine.input(controls, aspect);
  }
  function syncMovement() {
    const x = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
    const y = Number(keys.has('KeyS')) - Number(keys.has('KeyW'));
    controls.moveX = x || touchMoveX;
    controls.moveY = y || touchMoveY;
  }
  function syncFiring() {
    const upHeld = keys.has('ArrowUp');
    const touchHeld = firePointer !== null || keyboardTouchFire;
    controls.continuousAim = true;
    controls.turnAim = Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'));
    controls.fineAim = keys.has('ShiftLeft') || keys.has('ShiftRight');
    controls.fire = upHeld || touchHeld;
    controls.autoAim = touchHeld && !upHeld && controls.turnAim === 0;
    fireButton.classList.toggle('pressed', touchHeld);
  }
  function syncMute() {
    muteButton.dataset.muted = String(audio.muted);
    muteButton.setAttribute('aria-pressed', String(audio.muted));
    muteButton.setAttribute('aria-label', audio.muted ? 'Enable sound' : 'Mute sound');
  }
  function setWeapon(value) {
    controls.weapon = Math.max(0, Math.min(2, Math.floor(Number(value) || 0)));
    engine.input(controls, aspect);
    controls.dash = false;
    refresh();
  }
  function syncHud(hud) {
    const seconds = Math.max(0, Math.ceil(hud.timeLeft));
    setText('time-left', `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`);
    document.querySelector('.timer-stat').classList.toggle('warning', seconds <= 15 && hud.phase === 1);
    setText('score', Math.round(hud.score));
    setText('kills', Math.round(hud.kills));
    setText('combo', `×${Math.max(1, Math.round(hud.combo))}`);
    setText('health-value', Math.max(0, Math.ceil(hud.hp)));
    byId('health-fill').style.setProperty('--health', `${Math.max(0, Math.min(100, hud.hp))}%`);
    document.querySelector('.vitals').classList.toggle('danger', hud.hp <= 30);
    byId('dash-fill').style.setProperty('--dash', `${100 * Math.max(0, 1 - hud.dashCd / 72)}%`);
    setText('dash-status', hud.dashCd > 0 ? `${(hud.dashCd / 60).toFixed(1)}s` : 'Ready');
    dashButton.classList.toggle('cooldown', hud.dashCd > 0);
    byId('boss-hud').hidden = !hud.bossPresent || hud.bossDead;
    const bossPct = hud.bossMaxHp > 0 ? Math.max(0, 100 * hud.bossHp / hud.bossMaxHp) : 0;
    byId('boss-fill').style.setProperty('--boss', `${bossPct}%`);
    setText('boss-health', `${Math.ceil(bossPct)}%`);
    const bossIn = Math.max(0, Math.ceil(60 - hud.tick / 60));
    setText('mission-note', hud.bossDead ? 'Warden neutralized' : hud.bossPresent ? 'Take down the Warden' : `Boss in ${Math.floor(bossIn / 60)}:${String(bossIn % 60).padStart(2, '0')}`);
    for (const button of weaponButtons) {
      const selected = Number(button.dataset.weapon) === hud.weapon;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
    const phaseNames = ['STANDBY', 'LIVE', 'PAUSED', 'CLEARED', 'ROUND OVER'];
    setText('arena-status', `SECTOR 01 / ${phaseNames[hud.phase] || 'STANDBY'}`);
    const paused = hud.phase === 2;
    pauseButton.disabled = hud.phase !== 1 && hud.phase !== 2;
    pauseButton.setAttribute('aria-pressed', String(paused));
    pauseButton.setAttribute('aria-label', paused ? 'Resume game' : 'Pause game');
    pauseButton.querySelector('.toolbar-word').textContent = paused ? 'Resume' : 'Pause';
    overlay.hidden = hud.phase === 1;
    byId('ready-panel').hidden = hud.phase !== 0;
    byId('pause-panel').hidden = hud.phase !== 2;
    byId('result-panel').hidden = hud.phase !== 3 && hud.phase !== 4;
    const summary = `Dash Arena. ${['Ready', 'Playing', 'Paused', 'Victory', 'Round over'][hud.phase]}. Health ${Math.ceil(hud.hp)}, ${seconds} seconds left, score ${hud.score}. ${WEAPONS[hud.weapon]}.`;
    if (canvas.getAttribute('aria-label') !== summary) canvas.setAttribute('aria-label', summary);
    if (lastHud && lastHud.phase === 1) {
      if (hud.shots > lastHud.shots) audio.shoot(hud.weapon);
      if (hud.dashes > lastHud.dashes) audio.dash();
      if (hud.explosions > lastHud.explosions) audio.explosion();
      if (hud.damageTaken > lastHud.damageTaken) audio.hit();
    }
    if (!lastHud || hud.phase !== lastHud.phase) {
      if (hud.phase === 1) announce('Round started. Keep moving and defeat the Warden before time runs out.');
      if (hud.phase === 2) announce('Game paused.');
      if (hud.phase === 3 || hud.phase === 4) {
        finishedRecord = hud.score > bestScore;
        if (finishedRecord) { bestScore = hud.score; store(BEST_KEY, bestScore); }
        const won = hud.phase === 3;
        const timedOut = !won && hud.hp > 0 && hud.timeLeft <= 0;
        setText('result-kicker', won ? 'WARDEN NEUTRALIZED' : timedOut ? 'THE CLOCK WON THIS ONE' : 'BACK STRONGER NEXT ROUND');
        setText('result-title', won ? 'Arena cleared.' : timedOut ? 'Time’s up.' : 'Knocked out.');
        byId('result-panel').dataset.won = String(won);
        setText('final-score', Math.round(hud.score));
        setText('final-kills', hud.kills);
        setText('final-combo', hud.maxCombo);
        setText('final-best', bestScore);
        byId('new-record').hidden = !finishedRecord;
        audio.end(won);
        announce(`${won ? 'Victory' : 'Round over'}. Score ${hud.score}. ${hud.kills} eliminations.`);
        resetControls();
      }
    }
    if (hud.bossPresent && !lastHud?.bossPresent) announce('The Warden has entered the arena.');
    setText('best', bestScore);
    lastHud = { ...hud };
  }
  function refresh() {
    if (contextLost) return;
    const start = performance.now();
    const hud = engine.hud();
    metrics.vertexCount = engine.render(gl, aspect);
    metrics.renderCount += 1;
    metrics.lastRenderMs = performance.now() - start;
    syncHud(hud);
  }
  function resize() {
    const box = canvas.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return;
    pixelRatio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(box.width * pixelRatio));
    const height = Math.max(1, Math.round(box.height * pixelRatio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    aspect = box.width / box.height;
    metrics.width = box.width;
    metrics.height = box.height;
    canvas.dataset.logicalWidth = String(box.width);
    canvas.dataset.logicalHeight = String(box.height);
    refresh();
  }
  function tickOne() {
    engine.input(controls, aspect);
    controls.dash = false;
    engine.step(1);
    metrics.frameCount += 1;
  }
  function advanceFrames(frames = 1) {
    const count = Math.max(0, Math.floor(Number(frames) || 0));
    const start = performance.now();
    for (let i = 0; i < count; i += 1) tickOne();
    metrics.lastStepMs = performance.now() - start;
    refresh();
  }
  function frame(now) {
    rafId = null;
    if (!autoStep) return;
    const delta = lastTime ? Math.min(100, Math.max(0, now - lastTime)) : 0;
    lastTime = now;
    if (currentPhase() === 1 && helpOverlay.hidden) {
      if (delta > 0) {
        metrics.frameTimes.push(delta);
        if (metrics.frameTimes.length > 120) metrics.frameTimes.shift();
      }
      accumulator += delta;
      let frames = 0;
      const start = performance.now();
      while (accumulator >= STEP_MS) {
        tickOne();
        accumulator -= STEP_MS;
        frames += 1;
      }
      metrics.lastStepMs = performance.now() - start;
      if (frames > 0) refresh();
    } else accumulator = 0;
    rafId = requestAnimationFrame(frame);
  }
  function setAutoStep(value) {
    autoStep = Boolean(value);
    lastTime = 0;
    accumulator = 0;
    if (autoStep && rafId === null) rafId = requestAnimationFrame(frame);
    if (!autoStep && rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  }
  function startRun(seed = freshSeed()) {
    resetControls();
    controls.weapon = 0;
    engine.start(seed >>> 0 || 1);
    lastHud = null;
    finishedRecord = false;
    lastTime = 0;
    accumulator = 0;
    refresh();
    canvas.focus({ preventScroll: true });
  }
  function resetRun(seed = 1) {
    resetControls();
    controls.weapon = 0;
    engine.reset(seed >>> 0 || 1);
    lastHud = null;
    lastTime = 0;
    accumulator = 0;
    refresh();
  }
  function togglePause() {
    const phase = currentPhase();
    if (phase !== 1 && phase !== 2) return;
    resetControls();
    engine.pause(phase === 1);
    lastTime = 0;
    accumulator = 0;
    refresh();
  }
  function autoPause() {
    resetControls();
    if (currentPhase() === 1 && helpOverlay.hidden) { engine.pause(true); refresh(); }
    lastTime = 0;
    accumulator = 0;
  }
  function openHelp() {
    if (!helpOverlay.hidden) return;
    audio.unlock();
    helpDidPause = currentPhase() === 1;
    helpReturnFocus = document.activeElement;
    resetControls();
    if (helpDidPause) engine.pause(true);
    refresh();
    helpOverlay.hidden = false;
    shell.inert = true;
    byId('help-close').focus({ preventScroll: true });
  }
  function closeHelp() {
    if (helpOverlay.hidden) return;
    helpOverlay.hidden = true;
    shell.inert = false;
    if (helpDidPause && currentPhase() === 2) engine.pause(false);
    helpDidPause = false;
    lastTime = 0;
    accumulator = 0;
    refresh();
    (currentPhase() === 1 ? canvas : helpReturnFocus instanceof HTMLElement ? helpReturnFocus : canvas).focus({ preventScroll: true });
  }
  function requestDash() {
    if (currentPhase() !== 1) return;
    audio.unlock();
    controls.dash = true;
  }
  byId('start').addEventListener('click', () => { audio.unlock(); startRun(); });
  byId('play-again').addEventListener('click', () => { audio.unlock(); startRun(); });
  byId('resume').addEventListener('click', () => { audio.unlock(); togglePause(); canvas.focus({ preventScroll: true }); });
  byId('restart').addEventListener('click', () => { audio.unlock(); startRun(); });
  pauseButton.addEventListener('click', togglePause);
  muteButton.addEventListener('click', () => { audio.setMuted(!audio.muted); syncMute(); });
  byId('help').addEventListener('click', openHelp);
  byId('help-close').addEventListener('click', closeHelp);
  weaponButtons.forEach(button => button.addEventListener('click', () => { audio.unlock(); setWeapon(Number(button.dataset.weapon)); }));
  helpOverlay.addEventListener('click', event => { if (event.target === helpOverlay) closeHelp(); });
  helpOverlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); closeHelp(); return; }
    if (event.key !== 'Tab') return;
    const elements = [...helpOverlay.querySelectorAll('button, a, input, select, [tabindex="0"]')].filter(element => !element.disabled && element.getClientRects().length);
    const first = elements[0], last = elements.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  window.addEventListener('keydown', event => {
    if (!helpOverlay.hidden || event.defaultPrevented) return;
    if (event.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    if ((event.code === 'Space' || event.key === 'Enter') && event.target.closest?.('button, a, [role="button"]')) return;
    const code = event.code || event.key;
    if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(code)) event.preventDefault();
    audio.unlock();
    if ((code === 'KeyP' || code === 'Escape') && !event.repeat) { togglePause(); return; }
    if (code === 'KeyR' && !event.repeat) { startRun(); return; }
    if (code === 'KeyM' && !event.repeat) { audio.setMuted(!audio.muted); syncMute(); return; }
    if (code === 'KeyH' && !event.repeat) { openHelp(); return; }
    if (code === 'Enter' && !event.repeat) {
      const phase = currentPhase();
      if (phase === 0 || phase === 3 || phase === 4) startRun();
      else if (phase === 2) { togglePause(); canvas.focus({ preventScroll: true }); }
      return;
    }
    if (currentPhase() !== 1) return;
    if (['Digit1','Digit2','Digit3','Numpad1','Numpad2','Numpad3'].includes(code)) { setWeapon(Number(code.at(-1)) - 1); return; }
    if (code === 'Space' && !event.repeat) { requestDash(); return; }
    if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight'].includes(code)) {
      keys.add(code);
      syncMovement();
      syncFiring();
    }
  });
  window.addEventListener('keyup', event => {
    keys.delete(event.code || event.key);
    syncMovement();
    syncFiring();
  });
  window.addEventListener('blur', autoPause);
  window.addEventListener('focus', () => { lastTime = 0; accumulator = 0; });
  document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); else { lastTime = 0; accumulator = 0; } });
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  function updateStick(event) {
    const box = movePad.getBoundingClientRect();
    const radius = Math.min(box.width, box.height) * 0.32;
    const x = (event.clientX - box.left - box.width / 2) / radius;
    const y = (event.clientY - box.top - box.height / 2) / radius;
    const length = Math.max(1, Math.hypot(x, y));
    touchMoveX = x / length;
    touchMoveY = y / length;
    movePad.style.setProperty('--stick-x', `${touchMoveX * radius}px`);
    movePad.style.setProperty('--stick-y', `${touchMoveY * radius}px`);
    syncMovement();
  }
  movePad.addEventListener('pointerdown', event => {
    if (currentPhase() !== 1 || movePointer !== null) return;
    event.preventDefault();
    audio.unlock();
    movePointer = event.pointerId;
    updateStick(event);
    try { movePad.setPointerCapture(event.pointerId); } catch { /* Synthetic pointer. */ }
  });
  movePad.addEventListener('pointermove', event => { if (event.pointerId === movePointer) updateStick(event); });
  function releaseStick(event) {
    if (event.pointerId !== movePointer) return;
    movePointer = null;
    touchMoveX = touchMoveY = 0;
    movePad.style.setProperty('--stick-x', '0px');
    movePad.style.setProperty('--stick-y', '0px');
    syncMovement();
  }
  movePad.addEventListener('pointerup', releaseStick);
  movePad.addEventListener('pointercancel', releaseStick);
  movePad.addEventListener('lostpointercapture', releaseStick);
  fireButton.addEventListener('pointerdown', event => {
    if (currentPhase() !== 1 || firePointer !== null) return;
    event.preventDefault();
    audio.unlock();
    firePointer = event.pointerId;
    syncFiring();
    try { fireButton.setPointerCapture(event.pointerId); } catch { /* Synthetic pointer. */ }
  });
  function releaseFire(event) {
    if (event.pointerId !== firePointer) return;
    firePointer = null;
    syncFiring();
  }
  fireButton.addEventListener('pointerup', releaseFire);
  fireButton.addEventListener('pointercancel', releaseFire);
  fireButton.addEventListener('lostpointercapture', releaseFire);
  fireButton.addEventListener('keydown', event => {
    if (event.code === 'Space' || event.key === 'Enter') {
      event.preventDefault();
      if (currentPhase() === 1) { audio.unlock(); keyboardTouchFire = true; syncFiring(); }
    }
  });
  fireButton.addEventListener('keyup', event => {
    if (event.code === 'Space' || event.key === 'Enter') { event.preventDefault(); keyboardTouchFire = false; syncFiring(); }
  });
  dashButton.addEventListener('pointerdown', event => { event.preventDefault(); requestDash(); });
  dashButton.addEventListener('click', event => { if (event.detail === 0) requestDash(); });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    contextLost = true;
    setAutoStep(false);
    resetControls();
    engine.pause(true);
    const message = document.createElement('div');
    message.className = 'engine-loading';
    message.setAttribute('role', 'status');
    const title = document.createElement('strong');
    title.textContent = 'The graphics connection was interrupted.';
    const retry = document.createElement('button');
    retry.className = 'primary-button';
    retry.textContent = 'Reload arena';
    retry.addEventListener('click', () => window.location.reload());
    message.append(title, retry);
    document.body.append(message);
  });

  syncMute();
  engine.reset(1);
  new ResizeObserver(resize).observe(stage);
  window.addEventListener('resize', resize);
  resize();
  metrics.ready = true;
  const mutate = (method, ...args) => { const result = engine.test[method](...args); refresh(); return result; };
  window.__dashArenaTest = {
    isReady: true,
    buildId,
    engine: engine.kind,
    renderer: engine.renderer,
    getState: () => engine.getState(),
    start: (seed = 1) => startRun(seed),
    reset: (seed = 1) => resetRun(seed),
    setAutoStep,
    advanceFrames,
    setInput(values = {}) {
      Object.assign(controls, values);
      if (values.weapon !== undefined) engine.test.setWeapon(values.weapon);
      refresh();
    },
    setWeapon,
    setTick: value => mutate('setTick', value),
    setPlayer: (x, z, hp = 100) => mutate('setPlayer', x, z, hp),
    clearEnemies: () => mutate('clearEnemies'),
    clearBullets: () => mutate('clearBullets'),
    clearProps: () => mutate('clearProps'),
    spawnEnemy: (...args) => mutate('spawnEnemy', ...args),
    spawnBullet: (...args) => mutate('spawnBullet', ...args),
    async prepareVisualLayout() {
      setAutoStep(false);
      resetControls();
      engine.test.prepareVisualLayout();
      controls.weapon = engine.hud().weapon;
      lastHud = null;
      await document.fonts.ready;
      resize();
    },
    stress: count => { resetControls(); engine.test.stress(count); refresh(); },
    getMetrics() {
      const sorted = [...metrics.frameTimes].sort((a, b) => a - b);
      const avgFrameMs = sorted.length ? sorted.reduce((sum, time) => sum + time, 0) / sorted.length : 0;
      return { ready: metrics.ready, renderCount: metrics.renderCount, vertexCount: metrics.vertexCount,
        frameCount: metrics.frameCount, lastStepMs: metrics.lastStepMs, lastRenderMs: metrics.lastRenderMs,
        avgFrameMs, p95FrameMs: sorted[Math.floor(sorted.length * 0.95)] || 0,
        fps: avgFrameMs ? 1000 / avgFrameMs : 0, width: metrics.width, height: metrics.height,
        pixelRatio, autoStep, input: { ...controls }, webglVersion: gl.getParameter(gl.VERSION),
        renderer: gl.getParameter(gl.RENDERER), wasmBytes: engine.wasmBytes };
    },
    getMuted: () => audio.muted,
    setMuted(value) { audio.setMuted(value); syncMute(); },
    getBest: () => bestScore,
    pause: value => { resetControls(); engine.pause(Boolean(value)); refresh(); },
    render: refresh
  };
  document.documentElement.dataset.dashArenaBuild = buildId;
  setAutoStep(true);
  byId('start').focus({ preventScroll: true });
}
