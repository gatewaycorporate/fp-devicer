import { describe, it, expect } from 'vitest';
import {
    DefaultAttractorModel,
    FrequencyTableAttractorModel,
    createFrequencyTableAttractorModel,
} from '../../libs/attractor-model.js';
import { computeAttractorRisk } from '../../libs/confidence.js';
import { calculateScoreBreakdown, createConfidenceCalculator } from '../../libs/confidence.js';
import type { FPDataSet } from '../../types/data.js';
import { fpIdentical, fpVeryDifferent } from '../fixtures/fingerprints.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** Fingerprint with all attractor signals present (maximum native risk). */
const highRiskFP: FPDataSet = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
    platform: 'Win32',
    language: 'en-US',
    screen: { width: 1920, height: 1080 },
    hardwareConcurrency: 8,
    deviceMemory: 8,
    // canvas / webgl / audio deliberately absent → adds extra risk
};

/** Fingerprint with uncommon / niche signals. */
const lowRiskFP: FPDataSet = {
    userAgent: 'curl/7.88.1',
    platform: 'Linux x86_64',
    language: 'fr-CH',
    screen: { width: 3840, height: 2160 },
    hardwareConcurrency: 32,
    deviceMemory: 32,
    canvas: 'data:image/png;base64,abc123',
    webgl: 'WebGL context hash xyz',
    audio: '0.1234567890123',
};

// ─── DefaultAttractorModel ────────────────────────────────────────────────────

describe('DefaultAttractorModel', () => {
    it('mirrors computeAttractorRisk exactly for any fingerprint', () => {
        const model = new DefaultAttractorModel();
        for (const fp of [highRiskFP, lowRiskFP, fpIdentical, fpVeryDifferent]) {
            expect(model.score(fp)).toBe(computeAttractorRisk(fp));
        }
    });

    it('rates the high-risk fixture higher than the low-risk fixture', () => {
        const model = new DefaultAttractorModel();
        expect(model.score(highRiskFP)).toBeGreaterThan(model.score(lowRiskFP));
    });

    it('returns a value in [0, 100]', () => {
        const model = new DefaultAttractorModel();
        const score = model.score(highRiskFP);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
    });
});

// ─── FrequencyTableAttractorModel ─────────────────────────────────────────────

describe('FrequencyTableAttractorModel', () => {
    it('empty table produces same result as DefaultAttractorModel (all fallbacks)', () => {
        const tableModel = new FrequencyTableAttractorModel({});
        const defaultModel = new DefaultAttractorModel();
        for (const fp of [highRiskFP, lowRiskFP, fpIdentical]) {
            expect(tableModel.score(fp)).toBe(defaultModel.score(fp));
        }
    });

    it('common platform (high freq) scores higher than rare platform', () => {
        const model = new FrequencyTableAttractorModel({
            platforms: { Win32: 0.85, MacIntel: 0.10 },
        });

        const winFP: FPDataSet = { ...highRiskFP, platform: 'Win32' };
        const linuxFP: FPDataSet = { ...highRiskFP, platform: 'Linux aarch64' };

        expect(model.score(winFP)).toBeGreaterThan(model.score(linuxFP));
    });

    it('common resolution (high freq) scores higher than rare resolution', () => {
        const model = new FrequencyTableAttractorModel({
            resolutions: { '1920x1080': 0.55, '800x600': 0.01 },
        });

        const fullHD: FPDataSet = { ...highRiskFP, screen: { width: 1920, height: 1080 } };
        const antique: FPDataSet = { ...highRiskFP, screen: { width: 800, height: 600 } };

        expect(model.score(fullHD)).toBeGreaterThan(model.score(antique));
    });

    it('common language (high freq) scores higher than rare language', () => {
        const model = new FrequencyTableAttractorModel({
            languages: { 'en-US': 0.70, 'fr-CH': 0.01 },
        });

        const enFP: FPDataSet = { ...highRiskFP, language: 'en-US' };
        const frFP: FPDataSet = { ...highRiskFP, language: 'fr-CH' };

        expect(model.score(enFP)).toBeGreaterThan(model.score(frFP));
    });

    it('common browser (high freq) scores higher than uncommon one', () => {
        const model = new FrequencyTableAttractorModel({
            browserFamilies: { chrome: 0.65, lynx: 0.001 },
        });

        const chromeFP: FPDataSet = {
            ...highRiskFP,
            userAgent: 'Mozilla/5.0 Chrome/124.0.0.0',
        };
        const lynxFP: FPDataSet = {
            ...highRiskFP,
            userAgent: 'Lynx/2.8.9rel.1',
        };

        expect(model.score(chromeFP)).toBeGreaterThan(model.score(lynxFP));
    });

    it('common hardware profile (high freq) scores higher than rare one', () => {
        const model = new FrequencyTableAttractorModel({
            hardwareProfiles: [
                { concurrency: 8, memory: 8, frequency: 0.60 },
                { concurrency: 64, memory: 512, frequency: 0.001 },
            ],
        });

        const commonHW: FPDataSet = {
            ...highRiskFP,
            hardwareConcurrency: 8,
            deviceMemory: 8,
        };
        const rareHW: FPDataSet = {
            ...highRiskFP,
            hardwareConcurrency: 64,
            deviceMemory: 512,
        };

        expect(model.score(commonHW)).toBeGreaterThan(model.score(rareHW));
    });

    it('partial table with only platform still returns a valid score', () => {
        const model = new FrequencyTableAttractorModel({
            platforms: { Win32: 0.80 },
        });
        const score = model.score(highRiskFP);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
    });

    it('returns a value in [0, 100] for extreme inputs', () => {
        const zeroFP: FPDataSet = {};
        const model = new FrequencyTableAttractorModel({
            platforms: { Win32: 1.0 },
            resolutions: { '1920x1080': 1.0 },
            languages: { 'en-US': 1.0 },
            browserFamilies: { chrome: 1.0 },
            hardwareProfiles: [{ concurrency: 8, memory: 8, frequency: 1.0 }],
        });
        const s1 = model.score(highRiskFP);
        const s2 = model.score(zeroFP);
        expect(s1).toBeGreaterThanOrEqual(0);
        expect(s1).toBeLessThanOrEqual(100);
        expect(s2).toBeGreaterThanOrEqual(0);
        expect(s2).toBeLessThanOrEqual(100);
    });
});

// ─── createFrequencyTableAttractorModel (factory shortcut) ───────────────────

describe('createFrequencyTableAttractorModel', () => {
    it('returns a FrequencyTableAttractorModel instance', () => {
        const model = createFrequencyTableAttractorModel({});
        expect(model).toBeInstanceOf(FrequencyTableAttractorModel);
    });

    it('produces identical scores to constructing directly', () => {
        const table = {
            platforms: { Win32: 0.85 },
            resolutions: { '1920x1080': 0.55 },
        };
        const factory = createFrequencyTableAttractorModel(table);
        const direct = new FrequencyTableAttractorModel(table);

        for (const fp of [highRiskFP, lowRiskFP]) {
            expect(factory.score(fp)).toBe(direct.score(fp));
        }
    });
});

// ─── Integration: calculateScoreBreakdown uses custom model ──────────────────

describe('calculateScoreBreakdown with custom attractorModel', () => {
    it('custom model overrides the built-in attractorRisk dimension', () => {
        const alwaysZero: { score: (fp: FPDataSet) => number } = { score: () => 0 };
        const alwaysHundred: { score: (fp: FPDataSet) => number } = { score: () => 100 };

        const breakdownLow  = calculateScoreBreakdown(fpIdentical, fpIdentical, { attractorModel: alwaysZero });
        const breakdownHigh = calculateScoreBreakdown(fpIdentical, fpIdentical, { attractorModel: alwaysHundred });

        // attractorRisk = 100 should lower the final score vs. attractorRisk = 0
        expect(breakdownLow.attractorRisk).toBe(0);
        expect(breakdownHigh.attractorRisk).toBe(100);
        expect(breakdownLow.composite).toBeGreaterThanOrEqual(breakdownHigh.composite);
    });

    it('createConfidenceCalculator forwards attractorModel to each calculation', () => {
        const alwaysZero: { score: (fp: FPDataSet) => number } = { score: () => 0 };
        const calculator = createConfidenceCalculator({ attractorModel: alwaysZero });
        const score = calculator.calculateConfidence(fpIdentical, fpIdentical);

        // With all risk removed the score should be at the high end
        expect(score).toBeGreaterThanOrEqual(70);
    });
});
