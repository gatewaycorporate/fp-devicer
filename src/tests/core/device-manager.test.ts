import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeviceManager, calculateConfidence, createInMemoryAdapter } from '../../main';
import { createBaseFingerprint, mutate } from '../../benchmarks/data-generator';

describe('DeviceManager', () => {
  let manager: DeviceManager;
  let adapter: any;
	let fpIdentical = createBaseFingerprint(1);
	let fpVerySimilar = mutate(fpIdentical, "low");
	let fpSimilar = mutate(fpIdentical, "medium");
	let fpDifferent = mutate(fpIdentical, "high");
	let fpVeryDifferent = mutate(fpIdentical, "extreme");

  beforeEach(() => {
    adapter = createInMemoryAdapter();
    manager = new DeviceManager(adapter);
  });

  it('creates new device when no match exists', async () => {
		const result = await manager.identify(fpIdentical, { userId: 'user_abc' });
    expect(result.deviceId).toMatch(/^dev_/);
    expect(result.isNewDevice).toBe(true);
    expect(result.confidence).toBe(0);
    expect(result.linkedUserId).toBe('user_abc');
  });

  it('returns existing device on high-confidence match (>70)', async () => {
    const first = await manager.identify(fpIdentical);
    const deviceId = first.deviceId;

    const second = await manager.identify(fpVerySimilar);

    expect(second.deviceId).toBe(deviceId);
    expect(second.isNewDevice).toBe(false);
    expect(second.confidence).toBeGreaterThan(70);
  });

	it('returns existing device on noisy high-confidence match (>60)', async () => {
		const first = await manager.identify(fpIdentical);
		const deviceId = first.deviceId;
		const second = await manager.identify(fpSimilar);
		
		expect(second.deviceId).toBe(deviceId);
		expect(second.isNewDevice).toBe(false);
		expect(second.confidence).toBeGreaterThan(60);
	});

	it('returns existing device on medium-confidence match (>50)', async () => {
		const first = await manager.identify(fpIdentical);
		const deviceId = first.deviceId;
		const second = await manager.identify(fpDifferent);
		
		expect(second.deviceId).toBe(deviceId);
		expect(second.isNewDevice).toBe(false);
		expect(second.confidence).toBeGreaterThan(50);
	});

  it('returns new device on low-confidence (<50)', async () => {
		const first = await manager.identify(fpIdentical);
		const deviceId = first.deviceId;
		const second = await manager.identify(fpVeryDifferent);

		expect(second.deviceId).not.toBe(deviceId);
    expect(second.confidence).toBeLessThan(50);
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
});