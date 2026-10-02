import { describe, expect, it } from 'vitest';
import { createFaceAdapter, createFingerprint, runEvaluation, type EvaluationPair, type EvaluationManifest } from '../../next/index.js';

describe('NEXT evaluation runner', () => {
  it('reports operating metrics, abstentions, quality slices, and latency', async () => {
    const adapter = createFaceAdapter({
      model: {
        id: 'fixture-face', name: 'fixture-face', version: '1', sourceRepository: 'https://example.test/face',
        upstreamRevision: 'fixture', checkpointDigest: 'sha256:fixture', license: 'test', runtime: 'fixture',
        preprocessing: 'fixture.v1', supportedHardware: ['cpu'], inputSchema: 'vector', outputSchema: 'embedding',
      },
      extractorVersions: { face: 'fixture.v1' },
      infer: (input: { embedding?: number[] }) => ({ embedding: input.embedding }),
    });
    const make = (id: string, embedding?: number[]) => createFingerprint(adapter, { embedding }, { id });
    const left = await make('left', [1, 0]);
    const same = await make('same', [1, 0]);
    const other = await make('other', [0, 1]);
    const missing = await make('missing');
    const pairs: EvaluationPair<{ embedding?: number[] }>[] = [
      { pairId: 'genuine', left, right: same, label: 1, quality: 'good' },
      { pairId: 'impostor', left, right: other, label: 0, quality: 'good' },
      { pairId: 'unavailable', left, right: missing, label: 1, quality: 'missing' },
    ];
    const manifest: EvaluationManifest = {
      id: 'fixture-test', domain: 'face', task: 'same-subject', split: 'test',
      sourceDigest: 'sha256:source', labelDigest: 'sha256:labels',
      observationIds: ['left', 'same', 'other', 'missing'],
      groups: { left: 'subject-a', same: 'subject-a', other: 'subject-b', missing: 'subject-c' },
      preprocessing: 'fixture.v1', modelConfigurationDigest: 'sha256:configuration',
    };
    const report = await runEvaluation(adapter, pairs, { manifest, threshold: 0.9, now: () => 1 });
    expect(report).toMatchObject({ total: 3, genuine: 2, impostor: 1, supported: 2, insufficient: 1, falseMatchRate: 0, falseNonMatchRate: 0 });
    expect(report.abstentionRate).toBeCloseTo(1 / 3);
    expect(report.qualitySlices).toEqual([
      { name: 'good', total: 2, supported: 2, abstentions: 0, meanSimilarity: 0.75 },
      { name: 'missing', total: 1, supported: 0, abstentions: 1, meanSimilarity: null },
    ]);
    expect(report.latencyMs).toEqual({ p50: 0, p95: 0, p99: 0 });
  });
});