import { drizzle } from "drizzle-orm/better-sqlite3"; // or drizzle-orm/postgres-js for Postgres
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm/sql";
import { eq, lt } from "drizzle-orm/sql/expressions/conditions";
import { desc } from "drizzle-orm/sql/expressions/select";
import { randomUUID } from "crypto";
import { calculateConfidence } from "../confidence.js";
import { getFingerprintHash, getStoredFingerprintHash } from "../fingerprint-hash.js";
const fingerprintsTable = sqliteTable("fingerprints", {
    id: text("id").primaryKey(),
    deviceId: text("deviceId").notNull(),
    data: text("data", { mode: "json" }).$type(),
    timestamp: text("timestamp"),
});
/**
 * Create a {@link StorageAdapter} backed by a SQLite database file via
 * Drizzle ORM (`drizzle-orm/better-sqlite3`).
 *
 * The adapter creates the `fingerprints` table automatically on the first
 * call to `init()`. Candidate pre-filtering uses a lightweight SQL `WHERE`
 * clause on JSON fields before running full in-process confidence scoring.
 *
 * @param dbUrlOrClient - Path to the SQLite database file, e.g. `"./fp.db"`.
 * @returns A `StorageAdapter` instance. Call `init()` before any other method.
 *
 * @example
 * ```ts
 * const adapter = createSqliteAdapter('./fingerprints.db');
 * await adapter.init();
 * ```
 */
export function createSqliteAdapter(dbUrlOrClient) {
    const db = drizzle(dbUrlOrClient);
    const findExistingSnapshotIdByHash = async (signalsHash) => {
        const rows = await db.select().from(fingerprintsTable);
        for (const row of rows) {
            if (row.data && getFingerprintHash(row.data) === signalsHash) {
                return row.id;
            }
        }
        return null;
    };
    return {
        async init() {
            await db.run(sql `CREATE TABLE IF NOT EXISTS fingerprints (
          id TEXT PRIMARY KEY,
          deviceId TEXT NOT NULL,
          data JSON NOT NULL,
          timestamp TEXT NOT NULL
        )`);
        },
        async save(snapshot) {
            const signalsHash = getStoredFingerprintHash(snapshot);
            if (signalsHash) {
                const existingId = await findExistingSnapshotIdByHash(signalsHash);
                if (existingId) {
                    return existingId;
                }
            }
            const id = randomUUID();
            await db.insert(fingerprintsTable).values({
                id,
                deviceId: snapshot.deviceId,
                data: snapshot.fingerprint,
                timestamp: snapshot.timestamp instanceof Date ? snapshot.timestamp.toISOString() : snapshot.timestamp,
            });
            return id;
        },
        async getHistory(deviceId, limit = 50) {
            const results = await db
                .select()
                .from(fingerprintsTable)
                .where(eq(fingerprintsTable.deviceId, deviceId))
                .orderBy(desc(fingerprintsTable.timestamp))
                .limit(limit);
            return results.filter(row => row.data !== null).map(row => ({
                id: row.id,
                deviceId: row.deviceId,
                fingerprint: row.data,
                timestamp: row.timestamp ? new Date(row.timestamp) : new Date(),
                signalsHash: getFingerprintHash(row.data),
            }));
        },
        async findCandidates(query, minConfidence, limit = 20) {
            // Pre-filter by hardware/platform signals in SQL before running
            // the full confidence calculation in process.
            const prelim = await db.select().from(fingerprintsTable).where(sql `(json_extract(data, '$.deviceMemory') = ${query.deviceMemory}
					OR json_extract(data, '$.hardwareConcurrency') = ${query.hardwareConcurrency}
					OR json_extract(data, '$.platform') = ${query.platform})`);
            // Prefer rows that also agree on higher-entropy canvas or WebGL data.
            const filtered = prelim.filter(row => {
                const fp = row.data;
                return (query.canvas && fp?.canvas === query.canvas) ||
                    (query.webgl && fp?.webgl === query.webgl);
            });
            // Keep the broader SQL-filtered pool when those stronger signals are
            // unavailable or do not match yet.
            const pool = filtered.length > 0 ? filtered : prelim;
            const candidates = [];
            for (const row of pool) {
                const confidence = calculateConfidence(query, row.data);
                if (confidence >= minConfidence) {
                    candidates.push({
                        deviceId: row.deviceId,
                        confidence,
                        lastSeen: row.timestamp ? new Date(row.timestamp) : new Date(),
                    });
                }
            }
            candidates.sort((a, b) => b.confidence - a.confidence);
            return candidates.slice(0, limit);
        },
        async linkToUser() { },
        async deleteOldSnapshots(olderThanDays) {
            const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
            const result = await db.delete(fingerprintsTable).where(lt(fingerprintsTable.timestamp, cutoff));
            return result.changes || 0; // number of deleted rows
        },
        async getAllFingerprints() {
            const results = await db.select().from(fingerprintsTable);
            return results.filter(row => row.data !== null).map(row => ({
                id: row.id,
                deviceId: row.deviceId,
                fingerprint: row.data,
                timestamp: row.timestamp ? new Date(row.timestamp) : new Date(),
                signalsHash: getFingerprintHash(row.data),
            }));
        }
    };
}
