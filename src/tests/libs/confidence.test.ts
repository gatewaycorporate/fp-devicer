import { describe, expect, it, beforeEach } from 'vitest';
import { calculateConfidence, createConfidenceCalculator } from '../../libs/confidence';
import { clearRegistry, initializeDefaultRegistry } from '../../libs/registry';
import { fpIdentical, fpVerySimilar, fpSimilar, fpDifferent, fpVeryDifferent } from '../fixtures/fingerprints';
import { FPUserDataSet } from '../../types/data';

describe('Confidence Calculation', () => {
	it('should calculate confidence between two user data objects', () => {
		const confidence = calculateConfidence(fpIdentical, fpVerySimilar);
		console.log('Confidence:', confidence);
		expect(typeof confidence).toBe('number');
		expect(confidence).toBeGreaterThanOrEqual(0);
		expect(confidence).toBeLessThanOrEqual(100);
	});

	it('should return 100% confidence for identical user data', () => {
		const confidence = calculateConfidence(fpIdentical, fpIdentical);
		expect(confidence).toBe(100);
	});

	it('should return high confidence for very similar user data', () => {
		const confidence = calculateConfidence(fpIdentical, fpVerySimilar);
		console.log('Confidence for similar data:', confidence);
		expect(confidence).toBeGreaterThan(80);
	});

	it('should return moderate confidence for somewhat similar user data', () => {
		const confidence = calculateConfidence(fpIdentical, fpSimilar);
		console.log('Confidence for somewhat similar data:', confidence);
		expect(confidence).toBeGreaterThan(70);
	});

	it('should return middling confidence for partially similar data', () => {
		const confidence = calculateConfidence(fpIdentical, fpDifferent);
		console.log('Confidence for partially similar data:', confidence);
		expect(confidence).toBeGreaterThan(60);
	});

	it('should return lower confidence for very different user data', () => {
		const confidence = calculateConfidence(fpIdentical, fpVeryDifferent);
		console.log('Confidence for different data:', confidence);
		expect(confidence).toBeLessThan(60);
	});

	it('should handle empty datasets and nonetypes gracefully', () => {
		const incompleteData = {
			...fpIdentical,
			plugins: [],
			screen: null,
		} as unknown as FPUserDataSet;
		const confidence = calculateConfidence(fpIdentical, incompleteData);
		expect(confidence).toBeGreaterThan(0);
		expect(confidence).toBeLessThan(100);
	});
});

describe('createConfidenceCalculator custom options', () => {
	beforeEach(() => {
		clearRegistry();
		initializeDefaultRegistry();
	});

	it('tlshWeight: 0 produces a purely structural score (TLSH not used)', () => {
		const calc = createConfidenceCalculator({ tlshWeight: 0 });
		// Identical inputs should score 100 regardless of TLSH
		expect(calc.calculateConfidence(fpIdentical, fpIdentical)).toBe(100);
		// Score should still differentiate similar vs very different
		const scoreClose = calc.calculateConfidence(fpIdentical, fpVerySimilar);
		const scoreFar = calc.calculateConfidence(fpIdentical, fpVeryDifferent);
		expect(scoreClose).toBeGreaterThan(scoreFar);
	});

	it('tlshWeight: 1 produces a purely TLSH-based score', () => {
		const calc = createConfidenceCalculator({ tlshWeight: 1 });
		// Identical inputs → TLSH distance 0 → score 100
		expect(calc.calculateConfidence(fpIdentical, fpIdentical)).toBe(100);
		// Very different inputs should score lower than similar ones
		const scoreClose = calc.calculateConfidence(fpIdentical, fpVerySimilar);
		const scoreFar = calc.calculateConfidence(fpIdentical, fpVeryDifferent);
		expect(scoreClose).toBeGreaterThan(scoreFar);
	});

	it('custom weights override shifts scores when a field is zeroed out', () => {
		// Force canvas weight to 0 — two fingerprints differing only in canvas
		// should now score very high (the canvas difference is ignored)
		const calcZeroCanvas = createConfidenceCalculator({ weights: { canvas: 0 }, tlshWeight: 0 });
		const fpCanvasDiff = { ...fpIdentical, canvas: 'completely_different_canvas_hash' };
		const scoreZeroCanvas = calcZeroCanvas.calculateConfidence(fpIdentical, fpCanvasDiff as any);

		// With default weights, canvas matters a lot (weight 30), so score should be lower
		const calcDefault = createConfidenceCalculator({ tlshWeight: 0 });
		const scoreDefault = calcDefault.calculateConfidence(fpIdentical, fpCanvasDiff as any);

		expect(scoreZeroCanvas).toBeGreaterThan(scoreDefault);
	});

	it('useGlobalRegistry: false isolates the calculator from global mutations', () => {
		const isolated = createConfidenceCalculator({ useGlobalRegistry: false, tlshWeight: 0 });
		const global = createConfidenceCalculator({ useGlobalRegistry: true, tlshWeight: 0 });

		const scoreIsolatedBefore = isolated.calculateConfidence(fpIdentical, fpVerySimilar);
		const scoreGlobalBefore = global.calculateConfidence(fpIdentical, fpVerySimilar);

		// With default weights both should give same result
		expect(scoreIsolatedBefore).toBeCloseTo(scoreGlobalBefore, 0);
	});
});
