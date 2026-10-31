// Browser bindings only. Simulation, geometry and lighting execute in Rust/Wasm.
const hudKeys = ['phase', 'tick', 'timeLeft', 'score', 'kills', 'combo', 'maxCombo',
  'playerX', 'playerZ', 'hp', 'dashCd', 'dashFrames', 'weapon', 'enemyCount',
  'bulletCount', 'particleCount', 'bossHp', 'bossMaxHp', 'bossPresent', 'bossDead',
  'shots', 'explosions', 'propsDestroyed', 'damageTaken', 'dashes', 'aimX', 'aimZ', 'camX', 'camZ'];

export async function loadEngine(version) {
  const url = new URL('./dash-arena.wasm', import.meta.url);
  url.searchParams.set('v', version);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Arena download failed (${response.status})`);
  const bytes = await response.arrayBuffer();
  const { instance } = await WebAssembly.instantiate(bytes, {});
  const api = instance.exports;
  if (api.engine_version() !== 1) throw new Error('Unsupported arena engine');
  const decoder = new TextDecoder();
  const resources = new WeakMap();
  const defaults = () => ({ moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, dash: false, weapon: 0, autoAim: false, keyboardAim: true, aimDirX: 0, aimDirY: 0 });
  let controls = defaults();
  let lastAspect = 1;

  function hud() {
    const ptr = api.hud_ptr();
    const values = new Float32Array(api.memory.buffer, ptr, 32);
    const result = Object.fromEntries(hudKeys.map((key, i) => [key, values[i]]));
    result.bossPresent = Boolean(result.bossPresent);
    result.bossDead = Boolean(result.bossDead);
    result.player = { x: result.playerX, z: result.playerZ, hp: result.hp,
      dashCd: result.dashCd, dashFrames: result.dashFrames, aimX: result.aimX, aimZ: result.aimZ };
    return result;
  }

  function compile(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Graphics shader could not compile: ${error}`);
    }
    return shader;
  }

  function graphics(gl) {
    let cache = resources.get(gl);
    if (cache) return cache;
    const vertex = compile(gl, gl.VERTEX_SHADER, `#version 300 es
      precision highp float;
      layout(location = 0) in vec3 position;
      layout(location = 1) in vec4 color;
      out vec4 vertexColor;
      void main() { gl_Position = vec4(position, 1.0); vertexColor = color; }
    `);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, `#version 300 es
      precision highp float;
      in vec4 vertexColor;
      out vec4 outputColor;
      void main() { outputColor = vertexColor; }
    `);
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const error = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`Graphics program could not link: ${error}`);
    }
    const buffer = gl.createBuffer();
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);
    gl.bindVertexArray(null);
    cache = { program, buffer, vao, capacity: 0 };
    resources.set(gl, cache);
    gl.canvas.addEventListener('webglcontextrestored', () => resources.delete(gl));
    return cache;
  }

  const engine = {
    kind: 'rust-wasm',
    renderer: 'rust-webgl2',
    wasmBytes: bytes.byteLength,
    reset(seed = 1) { controls = defaults(); api.reset(seed >>> 0); },
    start(seed = 1) { controls = defaults(); api.start(seed >>> 0); },
    pause(value) { api.set_paused(Number(Boolean(value))); },
    input(next = {}, aspect = lastAspect) {
      controls = { ...controls, ...next };
      lastAspect = Math.max(0.1, Number(aspect) || 1);
      const input = controls.keyboardAim ? api.input_keyboard : api.input;
      input(controls.moveX, controls.moveY,
        controls.keyboardAim ? controls.aimDirX : controls.aimX,
        controls.keyboardAim ? controls.aimDirY : controls.aimY,
        Number(Boolean(controls.fire)), Number(Boolean(controls.dash)), controls.weapon,
        Number(Boolean(controls.autoAim)), lastAspect);
      controls.dash = false;
    },
    step(frames = 1) { api.step(Math.max(0, Math.floor(frames))); },
    hud,
    getState() {
      const ptr = api.snapshot_ptr();
      return JSON.parse(decoder.decode(new Uint8Array(api.memory.buffer, ptr, api.snapshot_len())));
    },
    render(gl, aspect) {
      if (gl.isContextLost()) return 0;
      const cache = graphics(gl);
      const count = api.render(Math.max(0.1, aspect));
      const data = new Float32Array(api.memory.buffer, api.vertices_ptr(), count * 7);
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.clearColor(0.035, 0.055, 0.085, 1);
      gl.clearDepth(1);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.CULL_FACE);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(cache.program);
      gl.bindVertexArray(cache.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, cache.buffer);
      if (data.byteLength > cache.capacity) {
        cache.capacity = 2 ** Math.ceil(Math.log2(Math.max(1024, data.byteLength)));
        gl.bufferData(gl.ARRAY_BUFFER, cache.capacity, gl.DYNAMIC_DRAW);
      }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
      gl.drawArrays(gl.TRIANGLES, 0, count);
      gl.bindVertexArray(null);
      return count;
    },
    test: {
      setTick: value => api.test_set_tick(value),
      setPlayer: (x, z, hp = 100) => api.test_set_player(x, z, hp),
      clearEnemies: () => api.test_clear_enemies(),
      clearBullets: () => api.test_clear_bullets(),
      clearProps: () => api.test_clear_props(),
      spawnEnemy: (kind, x, z, hp = 32) => api.test_spawn_enemy(kind, x, z, hp),
      spawnBullet: (owner, kind, x, z, dx, dz, damage = 10) => api.test_spawn_bullet(owner, kind, x, z, dx, dz, damage),
      setWeapon(value) { controls.weapon = value; api.test_set_weapon(value); },
      prepareVisualLayout() { controls = defaults(); api.test_scene(); controls.weapon = hud().weapon; },
      stress(count = 300) { controls = defaults(); api.test_stress(count); }
    }
  };
  return Object.freeze(engine);
}
