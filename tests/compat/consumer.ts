import assert from 'node:assert/strict';
import {
  calculateConfidence,
  createConfidenceCalculator,
  DeviceManager,
  type DeviceManagerPlugin,
  type FPDataSet,
  type IdentifyContext,
  type StorageAdapter,
  type StoredFingerprint,
} from 'devicer.js';

const fingerprint: FPDataSet = JSON.parse(process.env.NEXT_COMPAT_SAMPLE!);
const confidence: number = calculateConfidence(fingerprint, fingerprint);
const calculator = createConfidenceCalculator();
assert.equal(confidence, 100);
assert.equal(calculator.calculateConfidence(fingerprint, fingerprint), confidence);
assert.equal(calculator.calculateScoreBreakdown(fingerprint, fingerprint).composite, confidence);

const events: string[] = [];
const snapshots: StoredFingerprint[] = [];
const storage: StorageAdapter = {
  async init() { events.push('init'); },
  async save(snapshot) {
    await Promise.resolve();
    events.push('save');
    snapshots.push(snapshot);
    return snapshot.id;
  },
  async getHistory(deviceId, limit = 5) {
    return snapshots.filter(snapshot => snapshot.deviceId === deviceId).slice(-limit).reverse();
  },
  async findCandidates() {
    events.push('candidates');
    return snapshots.map(snapshot => ({
      deviceId: snapshot.deviceId,
      confidence: 100,
      lastSeen: snapshot.timestamp,
    }));
  },
  async linkToUser() {},
  async deleteOldSnapshots() { return 0; },
  async getAllFingerprints() { return [...snapshots]; },
};

await storage.init();
const manager = new DeviceManager(storage, {
  logger: { info() {}, warn() {}, error() {}, debug() {} },
});
let context: IdentifyContext = { marker: { request: 1 } };
const cacheHits: boolean[] = [];
const plugin: DeviceManagerPlugin = {
  registerWith(host) {
    assert.equal(this, plugin);
    assert.equal(host, manager);
    events.push('register');
    const unregister = host.registerIdentifyPostProcessor('consumer', async payload => {
      await Promise.resolve();
      assert.equal(payload.incoming, fingerprint);
      assert.equal(payload.context, context);
      assert.equal(snapshots.length, 1);
      assert.equal(snapshots[0].matchConfidence, 0);
      cacheHits.push(payload.cacheHit);
      events.push('enrich');
      return { result: { confidence: 7 }, enrichmentInfo: { reviewed: true } };
    });
    return () => { events.push('teardown'); unregister(); };
  },
};
const unregister = manager.use(plugin);
assert.equal(manager.getPlugins()[0], plugin);
const originalNow = Date.now;
Date.now = () => 1_800_000_000_000;
try {
  const pending = manager.identify(fingerprint, context);
  assert.equal(typeof pending.then, 'function');
  const first = await pending;
  assert.match(first.deviceId, /^dev_[0-9a-f-]{36}$/);
  assert.equal(first.isNewDevice, true);
  assert.equal(first.confidence, 7);
  assert.equal(snapshots[0].fingerprint, fingerprint);
  assert.ok(snapshots[0].timestamp instanceof Date);
  context = { marker: { request: 2 } };
  const second = await manager.identify(fingerprint, context);
  assert.equal(second.deviceId, first.deviceId);
  assert.deepEqual(cacheHits, [false, true]);
  unregister();
  assert.equal(manager.getPlugins().length, 0);
  const third = await manager.identify(fingerprint);
  assert.equal(third.confidence, 0);
  assert.equal(snapshots.length, 1);
} finally {
  Date.now = originalNow;
}
assert.deepEqual(events, ['init', 'register', 'candidates', 'save', 'enrich', 'enrich', 'teardown']);
process.stdout.write(JSON.stringify({ confidence, events, cacheHits }));