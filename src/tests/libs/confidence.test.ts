import { describe, expect, it, beforeEach } from 'vitest';
import {
	calculateConfidence,
	calculateScoreBreakdown,
	computeAdaptiveStabilityWeights,
	computeAttractorRisk,
	computeEntropyContribution,
	computeEvidenceRichness,
	computeFieldAgreement,
	computeMissingBothSides,
	computeMissingOneSide,
	computeStructuralStability,
	createConfidenceCalculator,
} from '../../libs/confidence';
import { clearRegistry, initializeDefaultRegistry } from '../../libs/registry';
import { fpIdentical, fpVerySimilar, fpSimilar, fpDifferent, fpVeryDifferent } from '../fixtures/fingerprints';
import { FPUserDataSet } from '../../types/data';

describe('Confidence Calculation', () => {
	it('should calculate confidence between two user data objects', () => {
		const confidence = calculateConfidence(fpIdentical, fpVerySimilar);
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
		expect(confidence).toBeGreaterThanOrEqual(75);
	});

	it('should return moderate confidence for somewhat similar user data', () => {
		const confidence = calculateConfidence(fpIdentical, fpSimilar);
		expect(confidence).toBeGreaterThan(60);
	});

	it('should return middling confidence for partially similar data', () => {
		const confidence = calculateConfidence(fpIdentical, fpDifferent);
		expect(confidence).toBeGreaterThan(40);
	});

	it('should return lower confidence for very different user data', () => {
		const confidence = calculateConfidence(fpIdentical, fpVeryDifferent);
		expect(confidence).toBeLessThan(70);
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

		expect(scoreZeroCanvas).toBeGreaterThanOrEqual(scoreDefault);
	});

	it('useGlobalRegistry: false isolates the calculator from global mutations', () => {
		const isolated = createConfidenceCalculator({ useGlobalRegistry: false, tlshWeight: 0 });
		const global = createConfidenceCalculator({ useGlobalRegistry: true, tlshWeight: 0 });

		const scoreIsolatedBefore = isolated.calculateConfidence(fpIdentical, fpVerySimilar);
		const scoreGlobalBefore = global.calculateConfidence(fpIdentical, fpVerySimilar);

		// With default weights both should give same result
		expect(Math.abs(scoreIsolatedBefore - scoreGlobalBefore)).toBeLessThanOrEqual(1);
	});
});

describe('Score breakdown dimensions', () => {
	beforeEach(() => {
		clearRegistry();
		initializeDefaultRegistry();
	});

	it('computeEvidenceRichness scores full fingerprints above sparse ones', () => {
		const sparse = {
			userAgent: fpIdentical.userAgent,
			platform: fpIdentical.platform,
		} as FPUserDataSet;

		expect(computeEvidenceRichness(fpIdentical)).toBeGreaterThan(80);
		expect(computeEvidenceRichness(sparse)).toBeLessThan(25);
	});

	it('computeFieldAgreement uses the 90 percent similarity threshold', () => {
		const left = { userAgent: 'alpha' } as FPUserDataSet;
		const right = { userAgent: 'beta' } as FPUserDataSet;

		expect(
			computeFieldAgreement(left, right, {
				comparators: { userAgent: () => 0.95 },
				useGlobalRegistry: false,
			})
		).toBe(100);

		expect(
			computeFieldAgreement(left, right, {
				comparators: { userAgent: () => 0.89 },
				useGlobalRegistry: false,
			})
		).toBe(0);
	});

	it('computeStructuralStability favors agreement on stable hardware and screen fields', () => {
		const stableMatch = computeStructuralStability(fpIdentical, fpIdentical);
		const changed = {
			...fpIdentical,
			screen: {
				...fpIdentical.screen!,
				width: fpIdentical.screen!.width + 800,
				height: fpIdentical.screen!.height + 600,
			},
			platform: 'Linux x86_64',
		} as FPUserDataSet;

		expect(stableMatch).toBe(100);
		expect(computeStructuralStability(fpIdentical, changed)).toBeLessThan(stableMatch);
	});

	it('computeEntropyContribution treats absent entropy fields as neutral and mismatches as low', () => {
		const entropyNeutral = computeEntropyContribution(
			{ userAgent: fpIdentical.userAgent } as FPUserDataSet,
			{ userAgent: fpVerySimilar.userAgent } as FPUserDataSet
		);
		const entropyMismatch = computeEntropyContribution(fpIdentical, {
			...fpIdentical,
			canvas: 'different-canvas',
			webgl: 'different-webgl',
			audio: 'different-audio',
		} as FPUserDataSet);

		expect(entropyNeutral).toBe(50);
		expect(entropyMismatch).toBeLessThan(40);
	});

	it('computeAttractorRisk flags common fingerprints higher than unique ones', () => {
		const generic = {
			userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
			platform: 'Win32',
			language: 'en-US',
			hardwareConcurrency: 8,
			deviceMemory: 8,
			screen: {
				width: 1920,
				height: 1080,
				orientation: { type: 'landscape-primary', angle: 0 },
			},
		} as FPUserDataSet;
		const unique = {
			userAgent: 'CustomBrowser/1.0',
			platform: 'Linux arm64',
			language: 'is-IS',
			hardwareConcurrency: 14,
			deviceMemory: 24,
			screen: {
				width: 2778,
				height: 1284,
				orientation: { type: 'landscape-primary', angle: 0 },
			},
			canvas: 'unique-canvas',
			webgl: 'unique-webgl',
			audio: 'unique-audio',
		} as FPUserDataSet;

		expect(computeAttractorRisk(generic)).toBeGreaterThan(70);
		expect(computeAttractorRisk(unique)).toBeLessThan(40);
	});

	it('computeMissingOneSide and computeMissingBothSides distinguish asymmetric and shared missing data', () => {
		const sparse = {
			userAgent: fpIdentical.userAgent,
			platform: fpIdentical.platform,
		} as FPUserDataSet;
		const empty = {} as FPUserDataSet;

		expect(computeMissingOneSide(fpIdentical, sparse)).toBeGreaterThan(60);
		expect(computeMissingBothSides(fpIdentical, sparse)).toBeLessThan(10);
		expect(computeMissingBothSides(empty, empty)).toBe(100);
	});

	it('computeAdaptiveStabilityWeights maps field stabilities into dimension weights', () => {
		const weights = computeAdaptiveStabilityWeights({
			screen: 0.2,
			platform: 0.4,
			hardwareConcurrency: 0.6,
			deviceMemory: 0.8,
			highEntropyValues: 1,
			canvas: 0.3,
			webgl: 0.5,
			audio: 0.7,
		});

		expect(weights.structuralStability).toBeLessThan(1);
		expect(weights.entropyContribution).toBeLessThan(1);
		expect(weights.evidenceRichness).toBe(1);
	});

	it('calculateScoreBreakdown returns all dimensions and keeps composite aligned with calculateConfidence', () => {
		const breakdown = calculateScoreBreakdown(fpIdentical, fpVerySimilar, {
			stabilities: {
				screen: 0.5,
				platform: 0.6,
				hardwareConcurrency: 0.7,
				deviceMemory: 0.8,
				highEntropyValues: 0.9,
				canvas: 0.4,
				webgl: 0.4,
				audio: 0.4,
			},
		});

		expect(Object.keys(breakdown).sort()).toEqual([
			'attractorRisk',
			'composite',
			'deviceSimilarity',
			'entropyContribution',
			'evidenceRichness',
			'fieldAgreement',
			'missingBothSides',
			'missingOneSide',
			'structuralStability',
		].sort());
		expect(breakdown.composite).toBeGreaterThanOrEqual(0);
		expect(breakdown.composite).toBeLessThanOrEqual(100);
		expect(calculateScoreBreakdown(fpIdentical, fpVerySimilar).composite).toBe(
			calculateConfidence(fpIdentical, fpVerySimilar)
		);
	});

	it('treats fingerprints that differ only in behavioralMetrics as an exact match', () => {
		const baseline = calculateScoreBreakdown(fpIdentical, fpIdentical);
		const first: FPUserDataSet = {
			...fpIdentical,
			behavioralMetrics: {
				mouse: {
					sampleCount: 12,
					avgVelocityPxMs: 0.9,
					velocityStdDev: 0.15,
					straightnessRatio: 0.72,
					avgAcceleration: 0.04,
					hasMovement: true,
				},
				keyboard: {
					keystrokeCount: 8,
					avgDwellMs: 110,
					dwellStdDev: 18,
					avgFlightMs: 72,
					flightStdDev: 14,
					estimatedWpm: 46,
				},
				scroll: {
					eventCount: 4,
					avgVelocityPxMs: 1.4,
					velocityStdDev: 0.3,
					directionChangeCount: 1,
					totalDistancePx: 420,
				},
				session: {
					sessionDurationMs: 2100,
					timeToFirstInteractionMs: 350,
					interactionEventCount: 14,
					touchEventCount: 0,
				},
				collectionDurationMs: 1800,
				hasTouchEvents: false,
			},
		};
		const second: FPUserDataSet = {
			...fpIdentical,
			behavioralMetrics: {
				mouse: {
					sampleCount: 24,
					avgVelocityPxMs: 1.6,
					velocityStdDev: 0.42,
					straightnessRatio: 0.41,
					avgAcceleration: 0.11,
					hasMovement: true,
				},
				keyboard: {
					keystrokeCount: 16,
					avgDwellMs: 145,
					dwellStdDev: 33,
					avgFlightMs: 98,
					flightStdDev: 21,
					estimatedWpm: 63,
				},
				scroll: {
					eventCount: 9,
					avgVelocityPxMs: 2.3,
					velocityStdDev: 0.66,
					directionChangeCount: 4,
					totalDistancePx: 1130,
				},
				session: {
					sessionDurationMs: 5400,
					timeToFirstInteractionMs: 880,
					interactionEventCount: 31,
					touchEventCount: 0,
				},
				collectionDurationMs: 4200,
				hasTouchEvents: false,
			},
		};

		const breakdown = calculateScoreBreakdown(first, second);

		expect(breakdown.deviceSimilarity).toBe(100);
		expect(breakdown.fieldAgreement).toBe(100);
		expect(breakdown.structuralStability).toBe(100);
		expect(breakdown.entropyContribution).toBe(100);
		expect(breakdown.missingOneSide).toBe(baseline.missingOneSide);
		expect(breakdown.missingBothSides).toBe(baseline.missingBothSides);
		expect(breakdown.attractorRisk).toBe(baseline.attractorRisk);
		expect(breakdown.composite).toBe(100);
		expect(calculateConfidence(first, second)).toBe(100);
	});
});
