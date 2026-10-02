import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
execFileSync(process.execPath, [resolve(root, 'scripts/compat-v2.mjs')], { cwd: root, stdio: 'inherit' });
execFileSync('cargo', ['test', '--locked', '-p', 'devicer-compat-v2'], { cwd: root, stdio: 'inherit' });
const build = execFileSync('cargo', ['build', '--release', '--locked', '-p', 'devicer-node', '--target-dir', resolve(root, 'target'), '--message-format=json'], {
  cwd: root,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
});
const artifact = build.trim().split('\n').map(line => JSON.parse(line)).find(event =>
  event.reason === 'compiler-artifact' && event.target.name === 'devicer_node' && event.target.crate_types.includes('cdylib'));
assert.ok(artifact, 'Cargo did not report the native addon artifact');
const library = artifact.filenames.find(filename => /\.(so|dylib|dll)$/.test(filename));
assert.ok(library, 'Cargo did not report a shared library');
const destination = resolve(root, '.compat-cache/bridge');
await mkdir(destination, { recursive: true });
await copyFile(library, resolve(destination, 'devicer.node'));
execFileSync(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'),
  '--noEmit', '--strict', '--skipLibCheck', '--target', 'ES2022', '--module', 'NodeNext',
  resolve(root, 'tests/bridge/consumer.ts')], { cwd: root, stdio: 'inherit' });
execFileSync(process.execPath, ['--test', resolve(root, 'tests/bridge/bridge.test.cjs')], {
  cwd: root,
  stdio: 'inherit',
  timeout: 30_000,
});