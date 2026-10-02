import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createDocumentAdapter, createFingerprint } from '../dist/next.js';
import { createSqliteNextStore } from '../dist/next/sqlite-storage.js';
import { createPostgresNextStore } from '../dist/next/postgres-storage.js';
import { createRedisNextStore } from '../dist/next/redis-storage.js';

const root = resolve(import.meta.dirname, '..');
const requireLive = process.env.NEXT_REQUIRE_LIVE_STORAGE === '1';
const runId = `next-storage-check-${Date.now()}`;
const adapter = createDocumentAdapter();
const domain = adapter.domain;
const schemaVersion = adapter.schemaVersion;
const observation = await createFingerprint(adapter, { text: `storage-check-${runId}` }, { id: `observation-${runId}` });

async function assertStore(name, createStore) {
  const first = createStore();
  await first.init();
  await first.save(observation);
  const before = await first.snapshot();
  await first.close();

  const reopened = createStore();
  await reopened.init();
  const restored = await reopened.get(observation.id);
  if (JSON.stringify(restored) !== JSON.stringify(observation)) {
    throw new Error(`${name} did not preserve the observation across reopen`);
  }
  await reopened.restore({ ...before, observations: [] });
  await reopened.close();

  const rollback = createStore();
  await rollback.init();
  await rollback.save(observation);
  try {
    await rollback.transaction(async current => {
      await current.remove(observation.id);
      throw new Error('intentional rollback');
    });
    throw new Error(`${name} transaction unexpectedly succeeded`);
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'intentional rollback') throw error;
  }
  if (!await rollback.get(observation.id)) throw new Error(`${name} failed transaction rollback`);
  await rollback.restore({ ...before, observations: [] });
  await rollback.close();
  console.log(`${name}: reopen and rollback passed`);
}

const cacheDirectory = resolve(root, '.compat-cache');
await mkdir(cacheDirectory, { recursive: true });
const sqlitePath = resolve(cacheDirectory, `${runId}.sqlite`);
try {
  await assertStore('SQLite', () => createSqliteNextStore(sqlitePath, domain, schemaVersion));
} finally {
  await rm(sqlitePath, { force: true });
}

const postgresUrl = process.env.NEXT_POSTGRES_URL;
if (postgresUrl) {
  await assertStore('PostgreSQL', () => createPostgresNextStore(postgresUrl, domain, schemaVersion));
} else if (requireLive) {
  throw new Error('NEXT_POSTGRES_URL is required when NEXT_REQUIRE_LIVE_STORAGE=1');
} else {
  console.log('PostgreSQL: skipped (set NEXT_POSTGRES_URL for live acceptance)');
}

const redisUrl = process.env.NEXT_REDIS_URL;
if (redisUrl) {
  await assertStore('Redis', () => createRedisNextStore(redisUrl, domain, schemaVersion));
} else if (requireLive) {
  throw new Error('NEXT_REDIS_URL is required when NEXT_REQUIRE_LIVE_STORAGE=1');
} else {
  console.log('Redis: skipped (set NEXT_REDIS_URL for live acceptance)');
}

console.log('NEXT storage acceptance completed');