import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { createInMemoryAdapter } from '../../libs/adapters/inmemory';
import type { StorageAdapter, StoredFingerprint } from '../../types/storage';
import { fpIdentical, fpVerySimilar, fpVeryDifferent } from '../fixtures/fingerprints';

/**
 * Shared adapter contract tests.
 *
 * Each factory function in `adapterFactories` is exercised against the same
 * set of behavioural expectations so that all adapters remain consistent.
 * Only the in-memory adapter is tested here (no live DB required); add
 * additional factories when test infrastructure for other adapters is available.
 */
const adapterFactories: { name: string; factory: () => StorageAdapter }[] = [
  { name: 'InMemoryAdapter', factory: () => createInMemoryAdapter() },
];

for (const { name, factory } of adapterFactories) {
  describe(`${name} – StorageAdapter contract`, () => {
    let adapter: StorageAdapter;

    beforeEach(async () => {
      adapter = factory();
      await adapter.init();
    });

    it('init() is idempotent — calling it twice does not throw', async () => {
      await expect(adapter.init()).resolves.not.toThrow();
      await expect(adapter.init()).resolves.not.toThrow();
    });

    it('findCandidates returns an empty array when no snapshots are stored', async () => {
      const candidates = await adapter.findCandidates(fpIdentical, 0, 10);
      expect(Array.isArray(candidates)).toBe(true);
      expect(candidates).toHaveLength(0);
    });

    it('linkToUser does not throw (stub or real)', async () => {
      // Save a device first so the linkToUser call has a valid target
      const deviceId = `dev_contract_${randomUUID()}`;
      await adapter.save({
        id: randomUUID(),
        deviceId,
        timestamp: new Date(),
        fingerprint: fpIdentical,
      });
      await expect(adapter.linkToUser(deviceId, 'user_contract_123')).resolves.not.toThrow();
    });

    it('getHistory returns an empty array for an unknown deviceId', async () => {
      const history = await adapter.getHistory('dev_nonexistent', 10);
      expect(Array.isArray(history)).toBe(true);
      expect(history).toHaveLength(0);
    });

    it('save + getHistory round-trip preserves all snapshot fields', async () => {
      const deviceId = `dev_rt_${randomUUID()}`;
      const snapshot: StoredFingerprint = {
        id: randomUUID(),
        deviceId,
        userId: 'user_rt',
        timestamp: new Date('2026-01-15T12:00:00Z'),
        fingerprint: fpIdentical,
        matchConfidence: 92,
      };

      await adapter.save(snapshot);
      const history = await adapter.getHistory(deviceId, 5);

      expect(history).toHaveLength(1);
      expect(history[0].id).toBe(snapshot.id);
      expect(history[0].userId).toBe('user_rt');
      expect(history[0].matchConfidence).toBe(92);
    });

    it('findCandidates respects minConfidence threshold', async () => {
      const deviceId = `dev_thresh_${randomUUID()}`;
      await adapter.save({ id: randomUUID(), deviceId, timestamp: new Date(), fingerprint: fpVeryDifferent });

      // With a very high minimum, the dissimilar device should not appear
      const candidates = await adapter.findCandidates(fpIdentical, 90, 10);
      const ids = candidates.map((c) => c.deviceId);
      expect(ids).not.toContain(deviceId);
    });

    it('getAllFingerprints returns all saved snapshots', async () => {
      const devA = `dev_a_${randomUUID()}`;
      const devB = `dev_b_${randomUUID()}`;

      await adapter.save({ id: randomUUID(), deviceId: devA, timestamp: new Date(), fingerprint: fpIdentical });
      await adapter.save({ id: randomUUID(), deviceId: devB, timestamp: new Date(), fingerprint: fpVerySimilar });

      const all = await adapter.getAllFingerprints();
      const ids = all.map((s) => s.deviceId);
      expect(ids).toContain(devA);
      expect(ids).toContain(devB);
    });
  });
}
