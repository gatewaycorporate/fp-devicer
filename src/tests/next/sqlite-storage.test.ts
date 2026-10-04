import { describe, expect, it } from 'vitest';
import { compareFingerprints, createDocumentAdapter, createFingerprint, createPhysicalFingerprintAdapter } from '../../next/index.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSqliteNextStore } from '../../next/sqlite-storage.js';

describe('SQLite NEXT persistence', () => {
  it('preserves validated signal provenance across a durable reopen', async () => {
    const adapter = createPhysicalFingerprintAdapter({
      model: {
        id: 'fixture', name: 'fixture', version: '1', sourceRepository: 'https://example.test/fixture',
        upstreamRevision: 'fixture', checkpointDigest: 'fixture:no-checkpoint', license: 'test', runtime: 'test',
        preprocessing: 'fixture.v1', supportedHardware: ['cpu'], inputSchema: 'gray8', outputSchema: 'vector',
      },
      featureDimension: 2, extractorVersions: { fixture: '1' }, infer: () => ({ template: [1, 0] }),
    });
    const image = new Uint8Array(256 * 360).fill(255);
    image.fill(32, 2560, 5120);
    const observation = await createFingerprint(adapter, { image, width: 256, height: 360, dpi: 500 });
    const directory = await mkdtemp(join(tmpdir(), 'next-signal-'));
    const filename = join(directory, 'signals.sqlite');
    const first = createSqliteNextStore(filename, adapter.domain, adapter.schemaVersion);
    const second = createSqliteNextStore(filename, adapter.domain, adapter.schemaVersion);
    try {
      await first.init();
      await first.save(observation);
      await first.close();
      await second.init();
      const restored = await second.get(observation.id);
      expect(restored).toEqual(observation);
      expect(await compareFingerprints(adapter, observation, restored!)).toMatchObject({ status: 'uncalibrated', similarity: 1 });
    } finally {
      await first.close();
      await second.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('reopens observations from a scoped SQLite table', async () => {
    const adapter = createDocumentAdapter();
    const observation = await createFingerprint(adapter, { text: 'sqlite-invoice' }, { id: 'sqlite-invoice' });
    const first = createSqliteNextStore(':memory:', adapter.domain, adapter.schemaVersion);
    await first.init();
    await first.save(observation);
    const snapshot = await first.snapshot();
    expect(snapshot.observations).toHaveLength(1);
    first.close();
  });

  it('supports rollback when a transaction fails', async () => {
    const adapter = createDocumentAdapter();
    const observation = await createFingerprint(adapter, { text: 'sqlite-rollback' }, { id: 'sqlite-rollback' });
    const store = createSqliteNextStore(':memory:', adapter.domain, adapter.schemaVersion);
    await store.init();
    await store.save(observation);

    await expect(store.transaction(async current => {
      await current.remove(observation.id);
      throw new Error('abort sqlite transaction');
    })).rejects.toThrow('abort sqlite transaction');
    expect(await store.get(observation.id)).toEqual(observation);
    store.close();
  });
});