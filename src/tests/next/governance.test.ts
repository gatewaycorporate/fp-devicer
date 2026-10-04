import { describe, expect, it } from 'vitest';
import { createGovernedNextStore, createInMemoryNextStore, type NextAuditEvent } from '../../next/index.js';

const observation = (id: string, observedAt: string) => ({
  id, domain: 'fixture', schemaVersion: 'fixture.v1', observedAt,
  extractorVersions: {}, features: { template: [1, 0] },
});

describe('NEXT governance', () => {
  it('purges expired observations and emits metadata-only audit events', async () => {
    const events: NextAuditEvent[] = [];
    const store = createGovernedNextStore(createInMemoryNextStore('fixture', 'fixture.v1'), {
      retentionMs: 1_000,
      now: () => new Date('2026-01-02T00:00:00Z'),
      audit: event => events.push(event),
    });
    await store.save(observation('old', '2026-01-01T23:59:00Z'));
    await store.save(observation('new', '2026-01-01T23:59:59.500Z'));
    expect(await store.purgeExpired()).toBe(1);
    expect((await store.all()).map(item => item.id)).toEqual(['new']);
    expect(events).toContainEqual(expect.objectContaining({ action: 'purge', observationId: 'old', reason: 'retention_expired' }));
    expect(JSON.stringify(events)).not.toContain('template');
  });

  it('enforces authorization for reads and deletes', async () => {
    const store = createGovernedNextStore(createInMemoryNextStore('fixture', 'fixture.v1'), {
      retentionMs: 1_000,
      authorize: action => action !== 'read' && action !== 'delete',
    });
    await store.save(observation('protected', '2026-01-02T00:00:00Z'));
    await expect(store.get('protected')).rejects.toThrow('governance denied read');
    await expect(store.remove('protected')).rejects.toThrow('governance denied delete');
  });
});