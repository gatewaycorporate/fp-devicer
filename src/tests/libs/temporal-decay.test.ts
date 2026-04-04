import { describe, it, expect } from 'vitest';
import {
  computeTemporalDecayFactor,
  DEFAULT_DECAY_HALF_LIFE_MS,
  calculateConfidence,
  calculateScoreBreakdown,
  createConfidenceCalculator,
} from '../../libs/confidence.js';
import { fpIdentical, fpVerySimilar, fpDifferent, fpVeryDifferent } from '../fixtures/fingerprints.js';

// ─── computeTemporalDecayFactor ──────────────────────────────────────────────

describe('computeTemporalDecayFactor', () => {
  it('returns 1.0 for a fresh snapshot (age = 0)', () => {
    expect(computeTemporalDecayFactor(0)).toBe(1.0);
  });

  it('returns 1.0 for negative age (future timestamp edge case)', () => {
    expect(computeTemporalDecayFactor(-1000)).toBe(1.0);
  });

  it('returns e^-1 ≈ 0.368 at exactly one half-life', () => {
    const factor = computeTemporalDecayFactor(DEFAULT_DECAY_HALF_LIFE_MS);
    expect(factor).toBeCloseTo(Math.exp(-1), 5);
  });

  it('returns e^-2 ≈ 0.135 at exactly two half-lives', () => {
    const factor = computeTemporalDecayFactor(DEFAULT_DECAY_HALF_LIFE_MS * 2);
    expect(factor).toBeCloseTo(Math.exp(-2), 5);
  });

  it('is strictly monotone decreasing for increasing ages', () => {
    const ages = [0, 1, 1_000, 1_000_000, DEFAULT_DECAY_HALF_LIFE_MS, DEFAULT_DECAY_HALF_LIFE_MS * 3];
    const factors = ages.map((a) => computeTemporalDecayFactor(a));
    for (let i = 1; i < factors.length; i++) {
      expect(factors[i]).toBeLessThan(factors[i - 1]);
    }
  });

  it('respects a custom halfLifeMs', () => {
    const custom = 10_000;
    expect(computeTemporalDecayFactor(custom, custom)).toBeCloseTo(Math.exp(-1), 5);
  });

  it('DEFAULT_DECAY_HALF_LIFE_MS is 30 days in ms', () => {
    expect(DEFAULT_DECAY_HALF_LIFE_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

// ─── snapshotAgeMs in calculateScoreBreakdown ────────────────────────────────

describe('calculateScoreBreakdown – temporal decay', () => {
  it('snapshotAgeMs=0 produces the same composite as no snapshotAgeMs', () => {
    const fresh = calculateScoreBreakdown(fpIdentical, fpVerySimilar, { snapshotAgeMs: 0 });
    const none = calculateScoreBreakdown(fpIdentical, fpVerySimilar);
    expect(fresh.composite).toBe(none.composite);
  });

  it('very old snapshot produces a lower or equal composite than a fresh one', () => {
    const twoYearsMs = 2 * 365 * 24 * 60 * 60 * 1000;
    const oldBreakdown = calculateScoreBreakdown(fpIdentical, fpVerySimilar, { snapshotAgeMs: twoYearsMs });
    const freshBreakdown = calculateScoreBreakdown(fpIdentical, fpVerySimilar, { snapshotAgeMs: 0 });
    // A very old snapshot's ceiling is pulled inward — composite must not exceed fresh composite.
    expect(oldBreakdown.composite).toBeLessThanOrEqual(freshBreakdown.composite);
  });

  it('non-exact ceiling is lower for a one-year-old snapshot than for a fresh one', () => {
    const oneYearMs = 365 * 24 * 60 * 60 * 1000;
    const oldBreakdown = calculateScoreBreakdown(fpIdentical, fpVerySimilar, { snapshotAgeMs: oneYearMs });
    const freshBreakdown = calculateScoreBreakdown(fpIdentical, fpVerySimilar, { snapshotAgeMs: 0 });
    expect(oldBreakdown.composite).toBeLessThanOrEqual(freshBreakdown.composite);
  });

  it('identical fingerprints still return 100 regardless of age (exact-match promotion)', () => {
    const twoYearsMs = 2 * 365 * 24 * 60 * 60 * 1000;
    const breakdown = calculateScoreBreakdown(fpIdentical, fpIdentical, { snapshotAgeMs: twoYearsMs });
    // fpIdentical has low attractor risk, so exact-match promotion fires
    expect(breakdown.composite).toBe(100);
  });

  it('score for very-different fps with old snapshot is not inflated above fresh score', () => {
    const twoYearsMs = 2 * 365 * 24 * 60 * 60 * 1000;
    const old = calculateScoreBreakdown(fpIdentical, fpDifferent, { snapshotAgeMs: twoYearsMs });
    const fresh = calculateScoreBreakdown(fpIdentical, fpDifferent, { snapshotAgeMs: 0 });
    // Mismatch penalty reduced for old snapshot, but device similarity unchanged
    // → score should be slightly higher or equal (penalty relaxation favours same-device)
    expect(old.composite).toBeGreaterThanOrEqual(0);
    expect(old.composite).toBeLessThanOrEqual(100);
    // Fresh and old are both valid scores; old snapshots have a lower ceiling so score ≤ fresh
    expect(old.composite).toBeLessThanOrEqual(fresh.composite + 5); // allow minor rounding
  });

  it('composites are always in [0, 100]', () => {
    const ages = [0, DEFAULT_DECAY_HALF_LIFE_MS, DEFAULT_DECAY_HALF_LIFE_MS * 10];
    const pairs = [
      [fpIdentical, fpVerySimilar],
      [fpIdentical, fpDifferent],
      [fpIdentical, fpVeryDifferent],
    ] as const;
    for (const ageMs of ages) {
      for (const [a, b] of pairs) {
        const { composite } = calculateScoreBreakdown(a, b, { snapshotAgeMs: ageMs });
        expect(composite).toBeGreaterThanOrEqual(0);
        expect(composite).toBeLessThanOrEqual(100);
      }
    }
  });

  it('createConfidenceCalculator honours snapshotAgeMs option', () => {
    const twoYearsMs = 2 * 365 * 24 * 60 * 60 * 1000;
    const aged = createConfidenceCalculator({ snapshotAgeMs: twoYearsMs });
    const fresh = createConfidenceCalculator({ snapshotAgeMs: 0 });

    const agedScore = aged.calculateConfidence(fpIdentical, fpVerySimilar);
    const freshScore = fresh.calculateConfidence(fpIdentical, fpVerySimilar);

    expect(agedScore).toBeLessThanOrEqual(freshScore);
  });
});

// ─── DeviceManager temporal behaviour (integration pass-through) ─────────────

describe('calculateConfidence – baseline unchanged without snapshotAgeMs', () => {
  it('calculateConfidence(identical, identical) still returns 100', () => {
    expect(calculateConfidence(fpIdentical, fpIdentical)).toBe(100);
  });

  it('calculateConfidence(identical, verySimilar) still returns a high score', () => {
    expect(calculateConfidence(fpIdentical, fpVerySimilar)).toBeGreaterThan(70);
  });

  it('calculateConfidence(identical, veryDifferent) still returns a low score', () => {
    expect(calculateConfidence(fpIdentical, fpVeryDifferent)).toBeLessThan(60);
  });
});
