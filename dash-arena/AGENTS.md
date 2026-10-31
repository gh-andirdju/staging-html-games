# Dash Arena

Follow root AGENTS.md. Rust/Wasm owns deterministic fixed60fps simulation and GPU mesh rendering; JS only browser loading, input, audio, DOM and WebGL buffer binding. Use ENGINE-API.md across engine/UI/tests. No gameplay or rendering fallback in JavaScript.

Keep every boot asset versioned with the HTML build marker. Dynamic imports belong inside a visible retry error boundary. Paths must work under both /html-games/dash-arena/ and /staging-html-games/dash-arena/.

One90second round:3weapons,3enemy types, destructible cover+chain barrels, boss at60s, dash invulnerability, score/combo, death/win/timeout and replay. Desktop uses keyboard only: WASD move, arrows aim/fire, Space dash, 1-3 weapons, Enter start/replay, P/Escape pause, H help; portrait controls stay outside the canvas. Pause on blur/hidden; first load waits on Start.

Tests must exercise Rust-backed state through window.__dashArenaTest and deterministic advanceFrames. Include prepareVisualLayout with rich scene and desktop/portrait toHaveScreenshot baselines with animations disabled,fullPage false,maxDiffPixels10. Validate MacBook-sized and Retina layouts plus Pages paths. Use Bun commands only; no Node CLI/npm/Python server. Build Rust using cargo and tracked src/dash-arena.wasm. No generated target/ node_modules/ test-results/ in git.
