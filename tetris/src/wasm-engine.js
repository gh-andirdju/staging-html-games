// Browser bindings only: Rust owns rules and rendering instructions. This adapter
// forwards native Canvas2D calls and supplies canvas/context/cache lifecycles.
export async function loadTetrisEngine() {
  const moduleUrl = new URL(import.meta.url);
  const url = new URL('./tetris-engine.wasm', moduleUrl);
  const version = moduleUrl.searchParams.get('v');
  if (version) url.searchParams.set('v', version);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Tetris engine download failed (${response.status})`);
  let api;
  let context;
  let background;
  let gradient;
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const backgrounds = new WeakMap();
  const imports = {
    canvas2d: {
      call(op, a, b, c, d, e, ptr, length) {
        const value = length ? decoder.decode(new Uint8Array(api.memory.buffer, ptr, length)) : '';
        switch (op) {
          case 0: context.beginPath(); break;
          case 1: context.moveTo(a, b); break;
          case 2: context.arcTo(a, b, c, d, e); break;
          case 3: context.closePath(); break;
          case 4: context.fillStyle = value; break;
          case 5: context.fill(); break;
          case 6: context.lineWidth = a; break;
          case 7: context.strokeStyle = value; break;
          case 8: context.stroke(); break;
          case 9: context.save(); break;
          case 10: context.clip(); break;
          case 11: context.fillRect(a, b, c, d); break;
          case 12: context.restore(); break;
          case 13: context.translate(a, b); break;
          case 14: context.clearRect(a, b, c, d); break;
          case 15: gradient = context.createLinearGradient(a, b, c, d); break;
          case 16: gradient.addColorStop(a, value); break;
          case 17: context.fillStyle = gradient; break;
          case 18: context.drawImage(background, 0, 0, a, b); break;
          case 19: context.textAlign = value; break;
          case 20: context.textBaseline = value; break;
          case 21: context.font = value; break;
          case 22: return context.measureText(value).width;
          case 23: context.fillText(value, a, b); break;
          case 24: context.shadowColor = value; break;
          case 25: context.shadowBlur = a; break;
          default: throw new Error('Unknown Wasm Canvas2D operation');
        }
        return 0;
      }
    }
  };
  const { instance } = await WebAssembly.instantiate(await response.arrayBuffer(), imports);
  api = instance.exports;
  if (api.engine_version() !== 1) throw new Error('Unsupported Tetris engine version');

  const types = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
  const kind = (piece) => types.indexOf(piece.type) + 1;
  const spinCode = (spin) => spin === 'mini' ? 1 : spin ? 2 : 0;
  const output = () => new Int32Array(api.memory.buffer, api.output_ptr(), 8);
  let cols = 10;
  let rows = 20;
  const boardView = () => new Uint8Array(api.memory.buffer, api.board_ptr(), cols * rows);
  const rowView = () => new Uint8Array(api.memory.buffer, api.rows_ptr(), rows);
  const upload = (board) => {
    rows = board.length;
    cols = board[0]?.length ?? 0;
    if (!api.configure(cols, rows) || board.some((row) => row.length !== cols)) {
      throw new Error('Invalid Tetris board dimensions');
    }
    const view = boardView();
    for (let y = 0; y < rows; y += 1) view.set(board[y], y * cols);
  };
  const download = () => {
    const view = boardView();
    return Array.from({ length: rows }, (_, y) => Array.from(view.subarray(y * cols, (y + 1) * cols)));
  };
  const selectRows = (selected) => {
    const view = rowView();
    view.fill(0);
    for (const row of selected) {
      if (row >= 0 && row < rows) view[row] = 1;
    }
  };
  const args = (piece) => [kind(piece), piece.rotation, piece.x, piece.y];

  return Object.freeze({
    kind: 'rust-wasm',
    renderer: 'rust-wasm-canvas2d',
    version: api.engine_version(),
    cells(piece) {
      if (api.piece_cells(...args(piece)) !== 4) throw new Error('Unknown Tetris piece');
      const result = output();
      return Array.from({ length: 4 }, (_, index) => ({ x: result[index * 2], y: result[index * 2 + 1] }));
    },
    isValid(board, piece) {
      upload(board);
      return Boolean(api.is_valid(...args(piece)));
    },
    merge(board, piece) {
      upload(board);
      api.merge_piece(...args(piece), piece.index);
      return download();
    },
    rotate(board, piece, toRotation) {
      upload(board);
      const kick = api.rotate_piece(kind(piece), piece.rotation, toRotation, piece.x, piece.y);
      if (kick < 0) return null;
      const result = output();
      return { piece: { ...piece, rotation: toRotation, x: result[0], y: result[1] }, kick };
    },
    dropDistance(board, piece) {
      upload(board);
      return api.drop_distance(...args(piece));
    },
    fullRows(board) {
      upload(board);
      api.full_rows();
      return Array.from(rowView(), (selected, row) => selected ? row : -1).filter((row) => row >= 0);
    },
    collapseRows(board, selected) {
      upload(board);
      selectRows(selected);
      api.collapse_rows();
      return download();
    },
    clearWouldEmptyBoard(board, selected) {
      upload(board);
      selectRows(selected);
      return Boolean(api.clear_would_empty());
    },
    detectTSpin(board, piece, lastMoveRotation, lastKick) {
      if (!piece) return null;
      upload(board);
      return [null, 'mini', 'full'][api.detect_t_spin(...args(piece), Number(lastMoveRotation), lastKick)];
    },
    clearScore(cleared, tSpin, level, combo, backToBack, perfectClear) {
      return api.clear_score(cleared, spinCode(tSpin), level, combo, Number(backToBack), Number(perfectClear));
    },
    gravityFrames(level) {
      return api.gravity_frames(level);
    },
    drawBoard(canvas, state, { cellSize, ghostEnabled, reducedMotion, accent }) {
      upload(state.board);
      const width = cols * cellSize;
      const height = rows * cellSize;
      const pixelRatio = canvas.width / width;
      const clear = state.clearAnimation;
      selectRows(clear?.rows ?? []);
      let cache = backgrounds.get(canvas);
      if (!cache || cache.width !== canvas.width || cache.height !== canvas.height || cache.cellSize !== cellSize) {
        const offscreen = document.createElement('canvas');
        offscreen.width = canvas.width;
        offscreen.height = canvas.height;
        context = offscreen.getContext('2d');
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        api.render_background(width, height, cellSize);
        cache = { width: canvas.width, height: canvas.height, logicalWidth: width, logicalHeight: height, cellSize, canvas: offscreen };
        backgrounds.set(canvas, cache);
      }
      background = cache.canvas;
      context = canvas.getContext('2d');
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      const piece = state.current;
      api.render_board(width, height, cellSize,
        piece ? kind(piece) : 0, piece?.rotation ?? 0, piece?.x ?? 0, piece?.y ?? 0, piece?.index ?? 0,
        Number(ghostEnabled), Number(Boolean(clear)), clear?.frame ?? 0, clear?.totalFrames ?? 1,
        clear?.intensity ?? 0, Number(reducedMotion), parseInt(accent.slice(1), 16));
    },
    drawPreview(canvas, type) {
      if (!canvas) return;
      context = canvas.getContext('2d');
      context.setTransform(1, 0, 0, 1, 0, 0);
      api.render_preview(canvas.width, canvas.height, types.indexOf(type) + 1);
    },
    drawOverlay(canvas, title, subtitle, titleColor = '#eef1f6') {
      const cache = backgrounds.get(canvas);
      const width = Number(canvas.dataset?.logicalWidth) || cache?.logicalWidth || canvas.width;
      const height = Number(canvas.dataset?.logicalHeight) || cache?.logicalHeight || canvas.height;
      const pixelRatio = canvas.width / width;
      context = canvas.getContext('2d');
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      const titleBytes = encoder.encode(title);
      const subtitleBytes = encoder.encode(Array.isArray(subtitle) ? subtitle.join('\n') : subtitle);
      if (titleBytes.length + subtitleBytes.length > 16384) throw new Error('Tetris overlay text exceeds buffer');
      const buffer = new Uint8Array(api.memory.buffer, api.text_buffer_ptr(), 16384);
      buffer.set(titleBytes);
      buffer.set(subtitleBytes, titleBytes.length);
      api.render_overlay(width, height, titleBytes.length, subtitleBytes.length, parseInt(titleColor.slice(1), 16));
    }
  });
}
