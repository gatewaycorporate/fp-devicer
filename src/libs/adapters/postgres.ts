import { drizzle } from "drizzle-orm/postgres-js";
import { pgTable, text, json } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm/sql";
import { eq, lt } from "drizzle-orm/sql/expressions/conditions";
import { desc } from "drizzle-orm/sql/expressions/select";
import { randomUUID } from "crypto";
import type { DeviceMatch, StorageAdapter, StoredFingerprint } from "../../types/storage.js";
import { calculateConfidence } from "../confidence.js";


const fingerprintsTable = pgTable("fingerprints", {
  id: text("id").primaryKey(),
  deviceId: text("deviceId").notNull(),
  data: json("data").$type<StoredFingerprint["fingerprint"]>(),
  timestamp: text("timestamp"),
});

export function createPostgresAdapter(dbUrlOrClient: any): StorageAdapter {
  const db = drizzle(dbUrlOrClient); // works for both SQLite & Postgres

  return {
    async init() {
        await db.execute(
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
        // This is a simplified example. In production, you'd want to optimize this with proper indexing and maybe a more efficient search strategy.
        const all = await db.select().from(fingerprintsTable);
        const candidates: Array<DeviceMatch & { confidence: number }> = [];
        for (const row of all) {
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
    async linkToUser() { 
        // This method would require a user management system to link deviceIds to userIds. Implementation would depend on your specific user schema and requirements.
    },
    async deleteOldSnapshots(olderThanDays) {
        const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
        const result = await db.delete(fingerprintsTable).where(lt(fingerprintsTable.timestamp, cutoff)).returning();
        return result.length;
    },
  };
}