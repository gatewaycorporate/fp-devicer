import {
	createFingerprint,
	createPhysicalFingerprintAdapter,
	matchFingerprint,
	type ModelArtifactManifest,
} from '../next/index.js';

type FingerprintCapture = {
	image: Uint8Array;
	width: number;
	height: number;
	dpi: 500;
	template?: readonly number[];
};

const model: ModelArtifactManifest = {
	id: 'physical-fingerprint-extractor-v1',
	name: 'ExamplePhysicalFingerprintExtractor',
	version: '1.0.0',
	sourceRepository: 'https://example.test/physical-fingerprint-extractor',
	upstreamRevision: 'example-revision',
	checkpointDigest: 'sha256:replace-with-your-model-digest',
	license: 'replace-with-your-model-license',
	runtime: 'application-injected',
	preprocessing: 'fingerprint-gray-normalize.v1',
	supportedHardware: ['cpu'],
	inputSchema: 'fingerprint-image.gray8',
	outputSchema: 'fingerprint-template.f32',
};

const fingerprintAdapter = createPhysicalFingerprintAdapter<FingerprintCapture, { template?: readonly number[] }>({
	model,
	extractorVersions: { extractor: 'physical-fingerprint-extractor.v1' },

	// Replace this with the call to the approved fingerprint extraction runtime.
	infer(capture) {
		if (capture.dpi !== 500) throw new Error('Physical fingerprint images must be captured at 500 DPI');
		return { template: capture.template };
	},

	qualityGate(features) {
		return features.template && features.template.length >= 4
			? undefined
			: 'fingerprint template quality is below the minimum threshold';
	},
});

const enrolledAlice = await createFingerprint(
	fingerprintAdapter,
	{ image: new Uint8Array([12, 24, 36]), width: 3, height: 1, dpi: 500, template: [0.91, 0.12, 0.34, 0.56] },
	{ id: 'enrolled-alice', observedAt: new Date('2026-01-01T09:00:00Z'), acquisition: { dpi: 500, width: 3, height: 1 } },
);

const enrolledBob = await createFingerprint(
	fingerprintAdapter,
	{ image: new Uint8Array([48, 60, 72]), width: 3, height: 1, dpi: 500, template: [0.18, 0.83, 0.41, 0.27] },
	{ id: 'enrolled-bob', observedAt: new Date('2026-01-01T09:05:00Z'), acquisition: { dpi: 500, width: 3, height: 1 } },
);

const probe = await createFingerprint(
	fingerprintAdapter,
	{ image: new Uint8Array([15, 27, 39]), width: 3, height: 1, dpi: 500, template: [0.89, 0.15, 0.31, 0.58] },
	{ id: 'probe-2026-01-02', acquisition: { dpi: 500, width: 3, height: 1 } },
);

const match = await matchFingerprint(fingerprintAdapter, probe, [enrolledAlice, enrolledBob], {
	relation: 'same-enrolled-identity',
	minimumSimilarity: 0.9,
	calibrationStatus: 'supported',
});

console.log({
	decision: match.decision,
	candidateObservationId: match.candidateObservationId,
	similarity: match.similarity,
	calibrationStatus: match.calibrationStatus,
	reasonCodes: match.reasonCodes,
});

const lowQualityProbe = await createFingerprint(
	fingerprintAdapter,
	{ image: new Uint8Array([15, 27]), width: 2, height: 1, dpi: 500, template: [0.89, 0.15] },
	{ id: 'probe-low-quality', acquisition: { dpi: 500, width: 2, height: 1 } },
);

const abstained = await matchFingerprint(fingerprintAdapter, lowQualityProbe, [enrolledAlice], {
	relation: 'same-enrolled-identity',
	minimumSimilarity: 0.9,
});

console.log({
	lowQualityDecision: abstained.decision,
	lowQualityReasonCodes: abstained.reasonCodes,
});