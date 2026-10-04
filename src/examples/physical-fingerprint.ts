import {
	createFingerprint,
	createPhysicalFingerprintAdapter,
	compareFingerprints,
	ModelInputError,
	type ModelArtifactManifest,
	type RasterSignal,
} from '../next/index.js';

const model: ModelArtifactManifest = {
	id: 'synthetic-row-bands-v1',
	name: 'SyntheticRowBandBaseline',
	version: '1.0.0',
	sourceRepository: 'https://example.test/synthetic-fixture',
	upstreamRevision: 'synthetic-fixture-v1',
	checkpointDigest: 'fixture:no-checkpoint',
	license: 'synthetic-fixture',
	runtime: 'model-free-example',
	preprocessing: 'gray8-row-bands.v1',
	supportedHardware: ['cpu'],
	inputSchema: 'fingerprint-image.gray8',
	outputSchema: 'synthetic-row-means.f32',
};

const fingerprintAdapter = createPhysicalFingerprintAdapter<RasterSignal, { template: number[] }>({
	model,
	featureDimension: 16,
	extractorVersions: { extractor: 'synthetic-row-bands.v1' },
	infer(capture) {
		const template = Array.from({ length: 16 }, (_, band) => {
			const first = Math.floor(band * capture.height / 16) * capture.width;
			const last = Math.floor((band + 1) * capture.height / 16) * capture.width;
			let ink = 0;
			for (let index = first; index < last; index += 1) ink += 1 - capture.image[index] / 255;
			return ink / (last - first);
		});
		return { template };
	},
});

function syntheticCapture(offset: number): RasterSignal {
	const width = 256;
	const height = 360;
	const image = new Uint8Array(width * height).fill(255);
	for (let row = 40; row < 320; row += 1) {
		for (let column = 40; column < 216; column += 1) {
			image[row * width + column] = (row + column + offset) % 12 < 4 ? 32 : 224;
		}
	}
	return { image, width, height, dpi: 500 };
}

const reference = await createFingerprint(fingerprintAdapter, syntheticCapture(0), { id: 'synthetic-reference' });
const probe = await createFingerprint(fingerprintAdapter, syntheticCapture(1), { id: 'synthetic-probe' });
const comparison = await compareFingerprints(fingerprintAdapter, reference, probe);

console.log({
	comparison: 'Synthetic image baseline, not biometric verification',
	similarity: comparison.similarity,
	status: comparison.status,
	acquisition: reference.acquisition,
});

try {
	await createFingerprint(fingerprintAdapter, { ...syntheticCapture(0), dpi: 300 });
} catch (error) {
	if (!(error instanceof ModelInputError)) throw error;
	console.log({ rejectedCapture: error.code, reason: error.message });
}