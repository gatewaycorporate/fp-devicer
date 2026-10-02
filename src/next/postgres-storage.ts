import postgres from 'postgres';
import type { NextObservationStore, NextSnapshot, NextSnapshotPersistence } from './storage.js';
import { createPersistentNextStore, validateSnapshot } from './storage.js';

export type PostgresNextStore = NextObservationStore & { init(): Promise<void>; close(): Promise<void> };

export function createPostgresNextStore(
  connectionString: string,
  domain: string,
  schemaVersion: string,
): PostgresNextStore {
  const client = postgres(connectionString, {
    prepare: false,
    onnotice: () => {},
  });
  const persistence: NextSnapshotPersistence = {
    async read() {
      const rows = await client`
        SELECT observation_id, payload
        FROM next_observations
        WHERE domain = ${domain} AND schema_version = ${schemaVersion}
        ORDER BY observation_id
      ` as Array<{ observation_id: string; payload: unknown }>;
      const observations = rows.map(row => typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload);
      return JSON.stringify({ version: 'next.observations.v1', domain, schemaVersion, observations });
    },
    async write(encoded) {
      const snapshot = JSON.parse(encoded) as NextSnapshot;
      validateSnapshot(snapshot, domain, schemaVersion);
      await client.begin(async transaction => {
        const sql = transaction as unknown as (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
        await sql`
          DELETE FROM next_observations
          WHERE domain = ${domain} AND schema_version = ${schemaVersion}
        `;
        for (const observation of snapshot.observations) {
          await sql`
            INSERT INTO next_observations
              (domain, schema_version, observation_id, observed_at, payload)
            VALUES (${domain}, ${schemaVersion}, ${observation.id}, ${observation.observedAt}, ${JSON.stringify(observation)})
          `;
        }
      });
    },
  };

  const store = createPersistentNextStore(domain, schemaVersion, persistence);
  const initializeStore = store.init;
  return Object.assign(store, {
    async init() {
      await client.unsafe(`
        CREATE TABLE IF NOT EXISTS next_observations (
          domain TEXT NOT NULL,
          schema_version TEXT NOT NULL,
          observation_id TEXT NOT NULL,
          observed_at TEXT NOT NULL,
          payload JSONB NOT NULL,
          PRIMARY KEY (domain, schema_version, observation_id)
        )
      `);
      await initializeStore();
    },
    close: () => client.end(),
  });
}