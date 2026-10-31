# Rust / WebAssembly Tetris

Solo Tetris requires the Rust engine at ../src/tetris-engine.wasm. Collision,
piece geometry, SRS rotation, hard-drop/ghost distance, merging, row resolution,
T-spin detection, clear scoring, and gravity speed execute in WebAssembly.
Rust also owns all Canvas drawing algorithms: board backdrop, gem blocks, ghost,
previews, clear effects/shake, and overlay typography. The bridge forwards native
Canvas2D calls through one import; it contains no drawing algorithms. JavaScript
handles timing, input, audio, persistence and DOM updates. Board backing dimensions
follow devicePixelRatio for sharp MacBook Retina rendering.
Versus mode retains its existing independent engine.

## Build and verify

Install Rust 1.99.1, add the wasm32-unknown-unknown target, and install Bun.
From tetris/: run bun install, bun run test:rust, bun run build:wasm,
then PLAYWRIGHT_CHANNEL=chrome bun run test to test installed Google Chrome.
Use bun run test:pages to verify the /html-games/tetris/ Pages base path.
The compiled Wasm binary is committed for direct static serving; rebuild after
editing Rust. Cargo.lock pins the dependency graph (there are no dependencies).

The Pages workflow builds and tests Rust before uploading the site. The loader
uses a URL relative to its own module, so staging and production subpaths work.
Both Bun servers return application/wasm. No backend is needed. Loading failures
show a retry action; there is no JavaScript physics fallback for solo Tetris.
