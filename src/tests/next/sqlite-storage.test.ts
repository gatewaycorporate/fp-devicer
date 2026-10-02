import { describe, expect, it } from 'vitest';
import { createDocumentAdapter, createFingerprint } from '../../next/index.js';
import { createSqliteNextStore } from '../../next/sqlite-storage.js';

describe('SQLite NEXT persistence', () => {
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