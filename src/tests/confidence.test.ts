import { describe, expect, it } from 'vitest';
import { calculateConfidence } from '../libs/confidence';
import { fpIdentical, fpVerySimilar, fpDifferent, fpVeryDifferent } from './fixtures/fingerprints';
import { FPUserDataSet } from '../types/data';

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

	it('should return high confidence for similar user data', () => {
		const confidence = calculateConfidence(fpIdentical, fpVerySimilar);
		console.log('Confidence for similar data:', confidence);
		expect(confidence).toBeGreaterThan(80);
	});

	it('should return lower confidence for very different user data', () => {
		const confidence = calculateConfidence(fpIdentical, fpVeryDifferent);
		console.log('Confidence for different data:', confidence);
		expect(confidence).toBeLessThan(30);
	});

	it('should return middling confidence for partially similar data', () => {
		const confidence = calculateConfidence(fpIdentical, fpDifferent);
		console.log('Confidence for partially similar data:', confidence);
		expect(confidence).toBeGreaterThan(10);
		expect(confidence).toBeLessThan(90);
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
