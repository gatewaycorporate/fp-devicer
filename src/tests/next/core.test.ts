import { describe, expect, it } from 'vitest';
import {
  allocateCalibrationLabels,
  CalibrationArtifactRegistry,
  assessCalibrationReuse,
  calibrateComparison,
  compareFingerprints,
  createCalibrationArtifact,
  createBrowserAdapter,
  createDocumentAdapter,
  createEnrolledBiometricAdapter,
  createExactContentId,
  createFaceAdapter,
  createFingerprint,
  createHandwritingAdapter,
  createPhysicalFingerprintAdapter,
  createSignatureAdapter,
  createModelBackedAdapter,
  ModelInferenceError,
  ModelInferenceCancelledError,
  ModelInputError,
  assertDisjointEvaluationSplits,
  ExactRetrievalIndex,
  evaluateExactRecall,
  exhaustiveCandidates,
  evaluateCalibration,
  evaluateCalibrationByMask,
  InstanceRegistry,
  matchFingerprint,
  updateFingerprintHistory,
  validateDisjointEvaluationSplits,
  type FingerprintAdapter,
  type EvaluationManifest,
  type Observation,
} from '../../next/index.js';

type Note = { text: string };

const noteAdapter: FingerprintAdapter<Note, { text: string }> = {
  domain: 'note',
  schemaVersion: 'note.v1',
  extractorVersions: { text: '1' },
  relationships: [{ id: 'same-content', direction: 'undirected', description: 'same note content' }],
  configuration: {
    schemaVersion: 'note.v1', domain: 'note', extractors: { text: '1' },
    comparators: { text: 'exact.v1' }, fusion: 'mean.v1', normalization: 'unit', runtime: 'test',
  },
  createObservation(input, context) {
    return {
      id: context?.id ?? `note-${input.text}`,
      domain: 'note', schemaVersion: 'note.v1',
      observedAt: (context?.observedAt ?? new Date()).toISOString(),
      extractorVersions: { text: '1' }, features: { text: input.text },
    };
  },
  compare(left, right, relation) {
    return [{
      relation: relation.id, leftObservationId: left.id, rightObservationId: right.id,
      comparatorVersion: 'exact.v1', similarity: left.features.text === right.features.text ? 1 : 0,
      available: true, dependencyGroup: 'text',
    }];
  },
};

describe('NEXT core contracts', () => {
  it('creates versioned observations and deterministic configuration identities', async () => {
    const observation = await createFingerprint(noteAdapter, { text: 'alpha' }, {
      id: 'left', observedAt: new Date('2026-01-02T00:00:00Z'),
    });
    const result = await compareFingerprints(noteAdapter, observation, observation);
    expect(observation.schemaVersion).toBe('note.v1');
    expect(result.status).toBe('uncalibrated');
    expect(result.configuration.digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('supports an out-of-tree adapter without core changes', async () => {
    const left = await createFingerprint(noteAdapter, { text: 'alpha' }, { id: 'left' });
    const right = await createFingerprint(noteAdapter, { text: 'beta' }, { id: 'right' });
    const result = await matchFingerprint(noteAdapter, left, [right], {
      relation: 'same-content', minimumSimilarity: 0.9,
    });
    expect(result.decision).toBe('non_match');
    expect(result.reasonCodes).toEqual(['similarity_threshold_not_met']);
  });

  it('abstains when no candidate evidence is available', async () => {
    const observation: Observation<{ text: string }> = {
      id: 'left', domain: 'other', schemaVersion: 'other.v1', observedAt: new Date().toISOString(),
      extractorVersions: {}, features: { text: 'alpha' },
    };
    const result = await matchFingerprint(noteAdapter, observation, [], {
      relation: 'same-content', minimumSimilarity: 0.9,
    });
    expect(result.decision).toBe('insufficient_evidence');
    expect(result.calibrationStatus).toBe('insufficient_data');
  });

  it('keeps history ordered without minting an identity', async () => {
    const later = await createFingerprint(noteAdapter, { text: 'later' }, {
      id: 'later', observedAt: new Date('2026-01-03T00:00:00Z'),
    });
    const earlier = await createFingerprint(noteAdapter, { text: 'earlier' }, {
      id: 'earlier', observedAt: new Date('2026-01-01T00:00:00Z'),
    });
    expect(updateFingerprintHistory([later], earlier).map(item => item.id)).toEqual(['earlier', 'later']);
  });

  it('keeps adapter registration instance-scoped and exact IDs typed', async () => {
    const first = new InstanceRegistry();
    const second = new InstanceRegistry();
    const teardown = first.register(noteAdapter);
    expect(first.domains()).toEqual(['note']);
    expect(second.domains()).toEqual([]);
    expect(() => first.register(noteAdapter)).toThrow('already registered');
    teardown();
    expect(first.domains()).toEqual([]);
    const left = await createExactContentId('document', 'document.v1', { text: 'same' });
    const right = await createExactContentId('document', 'document.v1', { text: 'same' });
    expect(left).toBe(right);
    expect(left).toMatch(/^obs_[0-9a-f]{64}$/);
  });

  it('ships browser and document adapters without changing the core', async () => {
    const browser = createBrowserAdapter();
    const document = createDocumentAdapter();
    const browserLeft = await createFingerprint(browser, { platform: 'Linux', language: 'en-US' });
    const browserRight = await createFingerprint(browser, { platform: 'Linux', language: 'fr-FR' });
    const browserResult = await compareFingerprints(browser, browserLeft, browserRight);
    expect(browserResult.similarity).toBe(0.5);
    const documentLeft = await createFingerprint(document, { text: 'same' });
    const documentRight = await createFingerprint(document, { text: 'same' });
    expect((await compareFingerprints(document, documentLeft, documentRight)).similarity).toBe(1);
  });

  it('fits held-out calibration artifacts and abstains outside their scope', async () => {
    const left = await createFingerprint(noteAdapter, { text: 'alpha' }, { id: 'left' });
    const same = await createFingerprint(noteAdapter, { text: 'alpha' }, { id: 'same' });
    const different = await createFingerprint(noteAdapter, { text: 'beta' }, { id: 'different' });
    const positive = await compareFingerprints(noteAdapter, left, same);
    const negative = await compareFingerprints(noteAdapter, left, different);
    const artifact = createCalibrationArtifact([
      { pairId: 'p', comparison: positive, label: { pairId: 'p', label: 1, source: 'verified' } },
      { pairId: 'n', comparison: negative, label: { pairId: 'n', label: 0, source: 'verified' } },
    ], {
      artifactId: 'cal-1', alpha: 0.1,
      manifest: {
        id: 'manifest-1', population: 'notes', task: 'same-content',
        observationIds: ['left', 'same', 'different'], labelSources: ['verified'],
        split: 'calibration', collectedFrom: '2026-01-01', collectedTo: '2026-01-02',
      },
    });
    const calibrated = calibrateComparison(positive, artifact);
    expect(calibrated.status).toBe('supported');
    expect(calibrated.probability).not.toBeNull();
    expect(calibrated.predictionSet).toEqual([1]);
    expect(calibrateComparison(positive, { ...artifact, configurationDigest: 'wrong' }).status).toBe('unsupported_configuration');
    expect(calibrateComparison(positive, { ...artifact, expiresAt: '2020-01-01T00:00:00.000Z' }).status).toBe('stale');
    const evaluation = evaluateCalibration([
      { pairId: 'held-out-p', comparison: positive, label: { pairId: 'held-out-p', label: 1, source: 'external' } },
      { pairId: 'held-out-n', comparison: negative, label: { pairId: 'held-out-n', label: 0, source: 'external' } },
    ], artifact, {
      id: 'manifest-2', population: 'notes', task: 'same-content',
      observationIds: ['left', 'same', 'different'], labelSources: ['external'],
      split: 'held_out', collectedFrom: '2026-02-01', collectedTo: '2026-02-02',
    });
    expect(evaluation).toMatchObject({ total: 2, supported: 2, unsupported: 0, coverage: 1 });
    expect(evaluation.brierScore).not.toBeNull();
    expect(evaluateCalibrationByMask([
      { pairId: 'mask-p', comparison: positive, label: { pairId: 'mask-p', label: 1, source: 'external' } },
      { pairId: 'mask-n', comparison: negative, label: { pairId: 'mask-n', label: 0, source: 'external' } },
    ], artifact, {
      id: 'manifest-3', population: 'notes', task: 'same-content', observationIds: [],
      labelSources: ['external'], split: 'held_out', collectedFrom: '2026-02-01', collectedTo: '2026-02-02',
    })).toEqual([{ mask: 'text', evaluation }]);
    expect(() => evaluateCalibration([], artifact, {
      id: 'manifest-1', population: 'notes', task: 'same-content', observationIds: [],
      labelSources: ['verified'], split: 'calibration', collectedFrom: '2026-01-01', collectedTo: '2026-01-02',
    })).toThrow('held_out');
  });

  it('requires validation after configuration changes and separates audit sampling', async () => {
    const left = await createFingerprint(noteAdapter, { text: 'alpha' }, { id: 'left' });
    const same = await createFingerprint(noteAdapter, { text: 'alpha' }, { id: 'same' });
    const comparison = await compareFingerprints(noteAdapter, left, same);
    const artifact = createCalibrationArtifact([
      { pairId: 'p', comparison, label: { pairId: 'p', label: 1, source: 'verified' } },
    ], {
      artifactId: 'cal-transition', manifest: {
        id: 'manifest-transition', population: 'notes', task: 'same-content',
        observationIds: ['left', 'same'], labelSources: ['verified'], split: 'calibration',
        collectedFrom: '2026-01-01', collectedTo: '2026-01-02',
      },
    });
    const digest = comparison.configuration.digest;
    expect(assessCalibrationReuse(artifact, {
      fromDigest: digest, toDigest: digest, change: 'none', reason: 'same configuration',
    }).status).toBe('compatible');
    expect(assessCalibrationReuse(artifact, {
      fromDigest: digest, toDigest: 'changed', change: 'extractor', reason: 'extractor v2',
    }).reasonCodes).toContain('configuration_digest_changed');
    const allocation = allocateCalibrationLabels([
      { sample: { pairId: 'uncertain', comparison, label: { pairId: 'uncertain', label: 1, source: 'analyst' } }, prediction: { probability: 0.5, predictionSet: [0, 1], status: 'supported', reasonCodes: [] } },
      { sample: { pairId: 'audit', comparison, label: { pairId: 'audit', label: 1, source: 'analyst' } }, prediction: { probability: 1, predictionSet: [1], status: 'supported', reasonCodes: [] } },
    ], { uncertaintyLimit: 1, auditRate: 0.5, randomValues: [0.1] });
    expect(allocation.requests).toEqual([
      { pairId: 'uncertain', reason: 'uncertainty_review', inclusionProbability: 1, predictedSet: [0, 1] },
      { pairId: 'audit', reason: 'random_audit', inclusionProbability: 0.5, predictedSet: [1] },
    ]);
  });

  it('keeps handwriting and biometric relationships domain-specific', async () => {
    const handwriting = createHandwritingAdapter();
    const writerLeft = await createFingerprint(handwriting, { embedding: [1, 0], transcription: 'hello' }, { id: 'writer-left' });
    const writerRight = await createFingerprint(handwriting, { embedding: [0.9, 0.1], transcription: 'world' }, { id: 'writer-right' });
    expect((await compareFingerprints(handwriting, writerLeft, writerRight, 'same-writer')).similarity).toBeGreaterThan(0.9);
    expect((await compareFingerprints(handwriting, writerLeft, writerRight, 'same-transcription')).similarity).toBe(0);
    const missing = await createFingerprint(handwriting, { transcription: 'hello' }, { id: 'missing-embedding' });
    expect((await compareFingerprints(handwriting, missing, writerRight, 'same-writer')).status).toBe('insufficient_data');
    const biometric = createEnrolledBiometricAdapter('face-v1');
    const enrolled = await createFingerprint(biometric, { modality: 'face-v1', template: [1, 0] }, { id: 'enrolled' });
    const probe = await createFingerprint(biometric, { modality: 'face-v1', template: [0.8, 0.2] }, { id: 'probe' });
    expect((await compareFingerprints(biometric, enrolled, probe)).similarity).toBeGreaterThan(0.9);
    const wrongModality = await createFingerprint(biometric, { modality: 'voice-v1', template: [1, 0] }, { id: 'wrong-modality' });
    expect((await compareFingerprints(biometric, enrolled, wrongModality)).status).toBe('insufficient_data');
  });

  it('binds model provenance to configuration and runs injected inference', async () => {
    const adapter = createModelBackedAdapter({
      domain: 'face',
      schemaVersion: 'face.v1',
      model: {
        id: 'adaface-face-v1', name: 'AdaFace', version: '1', sourceRepository: 'https://example.test/adaface', upstreamRevision: 'fixture-revision',
        checkpointDigest: 'sha256:face-checkpoint', license: 'research-only',
        runtime: 'external-test-runtime', preprocessing: 'face-preprocess.v1', supportedHardware: ['cpu'],
        inputSchema: 'image.rgb', outputSchema: 'embedding.f32',
      },
      relationships: [{ id: 'same-enrolled-identity', direction: 'undirected', description: 'same enrolled identity' }],
      extractorVersions: { 'face-extractor': 'kr-rpe.v1' },
      infer(input: { embedding: readonly number[] }) {
        return { embedding: input.embedding };
      },
      compare(left, right, relation) {
        return [{
          relation: relation.id, leftObservationId: left.id, rightObservationId: right.id,
          comparatorVersion: 'adaface-cosine.v1', similarity: 1, available: true,
          dependencyGroup: 'face-embedding',
        }];
      },
    });
    const left = await createFingerprint(adapter, { embedding: [1, 0] }, { id: 'enrolled' });
    const right = await createFingerprint(adapter, { embedding: [1, 0] }, { id: 'probe' });
    const result = await compareFingerprints(adapter, left, right, 'same-enrolled-identity');
    expect(result.status).toBe('uncalibrated');
    expect(result.configuration.model?.name).toBe('AdaFace');
    expect(result.configuration.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(left.provenance).toMatchObject({ modelId: 'adaface-face-v1', checkpointDigest: 'sha256:face-checkpoint' });
  });

  it('rejects model adapters without checkpoint provenance', () => {
    expect(() => createModelBackedAdapter({
      domain: 'signature', schemaVersion: 'signature.v1',
      model: {
        id: 'detailsemnet-v1', name: 'DetailSemNet', version: '1', sourceRepository: 'https://example.test/detailsemnet', upstreamRevision: 'fixture-revision',
        checkpointDigest: '', license: 'research-only', runtime: 'external',
        preprocessing: 'signature-preprocess.v1', supportedHardware: ['cpu'], inputSchema: 'image.gray', outputSchema: 'embedding.f32',
      },
      relationships: [{ id: 'same-writer', direction: 'undirected', description: 'same writer' }],
      extractorVersions: { signature: 'detailsemnet.v1' },
      infer: () => ({ embedding: [1, 0] }),
      compare: () => [],
    })).toThrow('checkpoint digest');
  });

  it('keeps model-backed domain relationships and missingness explicit', async () => {
    const model = {
      id: 'fixture-model', name: 'fixture', version: '1', sourceRepository: 'https://example.test/fixture', upstreamRevision: 'fixture-revision', checkpointDigest: 'sha256:fixture',
      license: 'test', runtime: 'test-runtime', preprocessing: 'fixture-preprocess.v1', supportedHardware: ['cpu'],
      inputSchema: 'fixture.input', outputSchema: 'fixture.vector',
    };
    const face = createFaceAdapter({
      model, extractorVersions: { face: 'kr-rpe.v1', matcher: 'adaface.v1' },
      infer: (input: { vector?: number[] }) => ({ embedding: input.vector }),
    });
    const faceLeft = await createFingerprint(face, { vector: [1, 0] }, { id: 'face-left' });
    const faceRight = await createFingerprint(face, { vector: [0.9, 0.1] }, { id: 'face-right' });
    expect((await compareFingerprints(face, faceLeft, faceRight, 'same-subject')).similarity).toBeGreaterThan(0.9);

    const physical = createPhysicalFingerprintAdapter({
      model, extractorVersions: { fingerprint: 'jipnet.v1' },
      infer: (input: { template?: number[] }) => ({ template: input.template }),
      qualityGate: features => features.template && features.template.length < 2 ? 'template quality below minimum' : undefined,
    });
    const missing = await createFingerprint(physical, {}, { id: 'missing-template' });
    const enrolled = await createFingerprint(physical, { template: [1, 0] }, { id: 'enrolled-template' });
    expect((await compareFingerprints(physical, missing, enrolled)).status).toBe('insufficient_data');
    const lowQuality = await createFingerprint(physical, { template: [1] }, { id: 'low-quality-template' });
    const qualityResult = await compareFingerprints(physical, lowQuality, enrolled);
    expect(qualityResult.status).toBe('insufficient_data');
    expect(qualityResult.evidence[0].available).toBe(false);

    const signature = createSignatureAdapter({
      model, extractorVersions: { signature: 'detailsemnet.v1' },
      infer: (input: { embedding?: number[]; transcription?: string }) => input,
    });
    const signed = await createFingerprint(signature, { embedding: [1, 0], transcription: 'approved' }, { id: 'signed' });
    const probe = await createFingerprint(signature, { embedding: [0.9, 0.1], transcription: 'different' }, { id: 'probe' });
    expect((await compareFingerprints(signature, signed, probe, 'same-writer')).similarity).toBeGreaterThan(0.9);
    expect((await compareFingerprints(signature, signed, probe, 'same-transcription')).similarity).toBe(0);
  });

  it('rejects evaluation leakage across subject or writer groups', () => {
    const makeManifest = (id: string, split: 'calibration' | 'held_out', groups: Record<string, string>): EvaluationManifest => ({
      id, domain: 'face', task: 'same-subject', split,
      sourceDigest: 'sha256:source', labelDigest: 'sha256:labels',
      observationIds: Object.keys(groups), groups, preprocessing: 'face-preprocess.v1',
      modelConfigurationDigest: 'sha256:configuration',
    });
    const calibration = makeManifest('calibration', 'calibration', { a: 'subject-a', b: 'subject-b' });
    const heldOut = makeManifest('held-out', 'held_out', { c: 'subject-a', d: 'subject-d' });
    expect(validateDisjointEvaluationSplits(calibration, heldOut)).toMatchObject({
      valid: false, sharedGroups: ['subject-a'], reasons: ['group_overlap'],
    });
    expect(() => assertDisjointEvaluationSplits(calibration, heldOut)).toThrow('group_overlap');
  });

  it('returns structured model input and inference failures', async () => {
    const model = {
      id: 'fixture-model', name: 'fixture', version: '1', sourceRepository: 'https://example.test/fixture', upstreamRevision: 'fixture-revision', checkpointDigest: 'sha256:fixture',
      license: 'test', runtime: 'test-runtime', preprocessing: 'fixture-preprocess.v1', supportedHardware: ['cpu'],
      inputSchema: 'fixture.input', outputSchema: 'fixture.vector',
    };
    const adapter = createModelBackedAdapter({
      domain: 'validated', schemaVersion: 'validated.v1', model,
      relationships: [{ id: 'same', direction: 'undirected', description: 'same' }],
      extractorVersions: { input: '1' }, validateInput: (input: { accepted: boolean }) => input.accepted ? undefined : 'input rejected',
      infer: () => { throw new Error('runtime unavailable'); }, compare: () => [],
    });
    await expect(createFingerprint(adapter, { accepted: false })).rejects.toBeInstanceOf(ModelInputError);
    await expect(createFingerprint(adapter, { accepted: true })).rejects.toBeInstanceOf(ModelInferenceError);
  });

  it('supports runtime-only inference, cancellation, and teardown', async () => {
    const model = {
      id: 'runtime-model', name: 'runtime-fixture', version: '1', sourceRepository: 'https://example.test/runtime', upstreamRevision: 'fixture-revision',
      checkpointDigest: 'sha256:runtime', license: 'test', runtime: 'worker-fixture',
      preprocessing: 'fixture-preprocess.v1', supportedHardware: ['cpu'],
      inputSchema: 'fixture.input', outputSchema: 'fixture.vector',
    };
    let closeCount = 0;
    let receivedSignal: AbortSignal | undefined;
    const adapter = createModelBackedAdapter({
      domain: 'runtime', schemaVersion: 'runtime.v1', model,
      relationships: [{ id: 'same', direction: 'undirected', description: 'same' }],
      runtime: {
        infer: (_input: string, context) => {
          receivedSignal = context.signal;
          return { embedding: [1, 0] };
        },
        close: () => { closeCount += 1; },
      },
      compare: () => [],
    });
    const controller = new AbortController();
    const observation = await createFingerprint(adapter, 'valid', { signal: controller.signal });
    expect(receivedSignal).toBe(controller.signal);
    expect(observation.features.embedding).toEqual([1, 0]);
    await adapter.close?.();
    expect(closeCount).toBe(1);
    controller.abort();
    await expect(createFingerprint(adapter, 'cancelled', { signal: controller.signal })).rejects.toBeInstanceOf(ModelInferenceCancelledError);
  });

  it('keeps exact retrieval separate from identity and supports replayable rebuilds', async () => {
    const document = createDocumentAdapter();
    const first = await createFingerprint(document, { text: 'same' }, { id: 'first' });
    const duplicate = await createFingerprint(document, { text: 'same' }, { id: 'duplicate' });
    const other = await createFingerprint(document, { text: 'other' }, { id: 'other' });
    const index = new ExactRetrievalIndex('document', 'document.v1');
    expect((await index.rebuild([other, first, duplicate])).observationCount).toBe(3);
    expect((await index.findExact({ text: 'same' })).map(item => item.observation.id)).toEqual(['duplicate', 'first']);
    expect((await index.findExact({ text: 'same' }, 1)).map(item => item.observation.id)).toEqual(['duplicate']);
    expect(index.page(1, 1).map(item => item.observation.id)).toEqual(['first']);
    expect(() => index.page(-1, 1)).toThrow('offset');
    expect(() => index.page(0, -1)).toThrow('limit');
    expect(index.manifest().contentIds[0]).toMatch(/^obs_[0-9a-f]{64}$/);
    expect(index.remove('duplicate')).toBe(true);
    expect((await index.findExact({ text: 'same' })).map(item => item.observation.id)).toEqual(['first']);
    expect(exhaustiveCandidates([other, first]).map(item => item.id)).toEqual(['first', 'other']);
    const snapshot = index.snapshot();
    const restored = new ExactRetrievalIndex('document', 'document.v1');
    await restored.restore(snapshot);
    expect(restored.manifest()).toEqual(index.manifest());
    await expect(restored.restore({ ...snapshot, entries: [{ ...snapshot.entries[0], contentId: 'obs_tampered' }] })).rejects.toThrow('integrity');
    await expect(index.add({ ...first, domain: 'browser' })).rejects.toThrow('outside the retrieval index scope');
    expect(await evaluateExactRecall(index, [{ text: 'same' }, { text: 'missing' }], 1)).toEqual({
      k: 1, queries: 2, queriesWithExactMatches: 1, hitsAtK: 1, recallAtK: 1,
    });
  });

  it('rolls calibration artifacts forward and back without mutating them', async () => {
    const document = createDocumentAdapter();
    const left = await createFingerprint(document, { text: 'same' }, { id: 'left' });
    const right = await createFingerprint(document, { text: 'same' }, { id: 'right' });
    const comparison = await compareFingerprints(document, left, right);
    const options = (id: string) => ({
      artifactId: id,
      manifest: {
        id: `manifest-${id}`, population: 'documents', task: 'exact-content',
        observationIds: ['left', 'right'], labelSources: ['verified'], split: 'calibration' as const,
        collectedFrom: '2026-01-01', collectedTo: '2026-01-02',
      },
    });
    const first = createCalibrationArtifact([{ pairId: 'pair-1', comparison, label: { pairId: 'pair-1', label: 1, source: 'verified' } }], options('cal-1'));
    const second = { ...first, id: 'cal-2', data: { ...first.data, id: 'manifest-cal-2' } };
    const registry = new CalibrationArtifactRegistry();
    registry.register(first);
    registry.register(second);
    registry.activate('cal-1', 'initial promotion', new Date('2026-01-03'));
    expect(registry.active()?.id).toBe('cal-1');
    registry.activate('cal-2', 'new extractor shadow evaluation', new Date('2026-01-04'));
    expect(registry.active()?.id).toBe('cal-2');
    registry.rollback('cal-1', 'held-out regression', new Date('2026-01-05'));
    expect(registry.active()?.id).toBe('cal-1');
    expect(registry.activationHistory().map(item => item.reason)).toEqual([
      'initial promotion', 'new extractor shadow evaluation', 'rollback: held-out regression',
    ]);
    expect(registry.get('cal-1')).toEqual(first);
  });
});
