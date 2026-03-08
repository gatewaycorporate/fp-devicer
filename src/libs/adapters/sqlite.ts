import { drizzle } from "drizzle-orm/better-sqlite3"; // or drizzle-orm/postgres-js for Postgres
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm/sql";
import { eq, lt } from "drizzle-orm/sql/expressions/conditions";
import { desc } from "drizzle-orm/sql/expressions/select";
import { randomUUID } from "crypto";
import type { DeviceMatch, StorageAdapter, StoredFingerprint } from "../../types/storage.js";
import { calculateConfidence } from "../confidence.js";


const fingerprintsTable = sqliteTable("fingerprints", {
	id: text("id").primaryKey(),
	deviceId: text("deviceId").notNull(),
	data: text("data", { mode: "json" }).$type<StoredFingerprint["fingerprint"]>(),
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
export function createSqliteAdapter(dbUrlOrClient: string): StorageAdapter {
	const db = drizzle(dbUrlOrClient); // works for both SQLite & Postgres

	return {
		async init() {
			await db.run(
				sql`CREATE TABLE IF NOT EXISTS fingerprints (
          id TEXT PRIMARY KEY,
          deviceId TEXT NOT NULL,
          data JSON NOT NULL,
          timestamp TEXT NOT NULL
        )`
			);
		},
		async save(snapshot) {
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
				fingerprint: row.data!,
				timestamp: row.timestamp ? new Date(row.timestamp) : new Date(),
			}));
		},
		async findCandidates(query, minConfidence, limit = 20) {
			// Preselect candidates based on quick checks (e.g., deviceMemory, hardwareConcurrency, platform) if those are part of the fingerprint, then calculate confidence for those candidates.
			// This is a simplified example. In production, you'd want to optimize this with proper indexing and maybe a more efficient search strategy.
			const prelim = await db.select().from(fingerprintsTable).where(
				sql`${fingerprintsTable.data} ->> 'deviceMemory' = ${query.deviceMemory} OR 
            ${fingerprintsTable.data} ->> 'hardwareConcurrency' = ${query.hardwareConcurrency} OR 
            ${fingerprintsTable.data} ->> 'platform' = ${query.platform}`
			);
			const candidates: Array<DeviceMatch & { confidence: number }> = [];
			for (const row of prelim) {
				const confidence = calculateConfidence(query, row.data!);
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
		async linkToUser() { /* implement as needed, maybe an additional table for user-device mapping */ },
		async deleteOldSnapshots(olderThanDays) {
			const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
			const result = await db.delete(fingerprintsTable).where(lt(fingerprintsTable.timestamp, cutoff));
			return result.changes || 0; // number of deleted rows
		},
	};
}