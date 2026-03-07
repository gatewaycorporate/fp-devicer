import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeviceManager, createInMemoryAdapter } from '../src/main';
import { fpIdentical, fpVerySimilar, fpDifferent } from './fixtures/fingerprints';

describe('DeviceManager', () => {
  let manager: DeviceManager;
  let adapter: any;

  beforeEach(() => {
    adapter = createInMemoryAdapter();
    manager = new DeviceManager(adapter);
  });

  it('creates new device when no match exists', async () => {
    const result = await manager.identify(fpIdentical, { userId: 'user_abc', ip: '1.2.3.4' });

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

  it('treats low-confidence as new device', async () => {
    await manager.identify(fpIdentical);
    const result = await manager.identify(fpDifferent);

    expect(result.isNewDevice).toBe(true);
    expect(result.confidence).toBeLessThan(60);
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