'use strict';

const native = require('../../.compat-cache/bridge/devicer.node');
const { decodeBridgeValue, encodeBridgeValue } = require('./value-codec.cjs');
const { loadPortableBridge } = require('./portable-loader.cjs');
const DEFAULT_DECAY_HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000;

function isPresent(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

exports.computeFieldAgreement = function computeFieldAgreement(left, right, options) {
  if (options?.useGlobalRegistry !== false) {
    throw new TypeError('Bridge prototype requires useGlobalRegistry: false');
  }
  const comparators = { ...options.comparators };
  let callbackFailed = false;
  let callbackFailure;
  try {
    return native.computeFieldAgreement(field => {
      try {
        const first = left[field];
        const second = right[field];
        if (!isPresent(first) || !isPresent(second)) return undefined;
        const comparator = comparators[field];
        if (comparator) return Math.max(0, Math.min(1, comparator(first, second, field)));
        if (typeof first === 'object' && first !== null && typeof second === 'object' && second !== null) {
          throw new TypeError('Bridge prototype requires a custom comparator for object pairs');
        }
        return Number(first === second);
      } catch (error) {
        callbackFailed = true;
        callbackFailure = error;
        throw new Error('Host comparison failed');
      }
    });
  } catch (error) {
    if (callbackFailed) throw callbackFailure;
    throw error;
  }
};

exports.computeTemporalDecayFactor = function computeTemporalDecayFactor(age, halfLife = DEFAULT_DECAY_HALF_LIFE_MS) {
  if (typeof age !== 'number' || typeof halfLife !== 'number') {
    throw new TypeError('Bridge prototype requires numeric decay arguments');
  }
  return native.computeTemporalDecayFactor(age, halfLife);
};

exports.calculateScoreBreakdown = function calculateScoreBreakdown(left, right, options = {}) {
  const optionKeys = Object.keys(options);
  const nativeOptionsOnly = optionKeys.every(key => key === 'snapshotAgeMs' || key === 'decayHalfLifeMs');
  if (!nativeOptionsOnly) {
    throw new TypeError('Bridge prototype requires native-compatible scoring options');
  }
  const result = native.calculateScoreBreakdownJson(
    JSON.stringify(left),
    JSON.stringify(right),
    options.snapshotAgeMs,
    options.decayHalfLifeMs,
  );
  return JSON.parse(result);
};

exports.calculateConfidence = function calculateConfidence(left, right, options = {}) {
  return exports.calculateScoreBreakdown(left, right, options).composite;
};

exports.getHash = function getHash(value) {
  if (typeof value === 'string') return native.getHashText(value);
  return native.getHashJson(JSON.stringify(value));
};

exports.compareHashes = function compareHashes(first, second) {
  return native.compareHashes(first, second);
};

exports.subnetKey = function subnetKey(ip) {
  return native.subnetKey(ip) ?? undefined;
};

exports.jaccardSimilarity = function jaccardSimilarity(left, right) {
  return native.jaccardSimilarity(JSON.stringify(left), JSON.stringify(right));
};

exports.queryLsh = function queryLsh(entries, fingerprint, options = {}) {
  return JSON.parse(native.lshQueryJson(
    JSON.stringify(entries),
    JSON.stringify(fingerprint),
    options.numHashes,
    options.numBands,
  ));
};

exports.computeDeviceDrift = function computeDeviceDrift(incoming, history, options = {}) {
  const snapshots = history.map(snapshot => ({
    timestampMs: snapshot.timestamp instanceof Date
      ? snapshot.timestamp.getTime()
      : Number(snapshot.timestamp),
    fingerprint: snapshot.fingerprint,
  }));
  return JSON.parse(native.computeDeviceDriftJson(
    JSON.stringify(incoming),
    JSON.stringify(snapshots),
    options.suspiciousZScoreThreshold,
  ));
};

exports.awaitHostNumber = function awaitHostNumber(hostOperation) {
  if (typeof hostOperation !== 'function') {
    throw new TypeError('Bridge prototype requires a host operation function');
  }
  return native.awaitHostNumber(Promise.resolve().then(hostOperation));
};

exports.awaitHostValue = function awaitHostValue(hostOperation) {
  if (typeof hostOperation !== 'function') {
    throw new TypeError('Bridge prototype requires a host operation function');
  }
  const payload = Promise.resolve().then(hostOperation).then(encodeBridgeValue);
  return native.awaitHostText(payload).then(decodeBridgeValue);
};

exports.runHostSequence = async function runHostSequence(hostOperations) {
  if (!Array.isArray(hostOperations)) {
    throw new TypeError('Bridge prototype requires an array of host operations');
  }
  const operations = [...hostOperations];
  const results = [];
  for (const operation of operations) {
    if (typeof operation !== 'function') {
      throw new TypeError('Bridge prototype requires host operation functions');
    }
    const payload = Promise.resolve().then(operation).then(encodeBridgeValue);
    results.push(decodeBridgeValue(await native.awaitHostText(payload)));
  }
  return results;
};

exports.createStorageBridge = function createStorageBridge(hostAdapter) {
  if (!hostAdapter || typeof hostAdapter !== 'object') {
    throw new TypeError('Bridge prototype requires a storage adapter object');
  }
  const required = ['init', 'save', 'getHistory', 'findCandidates', 'linkToUser', 'deleteOldSnapshots', 'getAllFingerprints'];
  for (const method of required) {
    if (typeof hostAdapter[method] !== 'function') {
      throw new TypeError(`Bridge prototype requires storage method: ${method}`);
    }
  }
  const bridge = {};
  for (const method of required) {
    bridge[method] = (...args) => exports.awaitHostValue(() => hostAdapter[method](...args));
  }
  if (typeof hostAdapter.close === 'function') {
    bridge.close = () => exports.awaitHostValue(() => hostAdapter.close());
  }
  return bridge;
};

exports.runPostProcessorSequence = async function runPostProcessorSequence(processors, payload) {
  if (!Array.isArray(processors)) {
    throw new TypeError('Bridge prototype requires an array of post-processors');
  }
  const snapshot = processors.map(processor => {
    if (!processor || typeof processor.name !== 'string' || typeof processor.process !== 'function') {
      throw new TypeError('Bridge prototype requires named post-processors');
    }
    return { name: processor.name, process: processor.process };
  });
  const result = { ...(payload?.result ?? {}) };
  const completed = [];
  const failures = [];
  for (const processor of snapshot) {
    try {
      const processed = await exports.awaitHostValue(() => processor.process({ ...payload, result }));
      if (processed?.result && typeof processed.result === 'object') Object.assign(result, processed.result);
      completed.push(processor.name);
    } catch (error) {
      failures.push({ plugin: processor.name, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return { result, completed, failures };
};

exports.loadPortableBridge = loadPortableBridge;

exports.DEFAULT_DECAY_HALF_LIFE_MS = DEFAULT_DECAY_HALF_LIFE_MS;