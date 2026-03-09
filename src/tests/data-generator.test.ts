import { describe, it, expect } from 'vitest';
import { generateDataset, createBaseFingerprint, mutate } from '../benchmarks/data-generator';

// Test browser diversity

describe('Data Generator', () => {
  it('should generate fingerprints with browser diversity', () => {
    const dataset = generateDataset(50, 2);
    const browsers = new Set(dataset.map(f => f.data.vendor));
    expect(browsers.size).toBeGreaterThan(1); // Chrome, Firefox, Safari
  });

  it('should generate realistic canvas/webgl/audio blobs', () => {
    const fp = createBaseFingerprint(123);
    // simpleHash output is a base-36 string, typically 6–8 characters
    expect(fp.canvas).toMatch(/^[0-9a-z]+$/);
    expect(fp.webgl).toMatch(/^[0-9a-z]+$/);
    expect(fp.audio).toMatch(/^[0-9a-z]+$/);
    expect(fp.canvas!.length).toBeGreaterThanOrEqual(4);
    expect(fp.webgl!.length).toBeGreaterThanOrEqual(4);
    expect(fp.audio!.length).toBeGreaterThanOrEqual(4);
  });

  it('should generate attractor-zone devices', () => {
    const dataset = generateDataset(20, 1);
    const attractors = dataset.filter(f => f.isAttractor);  // use the flag, not id prefix
    expect(attractors.length).toBeGreaterThan(0);
    for (const f of attractors) {
      expect(f.data.platform).toBe('Win32');
      expect(f.data.language).toBe('en-US');
      expect(f.data.timezone).toBe('America/New_York');
      expect(f.data.hardwareConcurrency).toBe(8);
      expect(f.data.deviceMemory).toBe(8);
    }
  });

  it('should mutate fingerprints realistically', () => {
    const fp = createBaseFingerprint(42);
    const mutatedLow = mutate(fp, 'low');
    const mutatedMedium = mutate(fp, 'medium');
    const mutatedHigh = mutate(fp, 'high');
    expect(mutatedLow).not.toEqual(fp);
    expect(mutatedMedium).not.toEqual(fp);
    expect(mutatedHigh).not.toEqual(fp);
  });
});
