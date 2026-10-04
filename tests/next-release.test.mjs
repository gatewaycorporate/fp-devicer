import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertModelFreeFiles, packageInventory } from '../scripts/next-release-check.mjs';

test('reads array and package-name keyed npm inventories', () => {
  const pack = { files: [{ path: 'dist/main.js', size: 100 }] };
  assert.deepEqual(packageInventory(JSON.stringify([pack])), pack.files);
  assert.deepEqual(packageInventory(JSON.stringify({ 'devicer.js': pack })), pack.files);
  assert.throws(() => packageInventory('[]'), /Expected one/);
  assert.throws(() => packageInventory('{"bad":{}}'), /Expected one/);
});

test('rejects model source, checkpoints, renamed large binaries and stale packaged artifacts', () => {
  for (const path of [
    'vendor/models/Face/source.py', 'models/checkpoint', 'package/dist/weights.onnx',
    'dist/weights.safetensors', 'model.pt', 'model.pth', 'model.ckpt', 'model.bin',
    'crates/devicer-compat-v2/src/dsnet.rs', 'scripts/convert-detailsemnet.py',
    'dist/next/dsnet.js', 'dist/next/adaface/weights.dat',
  ]) assert.throws(() => assertModelFreeFiles([{ path }]), /prohibits/);
  assert.throws(() => assertModelFreeFiles([{ path: 'dist/renamed.dat', size: 17 * 1024 * 1024 }]), /Oversized/);
});

test('retains generic runtime interfaces, synthetic fixtures and model-free image helpers', () => {
  assert.doesNotThrow(() => assertModelFreeFiles([
    { path: 'dist/next/model-adapters.js', size: 10000 },
    { path: 'dist/next/node-model-runtime.js' },
    { path: 'src/tests/next/signal-profiles.test.ts' },
    { path: 'crates/devicer-compat-v2/examples/signature_usb.rs' },
  ]));
});