import Redis from 'ioredis';
import type { NextObservationStore, NextSnapshotPersistence } from './storage.js';
import { createPersistentNextStore } from './storage.js';

export type RedisNextStore = NextObservationStore & { init(): Promise<void>; close(): Promise<void> };

export function createRedisNextStore(
  redisUrl: string | undefined,
  domain: string,
  schemaVersion: string,
): RedisNextStore {
  const client = new (Redis as any)(redisUrl ?? 'redis://localhost:6379');
  const key = `devicer:next:${domain}:${schemaVersion}`;
  const persistence: NextSnapshotPersistence = {
    async read() {
      return (await client.get(key)) ?? undefined;
    },
    async write(snapshot) {
      await client.set(key, snapshot);
    },
  };
  const store = createPersistentNextStore(domain, schemaVersion, persistence);
  const initializeStore = store.init;
  return Object.assign(store, {
    async init() {
      await client.ping();
      await initializeStore();
    },
    close: () => client.quit(),
  });
}