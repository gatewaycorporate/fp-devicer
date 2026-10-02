'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { Worker } = require('node:worker_threads');
const bridge = require('../../packages/bridge-spike/index.cjs');
const { loadPortableBridge } = require('../../packages/bridge-spike/portable-loader.cjs');
const native = require('../../.compat-cache/bridge/devicer.node');
let oracle;
test.before(async () => {
  oracle = await import('../../.compat-cache/oracle/package/dist/main.js');
});

test('native load and field agreement stay synchronous', () => {
  assert.equal(typeof native.computeFieldAgreement, 'function');
  const events = [];
  const result = bridge.computeFieldAgreement({ userAgent: 'one' }, { userAgent: 'two' }, {
    useGlobalRegistry: false,
    comparators: { userAgent(first, second, field) {
      events.push([first, second, field]);
      return 0.9;
    } },
  });
  assert.equal(result, 100);
  assert.equal(typeof result, 'number');
  assert.deepEqual(events, [['one', 'two', 'userAgent']]);
});

test('Rust requests exactly the legacy fields in order', () => {
  const fields = [];
  assert.equal(native.computeFieldAgreement(field => { fields.push(field); }), 50);
  assert.deepEqual(fields, Object.keys(oracle.DEFAULT_WEIGHTS));
});

test('supported field agreement cases match the published oracle exactly', () => {
  const values = [undefined, null, '', ' \u00a0 ', '\ud800', '\ud83d\ude00', 0, -0, 1, NaN, Infinity, false, true, 1n, Symbol.for('field')];
  for (const first of values) {
    for (const second of values) {
      const options = { useGlobalRegistry: false };
      assert.equal(bridge.computeFieldAgreement({ userAgent: first }, { userAgent: second }, options),
        oracle.computeFieldAgreement({ userAgent: first }, { userAgent: second }, options));
    }
  }
  for (const similarity of [-Infinity, -1, 0, 0.8999999999999999, 0.9, 1, Infinity, NaN, undefined, null, '0.9']) {
    const options = { useGlobalRegistry: false, comparators: { userAgent: () => similarity } };
    const first = { userAgent: 'first', platform: 'same', timezone: 'different' };
    const second = { userAgent: 'second', platform: 'same', timezone: 'other' };
    assert.equal(bridge.computeFieldAgreement(first, second, options), oracle.computeFieldAgreement(first, second, options));
  }
});

test('original objects, arrays, dates and cycles reach callbacks unchanged', () => {
  const cycle = {};
  cycle.self = cycle;
  for (const first of [{ marker: 1 }, [undefined, null, '\ud800'], new Date(0), cycle]) {
    const second = { other: true };
    const options = { useGlobalRegistry: false, comparators: { userAgent(left, right, field) {
      assert.equal(left, first);
      assert.equal(right, second);
      assert.equal(field, 'userAgent');
      return 1;
    } } };
    assert.equal(bridge.computeFieldAgreement({ userAgent: first }, { userAgent: second }, options), 100);
  }
});

test('callbacks can reenter the native scorer without deadlock', () => {
  const result = bridge.computeFieldAgreement({ userAgent: 'left' }, { userAgent: 'right' }, {
    useGlobalRegistry: false,
    comparators: { userAgent: () => bridge.computeFieldAgreement({ platform: 'same' }, { platform: 'same' }, { useGlobalRegistry: false }) / 100 },
  });
  assert.equal(result, 100);
});

test('callback exceptions retain identity and stop iteration', () => {
  for (const sentinel of [new Error('sentinel'), { reason: 'custom' }, 'failure', null, undefined]) {
    let calls = 0;
    let caught = false;
    try {
      bridge.computeFieldAgreement({ userAgent: 1, platform: 1 }, { userAgent: 2, platform: 2 }, {
        useGlobalRegistry: false,
        comparators: {
          userAgent() { calls++; throw sentinel; },
          platform() { calls++; return 1; },
        },
      });
    } catch (error) {
      caught = true;
      assert.equal(error, sentinel);
    }
    assert.equal(caught, true);
    assert.equal(calls, 1);
  }
});

test('comparator deletion during a call affects only later calls', () => {
  function run(api) {
    const comparators = {
      userAgent() { delete comparators.platform; return 1; },
      platform() { return 1; },
    };
    const options = { useGlobalRegistry: false, comparators };
    const first = { userAgent: 'first', platform: 'first' };
    const second = { userAgent: 'second', platform: 'second' };
    return [api.computeFieldAgreement(first, second, options), api.computeFieldAgreement(first, second, options)];
  }
  assert.deepEqual(run(bridge), run(oracle));
});

test('numeric temporal decay matches frozen edge cases', () => {
  const halfLife = oracle.DEFAULT_DECAY_HALF_LIFE_MS;
  assert.equal(bridge.DEFAULT_DECAY_HALF_LIFE_MS, halfLife);
  for (const age of [-Infinity, -1, -0, 0, halfLife, Infinity, NaN]) {
    for (const parameter of [-Infinity, -1, -0, 0, halfLife, Infinity, NaN]) {
      assert.equal(bridge.computeTemporalDecayFactor(age, parameter), oracle.computeTemporalDecayFactor(age, parameter));
    }
  }
});

test('finite temporal decay matches the oracle without a tolerance', () => {
  for (let index = 1; index <= 10000; index++) {
    const age = index * 123456.789;
    assert.equal(bridge.computeTemporalDecayFactor(age), oracle.computeTemporalDecayFactor(age), `age=${age}`);
  }
});

test('native legacy score breakdown matches the published oracle', () => {
  const base = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    platform: 'Win32', timezone: 'UTC', language: 'en-US', languages: ['en-US', 'en'], cookieEnabled: true,
    hardwareConcurrency: 8, deviceMemory: 8,
    screen: { width: 1920, height: 1080, colorDepth: 24, pixelDepth: 24, orientation: { type: 'landscape-primary' } },
    fonts: ['Arial', 'Verdana', 'Helvetica'], plugins: ['Chrome PDF Plugin'], mimeTypes: ['application/pdf'],
    canvas: 'canvas-rendering-signal-abcdefghijklmnopqrstuvwxyz-0123456789',
    webgl: 'webgl-rendering-signal-abcdefghijklmnopqrstuvwxyz-0123456789',
    audio: 'audio-rendering-signal-abcdefghijklmnopqrstuvwxyz-0123456789',
    highEntropyValues: { architecture: 'x86', bitness: '64', platformVersion: '10.0.0' },
  };
  const cases = [
    [base, base, {}],
    [base, { ...base, platform: 'Linux x86_64' }, {}],
    [base, { ...base, canvas: 'different-canvas-rendering-signal-abcdefghijklmnopqrstuvwxyz-0123456789' }, { snapshotAgeMs: 365 * 24 * 60 * 60 * 1000 }],
  ];
  for (const [left, right, options] of cases) {
    assert.deepEqual(bridge.calculateScoreBreakdown(left, right, options), oracle.calculateScoreBreakdown(left, right, options));
    const oracleConfidence = Object.keys(options).length
      ? oracle.createConfidenceCalculator(options).calculateConfidence(left, right)
      : oracle.calculateConfidence(left, right);
    assert.equal(bridge.calculateConfidence(left, right, options), oracleConfidence);
  }
});

test('native TLSH hashes and distances match the published oracle', () => {
  const make = seed => Array.from({ length: 512 }, (_, index) => String.fromCharCode(32 + ((index * 73 + seed * 41) % 95))).join('');
  const first = make(1);
  const second = make(2);
  assert.equal(bridge.getHash(first), oracle.getHash(first));
  assert.equal(bridge.getHash(second), oracle.getHash(second));
  assert.equal(bridge.compareHashes(bridge.getHash(first), bridge.getHash(second)), oracle.compareHashes(oracle.getHash(first), oracle.getHash(second)));
});

test('native graph helpers and LSH query match the legacy contracts', () => {
  assert.equal(bridge.subnetKey('192.168.1.256'), '192.168.1');
  assert.equal(bridge.subnetKey('not-an-ip'), undefined);
  assert.equal(bridge.jaccardSimilarity([], []), 1);
  assert.equal(bridge.jaccardSimilarity(['a'], ['a', 'b']), 0.5);
  const entries = [
    { deviceId: 'device-a', fingerprint: { fonts: ['Arial'], languages: ['en-US'] } },
    { deviceId: 'device-b', fingerprint: { fonts: ['Times'], languages: ['fr'] } },
  ];
  assert.deepEqual(bridge.queryLsh(entries, entries[0].fingerprint, { numHashes: 16, numBands: 4 }), ['device-a']);
  assert.deepEqual(bridge.queryLsh(entries, {}, { numHashes: 16, numBands: 4 }), []);
});

test('native drift report matches the published oracle', () => {
  const base = {
    userAgent: 'Mozilla/5.0 Chrome/120.0.0.0', platform: 'Win32', language: 'en-US',
    screen: { width: 1920, height: 1080, colorDepth: 24, pixelDepth: 24, orientation: { type: 'landscape-primary' } },
    canvas: 'stable-canvas', webgl: 'stable-webgl', audio: 'stable-audio',
    fonts: ['Arial', 'Verdana'], languages: ['en-US', 'en'],
    hardwareConcurrency: 8, deviceMemory: 8,
  };
  const incoming = { ...base, platform: 'Linux', canvas: 'changed-canvas' };
  const history = [0, 1, 2].map(index => ({
    timestamp: new Date(Date.UTC(2026, 0, 1 + index)),
    fingerprint: base,
  }));
  assert.deepEqual(bridge.computeDeviceDrift(incoming, history), oracle.computeDeviceDrift(incoming, history));
});

test('awaited host operations fulfill, propagate rejection, and permit reentry', async () => {
  const events = [];
  const result = await bridge.awaitHostNumber(async () => {
    events.push('host-start');
    const nested = bridge.computeFieldAgreement({ userAgent: 'a' }, { userAgent: 'a' }, {
      useGlobalRegistry: false,
    });
    events.push(`nested:${nested}`);
    await Promise.resolve();
    events.push('host-end');
    return 7;
  });
  assert.equal(result, 7);
  assert.deepEqual(events, ['host-start', 'nested:100', 'host-end']);

  const rejection = new Error('host failure');
  await assert.rejects(bridge.awaitHostNumber(() => Promise.reject(rejection)), error => {
    assert.match(error.message, /host failure/);
    return true;
  });
});

test('awaited host operations reject invalid functions synchronously', () => {
  assert.throws(() => bridge.awaitHostNumber(null), /host operation function/);
});

test('awaited host values preserve the versioned tagged value subset', async () => {
  const values = [
    undefined, null, true, false, '', 'surrogate \ud800', 0, -0, NaN, Infinity,
    -Infinity, 7n, new Date('2026-09-30T00:00:00.000Z'),
    { '__proto__': 'own', nested: [undefined, null, 'value'] },
  ];
  for (const value of values) {
    const result = await bridge.awaitHostValue(() => value);
    if (typeof value === 'number' && Number.isNaN(value)) assert.ok(Number.isNaN(result));
    else if (Object.is(value, -0)) assert.equal(Object.is(result, -0), true);
    else assert.deepEqual(result, value);
  }
  const rejected = new TypeError('function payload');
  await assert.rejects(bridge.awaitHostValue(() => Promise.reject(rejected)), /function payload/);
});

test('awaited host values reject cycles and unsupported prototypes', async () => {
  const cycle = {};
  cycle.self = cycle;
  await assert.rejects(bridge.awaitHostValue(() => cycle), /Cyclic bridge values/);
  await assert.rejects(bridge.awaitHostValue(() => Symbol('unsupported')), /Unsupported bridge value type/);
  await assert.rejects(bridge.awaitHostValue(() => new Map()), /Only plain objects/);
});

test('host sequences preserve order and snapshot operations before reentrant mutation', async () => {
  const events = [];
  const operations = [
    async () => {
      events.push('first-start');
      operations.length = 0;
      await Promise.resolve();
      events.push('first-end');
      return { step: 1 };
    },
    () => {
      events.push('second');
      return { step: 2 };
    },
  ];
  assert.deepEqual(await bridge.runHostSequence(operations), [{ step: 1 }, { step: 2 }]);
  assert.deepEqual(events, ['first-start', 'first-end', 'second']);
  assert.deepEqual(await bridge.runHostSequence([]), []);
});

test('host sequences stop at a rejected operation and validate the list', async () => {
  const events = [];
  await assert.rejects(bridge.runHostSequence([
    () => { events.push('before'); return 1; },
    () => Promise.reject(new Error('sequence failure')),
    () => { events.push('after'); return 3; },
  ]), /sequence failure/);
  assert.deepEqual(events, ['before']);
  await assert.rejects(bridge.runHostSequence([null]), /host operation functions/);
  await assert.rejects(bridge.runHostSequence(null), /array of host operations/);
});

test('storage bridge preserves method order, arguments, results, and close', async () => {
  const events = [];
  const adapter = {
    async init() { events.push(['init']); },
    async save(snapshot) { events.push(['save', snapshot]); return 'snapshot-1'; },
    async getHistory(deviceId, limit) { events.push(['history', deviceId, limit]); return [{ deviceId, limit }]; },
    async findCandidates(query, minConfidence, limit) { events.push(['candidates', query, minConfidence, limit]); return [{ query, minConfidence, limit }]; },
    async linkToUser(deviceId, userId) { events.push(['link', deviceId, userId]); },
    async deleteOldSnapshots(days) { events.push(['delete', days]); return 2; },
    async getAllFingerprints() { events.push(['all']); return [{ id: 'snapshot-1' }]; },
    async close() { events.push(['close']); },
  };
  const storage = bridge.createStorageBridge(adapter);
  await storage.init();
  assert.equal(await storage.save({ fingerprint: { userAgent: 'x' } }), 'snapshot-1');
  assert.deepEqual(await storage.getHistory('device-1', 3), [{ deviceId: 'device-1', limit: 3 }]);
  assert.deepEqual(await storage.findCandidates({ platform: 'Linux' }, 30, 5), [{
    query: { platform: 'Linux' }, minConfidence: 30, limit: 5,
  }]);
  await storage.linkToUser('device-1', 'user-1');
  assert.equal(await storage.deleteOldSnapshots(90), 2);
  assert.deepEqual(await storage.getAllFingerprints(), [{ id: 'snapshot-1' }]);
  await storage.close();
  assert.deepEqual(events.map(event => event[0]), ['init', 'save', 'history', 'candidates', 'link', 'delete', 'all', 'close']);
});

test('storage bridge rejects incomplete adapters and preserves host failures', async () => {
  assert.throws(() => bridge.createStorageBridge({}), /storage method: init/);
  const failure = new Error('storage failure');
  const adapter = {
    init: async () => undefined,
    save: async () => { throw failure; },
    getHistory: async () => [],
    findCandidates: async () => [],
    linkToUser: async () => undefined,
    deleteOldSnapshots: async () => 0,
    getAllFingerprints: async () => [],
  };
  await assert.rejects(bridge.createStorageBridge(adapter).save({}), /storage failure/);
});

test('post-processor bridge snapshots order, merges enrichment, and captures failures', async () => {
  const processors = [
    {
      name: 'first',
      async process(payload) {
        processors.length = 0;
        return { result: { first: payload.result.base + 1 } };
      },
    },
    {
      name: 'broken',
      process() { throw new Error('plugin failure'); },
    },
    {
      name: 'third',
      process(payload) { return { result: { third: payload.result.first + 1 } }; },
    },
  ];
  const result = await bridge.runPostProcessorSequence(processors, { result: { base: 1 } });
  assert.deepEqual(result.result, { base: 1, first: 2, third: 3 });
  assert.deepEqual(result.completed, ['first', 'third']);
  assert.deepEqual(result.failures, [{ plugin: 'broken', message: 'plugin failure' }]);
});

test('post-processor bridge validates registrations', async () => {
  await assert.rejects(bridge.runPostProcessorSequence([{}], {}), /named post-processors/);
  await assert.rejects(bridge.runPostProcessorSequence(null, {}), /array of post-processors/);
});

test('portable loader validates an injected module contract without native fallback', async () => {
  const portable = await loadPortableBridge(() => ({
    computeFieldAgreement: () => 50,
    computeTemporalDecayFactor: () => 1,
  }));
  assert.equal(portable.portable, true);
  assert.equal(portable.computeFieldAgreement(), 50);
  await assert.rejects(loadPortableBridge(() => ({ computeFieldAgreement() {} })), /missing export/);
});

test('unported modes are explicit errors rather than silent JS fallbacks', () => {
  assert.throws(() => bridge.computeFieldAgreement({}, {}), /useGlobalRegistry/);
  assert.throws(() => bridge.computeFieldAgreement({ screen: {} }, { screen: {} }, { useGlobalRegistry: false }), /custom comparator/);
  assert.throws(() => bridge.computeTemporalDecayFactor('1'), /numeric/);
});

test('native loading and callbacks work in a worker and exit cleanly', async () => {
  const worker = new Worker(`
    const { parentPort, workerData, threadId } = require('node:worker_threads');
    const bridge = require(workerData);
    let callbackThread;
    const score = bridge.computeFieldAgreement({ userAgent: 1 }, { userAgent: 2 }, {
      useGlobalRegistry: false,
      comparators: { userAgent() { callbackThread = threadId; return 1; } },
    });
    parentPort.postMessage({ score, callbackThread, threadId });
  `, { eval: true, workerData: require.resolve('../../packages/bridge-spike/index.cjs') });
  try {
    const result = await new Promise((resolve, reject) => {
      let message;
      worker.once('message', value => { message = value; });
      worker.once('error', reject);
      worker.once('exit', code => code === 0 ? resolve(message) : reject(new Error(`Worker exit: ${code}`)));
    });
    assert.equal(result.score, 100);
    assert.equal(result.callbackThread, result.threadId);
    assert.ok(result.threadId > 0);
  } finally {
    await worker.terminate();
  }
});