import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeviceManager, createInMemoryAdapter } from '../../main';
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
    const second = await manager.identify(fpVerySimilar);

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