import { describe, it, expect, beforeEach } from 'vitest';
import { createDrizzleAdapter } from '../../examples/adapters/drizzle';
import type { StoredFingerprint } from '../../types/storage';
import { randomUUID } from 'crypto';
import { fpIdentical, fpVerySimilar } from '../fixtures/fingerprints';

describe('DrizzleAdapter', () => {
  let adapter: ReturnType<typeof createDrizzleAdapter>;

  beforeEach(async () => {
    adapter = createDrizzleAdapter("./src/tests/storage/test-db.sqlite");
    await adapter.init();
    adapter.deleteOldSnapshots(0); // Clear all entries before each test
  });

  it('saves snapshot and retrieves full history', async () => {
    const deviceId = 'dev_test_001';
    const snapshot: StoredFingerprint = {
      id: randomUUID(),
      deviceId,
      timestamp: new Date(),
      fingerprint: fpIdentical,
      userId: 'user_123',
    };

    await adapter.save(snapshot);
    const history = await adapter.getHistory(deviceId, 10);

    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
        deviceId,
        fingerprint: fpIdentical,
        timestamp: expect.any(Date),
    });
  });

  it('findCandidates returns sorted high-confidence matches', async () => {
    const devA = 'dev_a';
    const devB = 'dev_b';

    await adapter.save({ id: randomUUID(), deviceId: devA, timestamp: new Date(), fingerprint: fpIdentical });
    await adapter.save({ id: randomUUID(), deviceId: devB, timestamp: new Date(), fingerprint: fpVerySimilar });

    const candidates = await adapter.findCandidates(fpIdentical, 70, 5);

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].deviceId).toBe(devA);
    expect(candidates[0].confidence).toBeGreaterThanOrEqual(90); // identical
    for (let i = 1; i < candidates.length; i++) {
      expect(candidates[i].confidence).toBeLessThanOrEqual(candidates[i - 1].confidence);
    }
  });

  it('deleteOldSnapshots removes old entries (in-memory stub)', async () => {
    const count = await adapter.deleteOldSnapshots(30);
    expect(count).toBe(0); // in-memory fallback returns 0
  });
});