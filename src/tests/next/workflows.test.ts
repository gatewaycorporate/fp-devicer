import { describe, expect, it } from 'vitest';
import {
  calibrateComparison,
  compareFingerprints,
  createBrowserAdapter,
  createCalibrationArtifact,
  createDocumentAdapter,
  createExactContentId,
  createFingerprint,
  evaluateCalibration,
  ExactRetrievalIndex,
  matchFingerprint,
  createInMemoryNextStore,
  createPersistentNextStore,
  createPersistentCalibrationArtifactRegistry,
} from '../../next/index.js';

describe('advertised NEXT preview workflows', () => {
  it('compares browser observations without creating an identity', async () => {
    const adapter = createBrowserAdapter();
    const first = await createFingerprint(adapter, { language: 'en-US', timezone: 'UTC' });
    const later = await createFingerprint(adapter, { language: 'en-US', timezone: 'Europe/Paris' });
    const result = await compareFingerprints(adapter, first, later);

    expect(result.status).toBe('uncalibrated');
    expect(result.similarity).toBe(0.5);
    expect(result.evidence[0]?.relation).toBe('same-installation');
  });

  it('deduplicates exact documents and retrieves bounded candidates', async () => {
    const adapter = createDocumentAdapter();
    const first = await createFingerprint(adapter, { text: 'invoice-42' }, { id: 'first' });
    const duplicate = await createFingerprint(adapter, { text: 'invoice-42' }, { id: 'duplicate' });
    const contentId = await createExactContentId(adapter.domain, adapter.schemaVersion, first.features);
    const index = new ExactRetrievalIndex(adapter.domain, adapter.schemaVersion);

    await index.add(first);
    await index.add(duplicate);

    expect(contentId).toMatch(/^obs_[0-9a-f]{64}$/);
    expect((await index.findExact(first.features, 1)).map(item => item.observation.id)).toEqual(['duplicate']);
    expect(index.page(0, 2)).toHaveLength(2);
  });

  it('abstains when the incoming observation has no comparable candidate', async () => {
    const adapter = createBrowserAdapter();
    const incoming = await createFingerprint(adapter, { language: 'en-US' });
    const result = await matchFingerprint(adapter, incoming, [], {
      relation: 'same-installation',
      minimumSimilarity: 0.8,
    });

    expect(result.decision).toBe('insufficient_evidence');
    expect(result.candidateObservationId).toBeUndefined();
  });

  it('keeps calibrated probabilities tied to the comparison configuration', async () => {
    const adapter = createDocumentAdapter();
    const left = await createFingerprint(adapter, { text: 'same' }, { id: 'left' });
    const same = await createFingerprint(adapter, { text: 'same' }, { id: 'same' });
    const different = await createFingerprint(adapter, { text: 'different' }, { id: 'different' });
    const positive = await compareFingerprints(adapter, left, same);
    const negative = await compareFingerprints(adapter, left, different);
    const artifact = createCalibrationArtifact([
      { pairId: 'positive', comparison: positive, label: { pairId: 'positive', label: 1, source: 'verified' } },
      { pairId: 'negative', comparison: negative, label: { pairId: 'negative', label: 0, source: 'verified' } },
    ], {
      artifactId: 'document-preview-v1',
      manifest: {
        id: 'document-calibration', population: 'documents', task: 'exact-content',
        observationIds: ['left', 'same', 'different'], labelSources: ['verified'], split: 'calibration',
        collectedFrom: '2026-01-01', collectedTo: '2026-01-02',
      },
    });
    const prediction = calibrateComparison(positive, artifact);
    const evaluation = evaluateCalibration([
      { pairId: 'held-out-positive', comparison: positive, label: { pairId: 'held-out-positive', label: 1, source: 'external' } },
    ], artifact, {
      id: 'document-held-out', population: 'documents', task: 'exact-content',
      observationIds: ['left', 'same'], labelSources: ['external'], split: 'held_out',
      collectedFrom: '2026-02-01', collectedTo: '2026-02-02',
    });

    expect(prediction.status).toBe('supported');
    expect(prediction.probability).not.toBeNull();
    expect(evaluation.supported).toBe(1);
  });

  it('round-trips scoped NEXT observations and rolls back failed transactions', async () => {
    const adapter = createDocumentAdapter();
    const observation = await createFingerprint(adapter, { text: 'invoice-42' }, { id: 'invoice-42' });
    const store = createInMemoryNextStore(adapter.domain, adapter.schemaVersion);

    await store.save(observation);
    const snapshot = await store.snapshot();
    const restored = createInMemoryNextStore(adapter.domain, adapter.schemaVersion);
    await restored.restore(snapshot);
    expect(await restored.get(observation.id)).toEqual(observation);

    await expect(store.transaction(async current => {
      await current.save({ ...observation, id: 'invoice-43', features: { text: 'invoice-43' } });
      throw new Error('abort transaction');
    })).rejects.toThrow('abort transaction');
    expect(await store.get('invoice-43')).toBeUndefined();
  });

  it('reopens through a durable snapshot boundary and rolls back failed writes', async () => {
    const adapter = createDocumentAdapter();
    const observation = await createFingerprint(adapter, { text: 'invoice-44' }, { id: 'invoice-44' });
    let encoded: string | undefined;
    const persistence = {
      async read() { return encoded; },
      async write(snapshot: string) { encoded = snapshot; },
    };
    const first = createPersistentNextStore(adapter.domain, adapter.schemaVersion, persistence);
    await first.init();
    await first.save(observation);

    const reopened = createPersistentNextStore(adapter.domain, adapter.schemaVersion, persistence);
    await reopened.init();
    expect(await reopened.get('invoice-44')).toEqual(observation);

    const failing = createPersistentNextStore(adapter.domain, adapter.schemaVersion, {
      async read() { return encoded; },
      async write() { throw new Error('storage unavailable'); },
    });
    await failing.init();
    await expect(failing.remove('invoice-44')).rejects.toThrow('storage unavailable');
    expect(await failing.get('invoice-44')).toEqual(observation);
  });

  it('persists immutable artifact promotion and rollback history', async () => {
    const adapter = createDocumentAdapter();
    const left = await createFingerprint(adapter, { text: 'artifact' }, { id: 'artifact-left' });
    const right = await createFingerprint(adapter, { text: 'artifact' }, { id: 'artifact-right' });
    const comparison = await compareFingerprints(adapter, left, right);
    const artifact = createCalibrationArtifact([
      { pairId: 'artifact-pair', comparison, label: { pairId: 'artifact-pair', label: 1, source: 'verified' } },
    ], {
      artifactId: 'persistent-artifact',
      manifest: {
        id: 'persistent-manifest', population: 'documents', task: 'exact-content',
        observationIds: ['artifact-left', 'artifact-right'], labelSources: ['verified'], split: 'calibration',
        collectedFrom: '2026-01-01', collectedTo: '2026-01-02',
      },
    });
    let encoded: string | undefined;
    const persistence = {
      async read() { return encoded; },
      async write(snapshot: string) { encoded = snapshot; },
    };
    const first = createPersistentCalibrationArtifactRegistry(persistence);
    await first.init();
    await first.register(artifact);
    await first.activate(artifact.id, 'initial promotion', new Date('2026-01-03'));

    const reopened = createPersistentCalibrationArtifactRegistry(persistence);
    await reopened.init();
    expect((await reopened.active())?.id).toBe(artifact.id);
    await reopened.rollback(artifact.id, 'held-out review', new Date('2026-01-04'));
    expect((await reopened.activationHistory()).map(item => item.reason)).toEqual([
      'initial promotion', 'rollback: held-out review',
    ]);
    expect(await reopened.get(artifact.id)).toEqual(artifact);
  });
});