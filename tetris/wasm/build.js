import { fileURLToPath } from 'node:url';

const cratePath = fileURLToPath(new URL('./Cargo.toml', import.meta.url));
const targetDir = fileURLToPath(new URL('./target/', import.meta.url));
const output = fileURLToPath(new URL('../src/tetris-engine.wasm', import.meta.url));
const result = Bun.spawnSync([
  'cargo', 'build', '--manifest-path', cratePath, '--locked', '--release',
  '--target', 'wasm32-unknown-unknown', '--target-dir', targetDir
], { stdout: 'inherit', stderr: 'inherit' });
if (result.exitCode !== 0) process.exit(result.exitCode || 1);
await Bun.write(output, Bun.file(`${targetDir}/wasm32-unknown-unknown/release/tetris_engine.wasm`));
console.log(`Built ${output} (${Bun.file(output).size} bytes)`);
