import assert from 'node:assert/strict';
import { loadPortableBridge, REQUIRED_EXPORTS } from '../packages/bridge-spike/portable-loader.cjs';

const bridge = await loadPortableBridge(async () => ({
  computeFieldAgreement: () => 50,
  computeTemporalDecayFactor: () => 1,
}));
assert.equal(bridge.portable, true);
for (const name of REQUIRED_EXPORTS) assert.equal(typeof bridge[name], 'function');
await assert.rejects(loadPortableBridge(() => ({})), /missing export/);
console.log('Portable loader contract passed; WASM module loading is injected at runtime.');