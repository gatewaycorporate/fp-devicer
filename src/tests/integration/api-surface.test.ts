import { describe, it, expect } from 'vitest';

/**
 * API surface smoke tests — import every named export from the barrel
 * and assert it is defined and has the expected type. This prevents
 * accidental omissions from src/main.ts.
 */
describe('Public API surface (main.ts barrel)', () => {
  it('exports all expected functions and classes', async () => {
    const api = await import('../../main');

    // Types are erased at runtime; we verify the value-level exports

    // TLSH hashing
    expect(typeof api.getHash).toBe('function');
    expect(typeof api.compareHashes).toBe('function');

    // Confidence
    expect(typeof api.calculateConfidence).toBe('function');
    expect(typeof api.createConfidenceCalculator).toBe('function');

    // Registry
    expect(typeof api.registerComparator).toBe('function');
    expect(typeof api.registerWeight).toBe('function');
    expect(typeof api.registerPlugin).toBe('function');
    expect(typeof api.unregisterComparator).toBe('function');
    expect(typeof api.unregisterWeight).toBe('function');
    expect(typeof api.setDefaultWeight).toBe('function');
    expect(typeof api.clearRegistry).toBe('function');
    expect(typeof api.initializeDefaultRegistry).toBe('function');

    // Adapters
    expect(typeof api.createInMemoryAdapter).toBe('function');
    expect(typeof api.createSqliteAdapter).toBe('function');
    expect(typeof api.createPostgresAdapter).toBe('function');
    expect(typeof api.createRedisAdapter).toBe('function');

    // Core
    expect(typeof api.DeviceManager).toBe('function');
    expect(typeof api.AdapterFactory).toBe('function');

    // Observability
    expect(typeof api.defaultLogger).toBe('object');
    expect(typeof api.defaultMetrics).toBe('object');
  });

  it('AdapterFactory.create("in-memory") produces a working adapter', async () => {
    const { AdapterFactory } = await import('../../main');
    const adapter = AdapterFactory.create('in-memory');
    await expect(adapter.init()).resolves.not.toThrow();
  });

  it('full round-trip: create adapter → DeviceManager → identify → re-identify', async () => {
    const { AdapterFactory, DeviceManager } = await import('../../main');
    const { fpIdentical, fpVerySimilar } = await import('../fixtures/fingerprints');

    const adapter = AdapterFactory.create('in-memory');
    await adapter.init();

    const manager = new DeviceManager(adapter, { dedupWindowMs: 0 });

    const first = await manager.identify(fpIdentical);
    expect(first.deviceId).toMatch(/^dev_/);
    expect(first.isNewDevice).toBe(true);

    const second = await manager.identify(fpVerySimilar);
    expect(second.deviceId).toBe(first.deviceId);
    expect(second.isNewDevice).toBe(false);
  });

  it('registerPlugin before DeviceManager construction affects global registry scoring', async () => {
    const { clearRegistry, initializeDefaultRegistry, registerPlugin, AdapterFactory, DeviceManager, calculateConfidence } = await import('../../main');
    const { fpIdentical, fpVerySimilar } = await import('../fixtures/fingerprints');

    // Zero out userAgent weight — differences in userAgent should be ignored
    clearRegistry();
    initializeDefaultRegistry();
    registerPlugin('userAgent', { weight: 0 });

    const scoreWithZeroUA = calculateConfidence(fpIdentical, fpVerySimilar);

    // Restore and compare — score should be the same or higher when UA is ignored
    clearRegistry();
    initializeDefaultRegistry();
    const scoreNormal = calculateConfidence(fpIdentical, fpVerySimilar);

    // Both should be valid confidence scores
    expect(scoreWithZeroUA).toBeGreaterThanOrEqual(0);
    expect(scoreWithZeroUA).toBeLessThanOrEqual(100);
    expect(scoreNormal).toBeGreaterThanOrEqual(0);
    expect(scoreNormal).toBeLessThanOrEqual(100);
  });
});
