import { describe, it, expect, beforeEach } from 'vitest';
import { DeviceManager, createInMemoryAdapter } from '../../main.js';
import { computeDeviceDrift } from '../../libs/drift.js';
import { fpIdentical, fpVerySimilar, fpSimilar, fpDifferent, fpVeryDifferent } from '../fixtures/fingerprints.js';
import { createBaseFingerprint, mutate } from '../../benchmarks/data-generator.js';
import type { StoredFingerprint } from '../../types/storage.js';
import { randomUUID } from 'crypto';

// ─── Helper: build a synthetic history ───────────────────────────────────────

function makeHistory(fps: ReturnType<typeof createBaseFingerprint>[], baseDate = new Date('2026-01-01')): StoredFingerprint[] {
  return fps.map((fp, i) => ({
    id: randomUUID(),
    deviceId: 'test-device',
    timestamp: new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000),
    fingerprint: fp,
    matchConfidence: 95,
  }));
}

// ─── computeDeviceDrift – pure function ──────────────────────────────────────

describe('computeDeviceDrift', () => {
  it('returns driftScore=0 and NORMAL_AGING when incoming === most recent snapshot', () => {
    const base = createBaseFingerprint(42);
    const history = makeHistory([base, base, base]);
    const report = computeDeviceDrift(base, history);

    expect(report.driftScore).toBe(0);
    expect(report.patternFlag).toBe('NORMAL_AGING');
    expect(report.suspiciousFields).toHaveLength(0);
    expect(report.snapshotsAnalyzed).toBe(3);
  });

  it('returns a low drift score for a slightly mutated fingerprint on a stable device', () => {
    const base = createBaseFingerprint(7);
    const history = makeHistory([base, base, base, base, base]);
    const slightly = mutate(base, 'low');
    const report = computeDeviceDrift(slightly, history);

    expect(report.driftScore).toBeGreaterThanOrEqual(0);
    expect(report.driftScore).toBeLessThan(60);
    expect(report.patternFlag).toBe('NORMAL_AGING');
  });

  it('returns a higher drift score for a very-different incoming on a stable device', () => {
    const base = createBaseFingerprint(99);
    const history = makeHistory([base, base, base]);
    const different = mutate(base, 'extreme');
    const report = computeDeviceDrift(different, history);

    expect(report.driftScore).toBeGreaterThan(30);
  });

  it('stable device with very different incoming → suspiciousFields not empty', () => {
    const base = createBaseFingerprint(55);
    const history = makeHistory([base, base, base, base]);
    const different = mutate(base, 'extreme');
    const report = computeDeviceDrift(different, history);

    expect(report.suspiciousFields.length).toBeGreaterThan(0);
    // Suspicious fields have a zScore above the default threshold of 1.5
    for (const f of report.suspiciousFields) {
      expect(f.zScore).toBeGreaterThanOrEqual(1.5);
    }
  });

  it('suspiciousFields are sorted descending by zScore', () => {
    const base = createBaseFingerprint(13);
    const history = makeHistory([base, base, base]);
    const different = mutate(base, 'extreme');
    const report = computeDeviceDrift(different, history);

    for (let i = 1; i < report.suspiciousFields.length; i++) {
      expect(report.suspiciousFields[i - 1].zScore).toBeGreaterThanOrEqual(
        report.suspiciousFields[i].zScore
      );
    }
  });

  it('driftScore is always in [0, 100]', () => {
    const levels = ['none', 'low', 'medium', 'high', 'extreme'] as const;
    const base = createBaseFingerprint(17);
    const history = makeHistory([base, base, base]);
    for (const level of levels) {
      const incoming = level === 'none' ? base : mutate(base, level);
      const { driftScore } = computeDeviceDrift(incoming, history);
      expect(driftScore).toBeGreaterThanOrEqual(0);
      expect(driftScore).toBeLessThanOrEqual(100);
    }
  });

  it('snapshotsAnalyzed equals history length', () => {
    const base = createBaseFingerprint(3);
    const histories = [1, 3, 7].map((n) => makeHistory(Array(n).fill(base)));
    for (const h of histories) {
      expect(computeDeviceDrift(base, h).snapshotsAnalyzed).toBe(h.length);
    }
  });

  it('baselineWindowMs is 0 for a single-snapshot history', () => {
    const base = createBaseFingerprint(2);
    const history = makeHistory([base]);
    expect(computeDeviceDrift(base, history).baselineWindowMs).toBe(0);
  });

  it('baselineWindowMs > 0 for multi-snapshot history', () => {
    const base = createBaseFingerprint(5);
    const history = makeHistory([base, base, base]); // 3 snapshots, 2 days apart each
    expect(computeDeviceDrift(base, history).baselineWindowMs).toBeGreaterThan(0);
  });

  it('respects custom suspiciousZScoreThreshold', () => {
    const base = createBaseFingerprint(8);
    const history = makeHistory([base, base, base]);
    const different = mutate(base, 'extreme');

    const defaultReport = computeDeviceDrift(different, history, { suspiciousZScoreThreshold: 1.5 });
    const tightReport = computeDeviceDrift(different, history, { suspiciousZScoreThreshold: 0.1 });

    // With a lower threshold, more fields should be flagged as suspicious.
    expect(tightReport.suspiciousFields.length).toBeGreaterThanOrEqual(
      defaultReport.suspiciousFields.length
    );
  });

  it('historicalStability and currentDeviation are in [0, 1]', () => {
    const base = createBaseFingerprint(23);
    const history = makeHistory([base, base, base]);
    const incoming = mutate(base, 'high');
    const { suspiciousFields } = computeDeviceDrift(incoming, history);

    for (const f of suspiciousFields) {
      expect(f.historicalStability).toBeGreaterThanOrEqual(0);
      expect(f.historicalStability).toBeLessThanOrEqual(1);
      expect(f.currentDeviation).toBeGreaterThanOrEqual(0);
      expect(f.currentDeviation).toBeLessThanOrEqual(1);
    }
  });
});

// ─── Pattern classification ───────────────────────────────────────────────────

describe('computeDeviceDrift – pattern flags', () => {
  it('NORMAL_AGING: stable device + low mutations → low score', () => {
    const base = createBaseFingerprint(100);
    const history = makeHistory([base, mutate(base, 'low'), base, mutate(base, 'low')]);
    const incoming = mutate(base, 'low');
    const { patternFlag, driftScore } = computeDeviceDrift(incoming, history);
    expect(driftScore).toBeLessThan(40);
    expect(patternFlag).toBe('NORMAL_AGING');
  });

  it('INCREMENTAL_DRIFT or higher: stable device + extreme mutations → elevated score', () => {
    const base = createBaseFingerprint(200);
    const history = makeHistory([base, base, base, base, base]);
    const incoming = mutate(base, 'extreme');
    const { driftScore } = computeDeviceDrift(incoming, history);
    expect(driftScore).toBeGreaterThanOrEqual(20);
  });

  it('patternFlag is one of the four valid values', () => {
    const base = createBaseFingerprint(300);
    const history = makeHistory([base, base]);
    const incoming = mutate(base, 'high');
    const { patternFlag } = computeDeviceDrift(incoming, history);
    expect(['NORMAL_AGING', 'INCREMENTAL_DRIFT', 'ABRUPT_CHANGE', 'CANONICAL_INJECTION']).toContain(patternFlag);
  });
});

// ─── DeviceManager.analyzeDeviceDrift integration tests ──────────────────────

describe('DeviceManager.analyzeDeviceDrift', () => {
  let manager: DeviceManager;
  let adapter: ReturnType<typeof createInMemoryAdapter>;

  beforeEach(() => {
    adapter = createInMemoryAdapter();
    manager = new DeviceManager(adapter, { dedupWindowMs: 0 });
  });

  it('returns null when the device has no history', async () => {
    const result = await manager.analyzeDeviceDrift('nonexistent-device', fpIdentical);
    expect(result).toBeNull();
  });

  it('returns a DriftReport for a known device', async () => {
    const { deviceId } = await manager.identify(fpIdentical);
    await manager.identify(fpVerySimilar);

    const report = await manager.analyzeDeviceDrift(deviceId, fpSimilar);

    expect(report).not.toBeNull();
    expect(report!.deviceId).toBe(deviceId);
    expect(typeof report!.driftScore).toBe('number');
    expect(report!.snapshotsAnalyzed).toBeGreaterThanOrEqual(1);
    expect(['NORMAL_AGING', 'INCREMENTAL_DRIFT', 'ABRUPT_CHANGE', 'CANONICAL_INJECTION']).toContain(report!.patternFlag);
  });

  it('driftScore is low when following up with a very similar fingerprint', async () => {
    // Seed device with consistent fingerprints
    for (let i = 0; i < 4; i++) {
      await manager.identify(fpIdentical);
    }
    const first = await manager.identify(fpIdentical);

    // Slightly different follow-up → low drift
    const report = await manager.analyzeDeviceDrift(first.deviceId, fpVerySimilar);
    expect(report!.driftScore).toBeLessThan(60);
  });

  it('driftScore is elevated when a very-different fingerprint arrives for a stable device', async () => {
    // Seed stable device
    for (let i = 0; i < 4; i++) {
      await manager.identify(fpIdentical);
    }
    const first = await manager.identify(fpIdentical);

    // Extremely different arriving fingerprint
    const report = await manager.analyzeDeviceDrift(first.deviceId, fpVeryDifferent);
    expect(report!.driftScore).toBeGreaterThan(15);
  });

  it('exposes baselineWindowMs >= 0', async () => {
    const { deviceId } = await manager.identify(fpIdentical);
    const report = await manager.analyzeDeviceDrift(deviceId, fpSimilar);
    expect(report!.baselineWindowMs).toBeGreaterThanOrEqual(0);
  });

  it('applies stabilityWindowSize option to limit history loaded', async () => {
    const base = createBaseFingerprint(41);
    // Use distinct fingerprints so the adapter's hash-level deduplication
    // doesn't collapse them all into a single stored snapshot.
    const fp1 = await manager.identify(base);
    for (let i = 2; i <= 8; i++) {
      await manager.identify(createBaseFingerprint(41 + i));
      // Force subsequent calls onto the same device by using identify with each
      // unique fingerprint — but we need them all under the same deviceId.
      // Instead, seed stable history using the adapter directly.
    }
    // Directly seed 8 distinct snapshots under the same deviceId so we can
    // verify the window slicing without adapter dedup interference.
    const deviceId = fp1.deviceId;
    for (let i = 1; i <= 8; i++) {
      await adapter.save({
        id: `test-snap-${i}`,
        deviceId,
        timestamp: new Date(Date.now() - i * 1000),
        fingerprint: createBaseFingerprint(100 + i),
        matchConfidence: 90,
      });
    }

    const narrowReport = await manager.analyzeDeviceDrift(deviceId, fpDifferent, { stabilityWindowSize: 2 });
    const wideReport   = await manager.analyzeDeviceDrift(deviceId, fpDifferent, { stabilityWindowSize: 10 });

    expect(narrowReport!.snapshotsAnalyzed).toBeLessThanOrEqual(2);
    expect(wideReport!.snapshotsAnalyzed).toBeGreaterThan(narrowReport!.snapshotsAnalyzed);
  });
});
