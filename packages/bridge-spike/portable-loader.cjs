'use strict';

const REQUIRED_EXPORTS = ['computeFieldAgreement', 'computeTemporalDecayFactor'];

async function loadPortableBridge(loadModule) {
  if (typeof loadModule !== 'function') {
    throw new TypeError('Portable bridge requires a module loader function');
  }
  const loaded = await loadModule();
  const candidate = loaded && loaded.default && typeof loaded.default === 'object'
    ? loaded.default
    : loaded;
  for (const name of REQUIRED_EXPORTS) {
    if (!candidate || typeof candidate[name] !== 'function') {
      throw new TypeError(`Portable bridge is missing export: ${name}`);
    }
  }
  return Object.freeze({ ...candidate, portable: true });
}

exports.loadPortableBridge = loadPortableBridge;
exports.REQUIRED_EXPORTS = REQUIRED_EXPORTS;