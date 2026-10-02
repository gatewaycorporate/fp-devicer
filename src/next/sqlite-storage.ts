import Database from 'better-sqlite3';
import type { NextObservationStore, NextSnapshot, NextSnapshotPersistence } from './storage.js';
import { createPersistentNextStore, validateSnapshot } from './storage.js';

export type SqliteNextStore = NextObservationStore & { init(): Promise<void>; close(): void };

export function createSqliteNextStore(
  databasePath: string,
  domain: string,
  schemaVersion: string,
): SqliteNextStore {
  const database = new Database(databasePath);
  database.exec(`
    CREATE TABLE IF NOT EXISTS next_observations (
      domain TEXT NOT NULL,
      schema_version TEXT NOT NULL,
      observation_id TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      payload TEXT NOT NULL,
      PRIMARY KEY (domain, schema_version, observation_id)
    )
  `);

  const persistence: NextSnapshotPersistence = {
    async read() {
      const rows = database.prepare(`
        SELECT observation_id, payload
        FROM next_observations
        WHERE domain = ? AND schema_version = ?
        ORDER BY observation_id
      `).all(domain, schemaVersion) as Array<{ observation_id: string; payload: string }>;
      const observations = rows.map(row => JSON.parse(row.payload));
      return JSON.stringify({
        version: 'next.observations.v1',
        domain,
        schemaVersion,
        observations,
      });
    },
    async write(encoded) {
      const snapshot = JSON.parse(encoded) as NextSnapshot;
      validateSnapshot(snapshot, domain, schemaVersion);
      const writeSnapshot = database.transaction(() => {
        database.prepare(`
          DELETE FROM next_observations WHERE domain = ? AND schema_version = ?
        `).run(domain, schemaVersion);
        const insert = database.prepare(`
          INSERT INTO next_observations
            (domain, schema_version, observation_id, observed_at, payload)
          VALUES (?, ?, ?, ?, ?)
        `);
        for (const observation of snapshot.observations) {
          insert.run(
            domain,
            schemaVersion,
            observation.id,
            observation.observedAt,
            JSON.stringify(observation),
          );
        }
      });
      writeSnapshot();
    },
  };

  const store = createPersistentNextStore(domain, schemaVersion, persistence);
  return Object.assign(store, { close: () => database.close() });
}