import { describe, it, expect } from 'vitest';
import {
  createBaseFingerprint,
  generateAdversarialPerturbation,
  generateBrowserDrift,
  generateCommodityCollision,
  generateDataset,
  generateEnvironmentChange,
  generatePrivacyResistance,
  generateTravelNetworkChange,
  mutate,
} from '../benchmarks/data-generator';

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

  it('should make extreme mutations deterministic for the same source fingerprint', () => {
    const fp = createBaseFingerprint(42);
    const mutatedExtremeA = mutate(fp, 'extreme');
    const mutatedExtremeB = mutate(fp, 'extreme');

    expect(mutatedExtremeA).toEqual(mutatedExtremeB);
    expect(mutatedExtremeA).not.toEqual(fp);
  });

  it('should generate browser drift scenarios with expected browser changes', () => {
    const minor = generateBrowserDrift(10, 'minor');
    const crossBrowser = generateBrowserDrift(11, 'cross-browser');

    expect(minor.expectedSameDevice).toBe(true);
    expect(minor.fp1.platform).toBe(minor.fp2.platform);
    expect(minor.fp1.userAgent).not.toBe(minor.fp2.userAgent);

    expect(crossBrowser.expectedSameDevice).toBe(false);
    expect(crossBrowser.fp2.userAgent).toContain('Firefox');
  });

  it('should generate environment change scenarios with dock and mobile-desktop transitions', () => {
    const dock = generateEnvironmentChange(20, 'external-dock');
    const mobileDesktop = generateEnvironmentChange(21, 'mobile-desktop');

    expect(dock.expectedSameDevice).toBe(true);
    expect(dock.fp1.screen?.width).not.toBe(dock.fp2.screen?.width);

    expect(mobileDesktop.expectedSameDevice).toBe(false);
    expect(mobileDesktop.fp2.platform).toBe('iPhone');
  });

  it('should generate privacy resistance scenarios with reduced entropy signals', () => {
    const tor = generatePrivacyResistance(30, 'tor');
    const resistant = generatePrivacyResistance(31, 'resistant-browser');
    const defender = generatePrivacyResistance(32, 'canvas-defender');

    expect(tor.expectedSameDevice).toBe(false);
    expect(tor.fp1.userAgent).toContain('Firefox/115.0');

    expect(resistant.fp1.canvas).toBeUndefined();
    expect(resistant.fp2.webgl).toBeUndefined();

    expect(defender.expectedSameDevice).toBe(true);
    expect(defender.fp1.canvas).not.toBe(defender.fp2.canvas);
  });

  it('should generate adversarial perturbation scenarios with deterministic field changes', () => {
    const noise = generateAdversarialPerturbation(40, 'canvas-noise');
    const fonts = generateAdversarialPerturbation(41, 'font-randomization');
    const uaRotation = generateAdversarialPerturbation(42, 'ua-rotation');

    expect(noise.expectedSameDevice).toBe(true);
    expect(noise.fp1.webgl).not.toBe(noise.fp2.webgl);

    expect(fonts.fp1.fonts).not.toEqual(fonts.fp2.fonts);
    expect(fonts.fp2.plugins).toEqual([]);

    expect(uaRotation.fp2.userAgent).toContain('Firefox/126.0');
  });

  it('should generate travel and network scenarios without changing device identity expectation', () => {
    const travel = generateTravelNetworkChange(50, 'timezone-travel');
    const vpn = generateTravelNetworkChange(51, 'vpn-activation');

    expect(travel.expectedSameDevice).toBe(true);
    expect(travel.fp1.timezone).not.toBe(travel.fp2.timezone);

    expect(vpn.expectedSameDevice).toBe(true);
    expect(vpn.fp1).toEqual(vpn.fp2);
  });

  it('should generate commodity collision scenarios that emulate shared fleet defaults', () => {
    const corporate = generateCommodityCollision(60, 'corporate-fleet');
    const iphone = generateCommodityCollision(61, 'iphone-defaults');
    const terminal = generateCommodityCollision(62, 'public-terminal');

    expect(corporate.expectedSameDevice).toBe(false);
    expect(corporate.fp1.canvas).toBe(corporate.fp2.canvas);

    expect(iphone.fp1.platform).toBe('iPhone');
    expect(iphone.fp1.screen).toEqual(iphone.fp2.screen);

    expect(terminal.fp1.userAgent).toContain('PublicTerminal/1.0');
    expect(terminal.expectedSameDevice).toBe(false);
  });
});
