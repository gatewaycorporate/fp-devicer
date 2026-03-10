import { describe, it, expect, vi } from 'vitest';
import { DeviceManager } from '../../core/DeviceManager';
import { createInMemoryAdapter } from '../../libs/adapters/inmemory';
import { getHash } from '../../libs/tlsh';
import { compareHashes } from '../../libs/tlsh';
import { fpIdentical, fpVeryDifferent } from '../fixtures/fingerprints';

describe('Error propagation resilience', () => {
  it('identify propagates error when adapter.findCandidates rejects', async () => {
    const adapter = createInMemoryAdapter();
    await adapter.init();
    vi.spyOn(adapter, 'findCandidates').mockRejectedValueOnce(new Error('DB connection lost'));

    const manager = new DeviceManager(adapter, { dedupWindowMs: 0 });
    await expect(manager.identify(fpIdentical)).rejects.toThrow('DB connection lost');
  });

  it('identify propagates error when adapter.save rejects', async () => {
    const adapter = createInMemoryAdapter();
    await adapter.init();
    vi.spyOn(adapter, 'save').mockRejectedValueOnce(new Error('Disk full'));

    const manager = new DeviceManager(adapter, { dedupWindowMs: 0 });
    await expect(manager.identify(fpIdentical)).rejects.toThrow('Disk full');
  });

  it('identify propagates error when adapter.getHistory rejects', async () => {
    const adapter = createInMemoryAdapter();
    await adapter.init();

    // First identify succeeds and creates a device to be found as a candidate
    const manager = new DeviceManager(adapter, { dedupWindowMs: 0 });
    await manager.identify(fpIdentical);

    vi.spyOn(adapter, 'getHistory').mockRejectedValueOnce(new Error('History read failed'));
    await expect(manager.identify(fpIdentical)).rejects.toThrow('History read failed');
  });
});

describe('TLSH edge cases', () => {
  it('getHash throws InsufficientComplexityError for a short string (< 512 bytes)', () => {
    // The TLSH library requires sufficient entropy; short/simple strings throw
    expect(() => getHash('short')).toThrow();
    expect(() => getHash('a'.repeat(50))).toThrow();
  });

  it('compareHashes on two empty strings does not throw', () => {
    expect(() => compareHashes('', '')).not.toThrow();
  });

  it('compareHashes on a valid hash and an empty string does not throw', () => {
    // Build a valid hash from a long-enough string
    const longStr = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '.repeat(20);
    const validHash = getHash(longStr);
    expect(validHash).not.toBe('');
    // Comparing a valid hash against an empty string should not throw
    expect(() => compareHashes(validHash, '')).not.toThrow();
    expect(() => compareHashes('', validHash)).not.toThrow();
  });
});

describe('DeviceManager with fully null/undefined fingerprint fields', () => {
  it('identify with all-undefined fields creates a new device rather than throwing', async () => {
    const adapter = createInMemoryAdapter();
    await adapter.init();
    const manager = new DeviceManager(adapter, { dedupWindowMs: 0 });

    const emptyFp = {} as any;
    const result = await manager.identify(emptyFp);

    expect(result.deviceId).toMatch(/^dev_/);
    expect(result.isNewDevice).toBe(true);
  });

  it('calculateConfidence does not throw when both fingerprints are empty objects', async () => {
    const { calculateConfidence } = await import('../../libs/confidence');
    expect(() => calculateConfidence({} as any, {} as any)).not.toThrow();
  });
});
