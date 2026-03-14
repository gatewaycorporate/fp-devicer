import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeviceManager, createInMemoryAdapter } from '../../main';
import { DefaultMetrics } from '../../libs/default-observability';
import type { Logger } from '../../types/observability';
import { fpIdentical, fpVerySimilar, fpSimilar, fpDifferent, fpVeryDifferent } from '../fixtures/fingerprints';

describe('DeviceManager', () => {
  let manager: DeviceManager;
  let adapter: any;

  beforeEach(() => {
    adapter = createInMemoryAdapter();
    manager = new DeviceManager(adapter, { dedupWindowMs: 0 }); // disable dedup by default so tests are independent
  });

  it('creates new device when no match exists', async () => {
		const result = await manager.identify(fpIdentical, { userId: 'user_abc' });
    expect(result.deviceId).toMatch(/^dev_/);
    expect(result.isNewDevice).toBe(true);
    expect(result.confidence).toBe(0);
    expect(result.linkedUserId).toBe('user_abc');
    expect(result.enrichmentInfo).toEqual({
      plugins: [],
      details: {},
      failures: [],
    });
  });

  it('returns existing device on high-confidence match (>80)', async () => {
    const first = await manager.identify(fpIdentical);
    const deviceId = first.deviceId;

    const second = await manager.identify(fpVerySimilar);

    expect(second.deviceId).toBe(deviceId);
    expect(second.isNewDevice).toBe(false);
    expect(second.confidence).toBeGreaterThan(80);
  });

	it('returns existing device on noisy high-confidence match (>70)', async () => {
		const first = await manager.identify(fpIdentical);
		const deviceId = first.deviceId;
		const second = await manager.identify(fpSimilar);
		
		expect(second.deviceId).toBe(deviceId);
		expect(second.isNewDevice).toBe(false);
		expect(second.confidence).toBeGreaterThan(70);
	});

	it('returns existing device on medium-confidence match (>60)', async () => {
		const first = await manager.identify(fpIdentical);
		const deviceId = first.deviceId;
		const second = await manager.identify(fpDifferent);
		
		expect(second.deviceId).toBe(deviceId);
		expect(second.isNewDevice).toBe(false);
		expect(second.confidence).toBeGreaterThan(60);
	});

  it('returns new device on low-confidence (<60)', async () => {
		const first = await manager.identify(fpIdentical);
		const deviceId = first.deviceId;
		const second = await manager.identify(fpVeryDifferent);

		expect(second.deviceId).not.toBe(deviceId);
    expect(second.confidence).toBeLessThan(60);
  });

  it('persists a snapshot on every identification', async () => {
    const saveSpy = vi.spyOn(adapter, 'save');

    await manager.identify(fpIdentical);
    await manager.identify(fpVerySimilar);

    expect(saveSpy).toHaveBeenCalledTimes(2);
  });

  it('links userId when provided in context', async () => {
    const result = await manager.identify(fpIdentical, { userId: 'user_link_test' });

    const history = await adapter.getHistory(result.deviceId);
    expect(history[0].userId).toBe('user_link_test');
  });

  it('returns matchConfidence in identify result', async () => {
    const first = await manager.identify(fpIdentical);
    expect(first.matchConfidence).toBe(0); // new device — no prior match

    const second = await manager.identify(fpVerySimilar);
    expect(second.matchConfidence).toBeGreaterThan(70);
    expect(second.matchConfidence).toBe(second.confidence); // should always match
  });

  it('persists matchConfidence on saved snapshot', async () => {
    const first = await manager.identify(fpIdentical);
    const second = await manager.identify(fpDifferent);

    const history = await adapter.getHistory(second.deviceId);
    // Most recent snapshot (last pushed in inmemory adapter) has matchConfidence
    const latest = history[history.length - 1];
    expect(latest.matchConfidence).toBe(second.confidence);
  });

  it('new device snapshot has matchConfidence of 0', async () => {
    const result = await manager.identify(fpIdentical);
    const history = await adapter.getHistory(result.deviceId);
    expect(history[0].matchConfidence).toBe(0);
  });

  it('dedup cache prevents duplicate DB writes within window', async () => {
    const dedupManager = new DeviceManager(adapter, { dedupWindowMs: 5000 });
    const saveSpy = vi.spyOn(adapter, 'save');

    // First call — should write to DB
    const first = await dedupManager.identify(fpIdentical);
    // Second call with identical fingerprint within window — should return cached result
    const second = await dedupManager.identify(fpIdentical);

    expect(saveSpy).toHaveBeenCalledTimes(1); // only one DB write
    expect(second.deviceId).toBe(first.deviceId);
    expect(second.confidence).toBe(first.confidence);
  });

  it('dedup cache returns fresh result after clearDedupCache()', async () => {
    const dedupManager = new DeviceManager(adapter, { dedupWindowMs: 5000 });
    const saveSpy = vi.spyOn(adapter, 'save');

    await dedupManager.identify(fpIdentical);
    dedupManager.clearDedupCache();
    await dedupManager.identify(fpIdentical);

    expect(saveSpy).toHaveBeenCalledTimes(2); // cache was cleared, so two writes
  });

  it('dedup cache is bypassed when dedupWindowMs is 0', async () => {
    const noDedupManager = new DeviceManager(adapter, { dedupWindowMs: 0 });
    const saveSpy = vi.spyOn(adapter, 'save');

    await noDedupManager.identify(fpIdentical);
    await noDedupManager.identify(fpIdentical);

    expect(saveSpy).toHaveBeenCalledTimes(2);
  });

  it('does not persist a second snapshot when an identical fingerprint hash already exists', async () => {
    const first = await manager.identify(fpIdentical);
    const second = await manager.identify(fpIdentical);

    const history = await adapter.getHistory(first.deviceId);
    expect(second.deviceId).toBe(first.deviceId);
    expect(history).toHaveLength(1);
  });

  it('adaptive weights: stable device history does not degrade confidence', async () => {
    // Seed device with several consistent sessions
    for (let i = 0; i < 4; i++) {
      await manager.identify(fpIdentical);
    }
    // A slightly-mutated fingerprint should still match with high confidence
    const result = await manager.identify(fpVerySimilar);
    expect(result.isNewDevice).toBe(false);
    expect(result.confidence).toBeGreaterThan(70);
  });
});

describe('DeviceManager – Observability', () => {
  let adapter: ReturnType<typeof createInMemoryAdapter>;

  beforeEach(() => {
    adapter = createInMemoryAdapter();
  });

  it('custom logger.info is called after each identify', async () => {
    const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    const manager = new DeviceManager(adapter, { dedupWindowMs: 0, logger });

    await manager.identify(fpIdentical);

    expect(logger.info).toHaveBeenCalled();
    const [msg] = (logger.info as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(typeof msg).toBe('string');
  });

  it('includes post-processor enrichment data in the final info log', async () => {
    const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    const manager = new DeviceManager(adapter, { dedupWindowMs: 0, logger });

    manager.registerIdentifyPostProcessor('demo', ({ result }) => ({
      result: { demoScore: 12 },
      enrichmentInfo: { score: 12, deviceId: result.deviceId },
      logMeta: { score: 12 },
    }));

    const result = await manager.identify(fpIdentical) as any;

    expect(result.demoScore).toBe(12);
    expect(result.enrichmentInfo.plugins).toEqual(['demo']);
    expect(result.enrichmentInfo.details.demo).toEqual({
      score: 12,
      deviceId: result.deviceId,
    });

    const [, meta] = (logger.info as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(meta.enrichmentInfo.details.demo).toEqual({
      score: 12,
      deviceId: result.deviceId,
    });
    expect(meta.pluginLogMeta.demo).toEqual({ score: 12 });
  });

  it('records post-processor failures without failing identify', async () => {
    const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    const manager = new DeviceManager(adapter, { dedupWindowMs: 0, logger });

    manager.registerIdentifyPostProcessor('broken', () => {
      throw new Error('boom');
    });

    const result = await manager.identify(fpIdentical);

    expect(result.deviceId).toMatch(/^dev_/);
    expect(result.enrichmentInfo.failures).toEqual([{ plugin: 'broken', message: 'boom' }]);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('custom logger.debug is called at the start of identify', async () => {
    const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    const manager = new DeviceManager(adapter, { dedupWindowMs: 0, logger });

    await manager.identify(fpIdentical);

    expect(logger.debug).toHaveBeenCalled();
  });

  it('custom metrics.recordIdentify is called once per identify', async () => {
    const metrics = new DefaultMetrics();
    const spy = vi.spyOn(metrics, 'recordIdentify');
    const manager = new DeviceManager(adapter, { dedupWindowMs: 0, metrics });

    await manager.identify(fpIdentical);
    await manager.identify(fpVerySimilar);

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('getMetricsSummary returns counters with identify_total', async () => {
    const metrics = new DefaultMetrics();
    const manager = new DeviceManager(adapter, { dedupWindowMs: 0, metrics });

    await manager.identify(fpIdentical);
    await manager.identify(fpVerySimilar);

    const summary = manager.getMetricsSummary();
    expect(summary).not.toBeNull();
    expect(summary!.counters.identify_total).toBe(2);
  });

  it('getMetricsSummary returns null when metrics has no getSummary method', async () => {
    const minimalMetrics = {
      incrementCounter: vi.fn(),
      recordHistogram: vi.fn(),
      recordGauge: vi.fn(),
      recordIdentify: vi.fn(),
    };
    const manager = new DeviceManager(adapter, { dedupWindowMs: 0, metrics: minimalMetrics });
    expect(manager.getMetricsSummary()).toBeNull();
  });
});

describe('DeviceManager – Dedup cache edge cases', () => {
  let adapter: ReturnType<typeof createInMemoryAdapter>;

  beforeEach(() => {
    adapter = createInMemoryAdapter();
  });

  it('cache entry expires after dedupWindowMs — second call writes to adapter', async () => {
    vi.useFakeTimers();
    const manager = new DeviceManager(adapter, { dedupWindowMs: 100 });
    const saveSpy = vi.spyOn(adapter, 'save');

    await manager.identify(fpIdentical);
    expect(saveSpy).toHaveBeenCalledTimes(1);

    // Advance time past the dedup window
    vi.advanceTimersByTime(200);

    await manager.identify(fpIdentical);
    expect(saveSpy).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('dedupWindowMs: 0 — rapid repeated calls each hit the adapter independently', async () => {
    const manager = new DeviceManager(adapter, { dedupWindowMs: 0 });
    const saveSpy = vi.spyOn(adapter, 'save');

    await manager.identify(fpIdentical);
    await manager.identify(fpIdentical);
    await manager.identify(fpIdentical);

    expect(saveSpy).toHaveBeenCalledTimes(3);
  });

  it('reruns post-processors on dedup cache hits', async () => {
    const manager = new DeviceManager(adapter, { dedupWindowMs: 5000 });
    const saveSpy = vi.spyOn(adapter, 'save');
    const processor = vi.fn(({ context }: { context?: { userId?: string } }) => ({
      enrichmentInfo: {
        sequence: processor.mock.calls.length,
        userId: context?.userId,
      },
    }));

    manager.registerIdentifyPostProcessor('sequence', processor);

    const first = await manager.identify(fpIdentical, { userId: 'u1' });
    const second = await manager.identify(fpIdentical, { userId: 'u2' });

    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(processor).toHaveBeenCalledTimes(2);
    expect(first.enrichmentInfo.details.sequence).toEqual({ sequence: 1, userId: 'u1' });
    expect(second.enrichmentInfo.details.sequence).toEqual({ sequence: 2, userId: 'u2' });
    expect(second.linkedUserId).toBe('u2');
  });
});

describe('DeviceManager – Boundary and regression', () => {
  let adapter: ReturnType<typeof createInMemoryAdapter>;

  beforeEach(() => {
    adapter = createInMemoryAdapter();
  });

  it('multiple candidates above threshold — returns the highest-confidence one', async () => {
    // Create two different devices
    const managerSetup = new DeviceManager(adapter, { dedupWindowMs: 0, matchThreshold: 50 });
    const firstResult = await managerSetup.identify(fpIdentical);
    const secondResult = await managerSetup.identify(fpVeryDifferent);

    // Now identify with fpVerySimilar — it is much closer to fpIdentical
    const matchResult = await managerSetup.identify(fpVerySimilar);
    expect(matchResult.deviceId).toBe(firstResult.deviceId);
  });

  it('candidate history is empty for a just-created device — no crash on adaptive weighting', async () => {
    // Seed one device
    const manager = new DeviceManager(adapter, { dedupWindowMs: 0, stabilityWindowSize: 5 });
    const first = await manager.identify(fpIdentical);

    // Immediately identify again — history has only 1 snapshot (no stability pairs)
    const second = await manager.identify(fpVerySimilar);
    expect(second.isNewDevice).toBe(false);
    expect(second.confidence).toBeGreaterThan(0);
  });

  it('new device snapshot has matchConfidence of 0', async () => {
    const manager = new DeviceManager(adapter, { dedupWindowMs: 0 });
    const result = await manager.identify(fpIdentical);
    expect(result.matchConfidence).toBe(0);

    const history = await adapter.getHistory(result.deviceId);
    expect(history[0].matchConfidence).toBe(0);
  });
});

describe('DeviceManager – identifyMany', () => {
  let adapter: ReturnType<typeof createInMemoryAdapter>;

  beforeEach(() => {
    adapter = createInMemoryAdapter();
  });

  it('returns one identify result per incoming fingerprint in the same order', async () => {
    const manager = new DeviceManager(adapter, { dedupWindowMs: 0 });
    const identifyMany = (manager as any).identifyMany.bind(manager) as (
      incomingList: unknown[],
      context?: { userId?: string; ip?: string }
    ) => Promise<any[]>;

    const incomingList = [fpIdentical, fpVerySimilar, fpVeryDifferent];
    const results = await identifyMany(incomingList);

    expect(results).toHaveLength(incomingList.length);
    expect(results[0].isNewDevice).toBe(true);
    expect(results[1].isNewDevice).toBe(false);
    expect(results[1].deviceId).toBe(results[0].deviceId);
    expect(results[2].deviceId).not.toBe(results[0].deviceId);
  });

  it('applies the same context to every identify call in the batch', async () => {
    const manager = new DeviceManager(adapter, { dedupWindowMs: 0 });
    const identifyMany = (manager as any).identifyMany.bind(manager) as (
      incomingList: unknown[],
      context?: { userId?: string; ip?: string }
    ) => Promise<any[]>;

    const results = await identifyMany([fpIdentical, fpDifferent], {
      userId: 'batch_user',
      ip: '127.0.0.1',
    });

    expect(results[0].linkedUserId).toBe('batch_user');
    expect(results[1].linkedUserId).toBe('batch_user');

    const history = await adapter.getHistory(results[0].deviceId);
    expect(history).toHaveLength(2);
    expect(history[0].userId).toBe('batch_user');
    expect(history[1].userId).toBe('batch_user');
    expect(history[0].ip).toBe('127.0.0.1');
    expect(history[1].ip).toBe('127.0.0.1');
  });

  it('respects dedup behavior across repeated fingerprints in the same batch', async () => {
    const manager = new DeviceManager(adapter, { dedupWindowMs: 5000 });
    const saveSpy = vi.spyOn(adapter, 'save');
    const identifyMany = (manager as any).identifyMany.bind(manager) as (
      incomingList: unknown[],
      context?: { userId?: string; ip?: string }
    ) => Promise<any[]>;

    const results = await identifyMany([fpIdentical, fpIdentical, fpIdentical]);

    expect(results).toHaveLength(3);
    expect(results[1].deviceId).toBe(results[0].deviceId);
    expect(results[2].deviceId).toBe(results[0].deviceId);
    expect(saveSpy).toHaveBeenCalledTimes(1);
  });

  it('returns an empty array and performs no writes for an empty batch', async () => {
    const manager = new DeviceManager(adapter, { dedupWindowMs: 0 });
    const saveSpy = vi.spyOn(adapter, 'save');
    const identifyMany = (manager as any).identifyMany.bind(manager) as (
      incomingList: unknown[],
      context?: { userId?: string; ip?: string }
    ) => Promise<any[]>;

    const results = await identifyMany([]);

    expect(results).toEqual([]);
    expect(saveSpy).not.toHaveBeenCalled();
  });
});