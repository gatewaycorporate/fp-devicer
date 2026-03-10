import { describe, it, expect } from 'vitest';
import {
  levenshteinSimilarity,
  jaccardSimilarity,
  numericProximity,
  screenSimilarity,
} from '../../libs/comparitors';

describe('levenshteinSimilarity', () => {
  it('returns 1 for identical strings', () => {
    expect(levenshteinSimilarity('abc', 'abc')).toBe(1);
    expect(levenshteinSimilarity('Mozilla/5.0', 'Mozilla/5.0')).toBe(1);
  });

  it('returns 0 when either string is empty (but not both)', () => {
    expect(levenshteinSimilarity('', 'abc')).toBe(0);
    expect(levenshteinSimilarity('abc', '')).toBe(0);
  });

  it('returns 1 for both-empty strings (identical)', () => {
    expect(levenshteinSimilarity('', '')).toBe(1);
  });

  it('returns a fractional value for partially similar strings', () => {
    const score = levenshteinSimilarity('kitten', 'sitten');
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it('returns lower score as strings diverge more', () => {
    const close = levenshteinSimilarity('Mozilla/5.0 (Windows)', 'Mozilla/5.0 (Windowz)');
    const far = levenshteinSimilarity('Mozilla/5.0 (Windows)', 'AppleWebKit/537.36');
    expect(close).toBeGreaterThan(far);
  });

  it('score is between 0 and 1 inclusive for any inputs', () => {
    const cases: [string, string][] = [
      ['a', 'b'],
      ['abcdef', 'ghijkl'],
      ['short', 'a very much longer string that diverges completely'],
    ];
    for (const [a, b] of cases) {
      const s = levenshteinSimilarity(a, b);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });
});

describe('jaccardSimilarity', () => {
  it('returns 1 for identical arrays', () => {
    expect(jaccardSimilarity(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(1);
  });

  it('returns 1 when both arrays are empty', () => {
    expect(jaccardSimilarity([], [])).toBe(1);
  });

  it('returns 0 when one array is empty and the other is not', () => {
    expect(jaccardSimilarity([], ['a', 'b'])).toBe(0);
    expect(jaccardSimilarity(['a', 'b'], [])).toBe(0);
  });

  it('returns 0.5 for 50% overlap', () => {
    // |{a,b,c} ∩ {b,c,d}| / |{a,b,c,d}| = 2/4
    expect(jaccardSimilarity(['a', 'b', 'c'], ['b', 'c', 'd'])).toBeCloseTo(0.5);
  });

  it('returns 0 for completely disjoint arrays', () => {
    expect(jaccardSimilarity(['x', 'y'], ['a', 'b'])).toBe(0);
  });

  it('treats non-array inputs as empty arrays', () => {
    expect(jaccardSimilarity(null, null)).toBe(1);
    expect(jaccardSimilarity(null, ['a'])).toBe(0);
    expect(jaccardSimilarity('string', ['a', 'string'])).toBe(0);
  });
});

describe('numericProximity', () => {
  it('returns 1 for equal values', () => {
    expect(numericProximity(100, 100)).toBe(1);
    expect(numericProximity(0, 0)).toBe(1);
  });

  it('returns 0.5 when either operand is undefined', () => {
    expect(numericProximity(undefined, 100)).toBe(0.5);
    expect(numericProximity(100, undefined)).toBe(0.5);
    expect(numericProximity(undefined, undefined)).toBe(0.5);
  });

  it('returns a high score for close values', () => {
    const score = numericProximity(1920, 1920);
    expect(score).toBe(1);
    const partialScore = numericProximity(1920, 1900);
    expect(partialScore).toBeGreaterThan(0.9);
  });

  it('returns a lower score for very different values', () => {
    const score = numericProximity(1, 1000);
    expect(score).toBeLessThan(0.1);
  });

  it('returns 1 or 0 for non-numeric types (falls back to exact match)', () => {
    expect(numericProximity('win32', 'win32')).toBe(1);
    expect(numericProximity('win32', 'linux')).toBe(0);
  });

  it('handles negative numbers without going below 0', () => {
    const score = numericProximity(-100, 100);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

describe('screenSimilarity', () => {
  const baseScreen = {
    width: 1920,
    height: 1080,
    colorDepth: 24,
    pixelDepth: 24,
    orientation: { type: 'landscape-primary', angle: 0 },
  };

  it('returns 1 for identical screen objects', () => {
    expect(screenSimilarity(baseScreen, baseScreen)).toBe(1);
  });

  it('returns 0.5 when either argument is null or undefined', () => {
    expect(screenSimilarity(null, baseScreen)).toBe(0.5);
    expect(screenSimilarity(baseScreen, null)).toBe(0.5);
    expect(screenSimilarity(null, null)).toBe(0.5);
  });

  it('returns a high score when only orientation differs', () => {
    const rotated = { ...baseScreen, orientation: { type: 'portrait-primary', angle: 90 } };
    const score = screenSimilarity(baseScreen, rotated);
    // 4 out of 5 sub-fields match → ~0.8
    expect(score).toBeCloseTo(0.8);
  });

  it('returns a fractional score for partially matching screens', () => {
    const different = { width: 1280, height: 800, colorDepth: 16, pixelDepth: 16, orientation: { type: 'portrait-primary', angle: 90 } };
    const score = screenSimilarity(baseScreen, different);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it('handles missing sub-fields gracefully via neutral 0.5 score', () => {
    const partial = { width: 1920, height: 1080 }; // no colorDepth/pixelDepth/orientation
    const score = screenSimilarity(baseScreen, partial);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});
