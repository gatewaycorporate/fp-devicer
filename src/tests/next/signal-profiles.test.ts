import { describe, expect, it } from 'vitest';
import { assertSignalProfile, FINGERPRINT_500_DPI, SIGNATURE_224, validateSignal, type SignalProfile } from '../../next/signal-profiles.js';
import { createPhysicalFingerprintAdapter, ModelInputError } from '../../next/model-adapters.js';
import { assessCalibrationReuse, calibrateComparison, compareFingerprints, createCalibrationArtifact, createFaceAdapter, createFingerprint } from '../../next/index.js';

const model = {
  id: 'fixture', name: 'fixture', version: '1', sourceRepository: 'https://example.test/fixture',
  upstreamRevision: 'fixture', checkpointDigest: 'sha256:fixture', license: 'test', runtime: 'injected',
  preprocessing: 'fixture.v1', supportedHardware: ['cpu'], inputSchema: 'gray8', outputSchema: 'vector',
};

function raster(width = 256, height = 360) {
  const image = new Uint8Array(width * height).fill(255);
  image.fill(32, width * 10, width * 20);
  return { image, width, height, dpi: 500 };
}

describe('versioned signal profiles', () => {
  it('snapshots comparison dimensions and rejects uniform RGB rasters', async () => {
    const options = {
      model, inputProfile: { kind: 'features', id: 'fixture.features.v1' } as SignalProfile,
      featureDimension: 2, extractorVersions: { fixture: '1' }, infer: (input: { embedding: number[] }) => input,
    };
    const adapter = createFaceAdapter(options);
    options.featureDimension = 8;
    const observation = await createFingerprint(adapter, { embedding: [1, 0] });
    expect((await compareFingerprints(adapter, observation, observation)).similarity).toBe(1);
    const image = new Uint8Array(16 * 16 * 3);
    for (let index = 0; index < image.length; index += 3) image[index] = 255;
    expect(validateSignal({ image, width: 16, height: 16 }, {
      id: 'face.rgb8.v1', kind: 'raster', channels: 3, width: 16, height: 16, rejectBlank: true,
    })).toBe('blank_image');
  });

  it('checks dimensions and finite values for model-backed vector evidence', async () => {
    const adapter = createFaceAdapter({
      model, inputProfile: { kind: 'features', id: 'fixture.features.v1' }, featureDimension: 2,
      extractorVersions: { fixture: '1' }, infer: (input: { embedding?: number[] }) => input,
    });
    for (const embedding of [undefined, [], [1], [0, 0], [NaN, 1], [Infinity, 1], new Array<number>(2)]) {
      const observation = await createFingerprint(adapter, { embedding });
      const evidence = adapter.compare(observation, observation, adapter.relationships[0]);
      expect(evidence[0]).toMatchObject({ available: false, explanation: 'invalid_vector' });
      expect((await compareFingerprints(adapter, observation, observation)).similarity).toBeNull();
    }
    for (const magnitude of [Number.MAX_VALUE, Number.MIN_VALUE, 1]) {
      const left = await createFingerprint(adapter, { embedding: [magnitude, magnitude] });
      const right = await createFingerprint(adapter, { embedding: [-magnitude, -magnitude] });
      expect((await compareFingerprints(adapter, left, left)).similarity).toBeCloseTo(1);
      expect((await compareFingerprints(adapter, left, right)).similarity).toBeCloseTo(0);
    }
  });

  it('binds profiles and complete pipeline manifests to observation and calibration compatibility', async () => {
    const makeAdapter = (profileId: string, checkpointDigest = model.checkpointDigest) => createFaceAdapter({
      model: { ...model, checkpointDigest }, inputProfile: { kind: 'features', id: profileId }, featureDimension: 2,
      extractorVersions: { fixture: '1' }, infer: (input: { embedding: number[] }) => input,
    });
    const original = makeAdapter('fixture.features.v1');
    const left = await createFingerprint(original, { embedding: [1, 0] }, { id: 'left' });
    const comparison = await compareFingerprints(original, left, left);
    const artifact = createCalibrationArtifact([
      { pairId: 'pair', comparison, label: { pairId: 'pair', label: 1, source: 'synthetic' } },
    ], { artifactId: 'fixture', manifest: {
      id: 'fixture', population: 'synthetic', task: 'same-subject', observationIds: ['left'],
      labelSources: ['synthetic'], split: 'calibration', collectedFrom: '2026-01-01', collectedTo: '2026-01-02',
    } });
    for (const changed of [makeAdapter('fixture.features.v2'), makeAdapter('fixture.features.v1', 'sha256:other')]) {
      const right = await createFingerprint(changed, { embedding: [1, 0] });
      expect((await compareFingerprints(changed, left, right)).status).toBe('unsupported_configuration');
      const next = await compareFingerprints(changed, right, right);
      expect(next.configuration.digest).not.toBe(comparison.configuration.digest);
      expect(calibrateComparison(next, artifact).status).toBe('unsupported_configuration');
      expect(assessCalibrationReuse(artifact, {
        fromDigest: comparison.configuration.digest, toDigest: next.configuration.digest,
        change: 'extractor', reason: 'profile changed',
      }).reusable).toBe(false);
    }
    expect((await compareFingerprints(original, left, { ...left, provenance: undefined })).status).toBe('unsupported_configuration');
    const roundTrip = JSON.parse(JSON.stringify(left));
    expect((await compareFingerprints(original, left, roundTrip)).status).toBe('uncalibrated');
    roundTrip.provenance.modelManifest = JSON.stringify(Object.fromEntries(Object.entries(model).reverse()));
    expect((await compareFingerprints(original, left, roundTrip)).status).toBe('uncalibrated');
    roundTrip.provenance.modelManifest = 'invalid-json';
    expect((await compareFingerprints(original, left, roundTrip)).status).toBe('unsupported_configuration');
  });

  it('validates before inference and prevents conflicting acquisition metadata', async () => {
    let calls = 0;
    const adapter = createPhysicalFingerprintAdapter({
      model, featureDimension: 2, extractorVersions: { fixture: '1' },
      infer: (_input: ReturnType<typeof raster>) => { calls += 1; return { template: [1, 0] }; },
    });
    await expect(adapter.createObservation({ ...raster(), dpi: 300 })).rejects.toBeInstanceOf(ModelInputError);
    await expect(adapter.createObservation(raster(), { acquisition: { dpi: 300 } })).rejects.toBeInstanceOf(ModelInputError);
    expect(calls).toBe(0);
    const observation = await adapter.createObservation(raster());
    expect(calls).toBe(1);
    expect(observation.acquisition).toMatchObject({ dpi: 500, width: 256, height: 360, channels: 1 });
    expect(observation.provenance?.signalProfile).toBe(FINGERPRINT_500_DPI.id);
  });
  it('validates acquisition density, dimensions and buffer size before inference', () => {
    const capture = raster();
    expect(validateSignal(capture, FINGERPRINT_500_DPI)).toBeUndefined();
    for (const dpi of [undefined, 300, 400, 1000, Number.NaN]) {
      expect(validateSignal({ ...capture, dpi }, FINGERPRINT_500_DPI)).toBe('unsupported_acquisition_dpi');
    }
    expect(validateSignal({ ...capture, width: 0 }, FINGERPRINT_500_DPI)).toBe('invalid_image_dimensions');
    expect(validateSignal({ ...capture, image: new Uint8Array(3) }, FINGERPRINT_500_DPI)).toBe('invalid_image_buffer');
    expect(validateSignal({ ...capture, width: 8192, height: 8192 }, FINGERPRINT_500_DPI)).toBe('image_resource_limit');
  });

  it('requires a canonical signature shape and normalization provenance', () => {
    const signature = { ...raster(224, 224), sourceWidth: 640, sourceHeight: 240, preprocessing: SIGNATURE_224.id };
    expect(validateSignal(signature, SIGNATURE_224)).toBeUndefined();
    expect(validateSignal(raster(), SIGNATURE_224)).toBe('incompatible_image_dimensions');
    expect(validateSignal({ ...signature, preprocessing: undefined }, SIGNATURE_224)).toBe('normalization_provenance_required');
    for (const value of [0, 128, 255]) {
      expect(validateSignal({ ...signature, image: new Uint8Array(224 * 224).fill(value) }, SIGNATURE_224)).toBe('blank_image');
    }
  });

  it('requires versioned alternatives without assigning a universal size', () => {
    expect(() => assertSignalProfile({ id: 'unversioned', kind: 'features' })).toThrow('versioned');
    const alternative = { ...FINGERPRINT_500_DPI, id: 'fingerprint.gray8.1000dpi.v1', dpi: 1000 };
    assertSignalProfile(alternative);
    expect(validateSignal({ ...raster(), dpi: 1000 }, alternative)).toBeUndefined();
    assertSignalProfile({ id: 'external.embedding.v1', kind: 'features' });
  });
});