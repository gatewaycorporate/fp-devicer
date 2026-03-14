import { drizzle } from "drizzle-orm/postgres-js";
import { pgTable, text, json } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm/sql";
import { eq, lt } from "drizzle-orm/sql/expressions/conditions";
import { desc } from "drizzle-orm/sql/expressions/select";
import { randomUUID } from "crypto";
import { calculateConfidence } from "../confidence.js";
import { getFingerprintHash, getStoredFingerprintHash } from "../fingerprint-hash.js";
const fingerprintsTable = pgTable("fingerprints", {
    id: text("id").primaryKey(),
    deviceId: text("deviceId").notNull(),
    data: json("data").$type(),
    timestamp: text("timestamp"),
});
/**
 * Create a {@link StorageAdapter} backed by a PostgreSQL database via
 * Drizzle ORM (`drizzle-orm/postgres-js`).
 *
 * The adapter creates the `fingerprints` table automatically on the first
 * call to `init()`. Candidate pre-filtering executes a JSON-operator
 * `WHERE` clause before running full in-process confidence scoring.
 *
 * @param dbUrlOrClient - PostgreSQL connection string,
 *   e.g. `"postgresql://user:pass@localhost:5432/mydb"`.
 * @returns A `StorageAdapter` instance. Call `init()` before any other method.
 *
 * @example
 * ```ts
 * const adapter = createPostgresAdapter('postgresql://localhost/mydb');
 * await adapter.init();
 * ```
 */
export function createPostgresAdapter(dbUrlOrClient) {
    const db = drizzle(dbUrlOrClient); // works for both SQLite & Postgres
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
            await db.execute(sql `CREATE TABLE IF NOT EXISTS fingerprints (
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
                // ...other fields
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
            // Preselect candidates based on quick checks (e.g., deviceMemory, hardwareConcurrency, platform) if those are part of the fingerprint, then calculate confidence for those candidates.
            // This is a simplified example. In production, you'd want to optimize this with proper indexing and maybe a more efficient search strategy.
            // Pre-filter by hardware signals in SQL
            const prelim = await db.select().from(fingerprintsTable).where(sql `(json_extract(data, '$.deviceMemory') = ${query.deviceMemory}
					OR json_extract(data, '$.hardwareConcurrency') = ${query.hardwareConcurrency}
					OR json_extract(data, '$.platform') = ${query.platform})`);
            // Further narrow to rows where canvas OR webgl also matches (in-process)
            const filtered = prelim.filter(row => {
                const fp = row.data;
                return (query.canvas && fp?.canvas === query.canvas) ||
                    (query.webgl && fp?.webgl === query.webgl);
            });
            // Fall back to full prelim set if no biometric signals matched
            // (e.g. first session where canvas/webgl are not yet known)
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
        async linkToUser() {
            // This method would require a user management system to link deviceIds to userIds. Implementation would depend on your specific user schema and requirements.
        },
        async deleteOldSnapshots(olderThanDays) {
            const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
            const result = await db.delete(fingerprintsTable).where(lt(fingerprintsTable.timestamp, cutoff)).returning();
            return result.length;
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
