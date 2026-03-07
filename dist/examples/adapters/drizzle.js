"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDrizzleAdapter = createDrizzleAdapter;
const better_sqlite3_1 = require("drizzle-orm/better-sqlite3"); // or drizzle-orm/postgres-js for Postgres
const sqlite_core_1 = require("drizzle-orm/sqlite-core");
const conditions_1 = require("drizzle-orm/sql/expressions/conditions");
const select_1 = require("drizzle-orm/sql/expressions/select");
const crypto_1 = require("crypto");
const confidence_1 = require("../../libs/confidence");
const fingerprintsTable = (0, sqlite_core_1.sqliteTable)("fingerprints", {
    id: (0, sqlite_core_1.text)("id").primaryKey(),
    deviceId: (0, sqlite_core_1.text)("deviceId").notNull(),
    data: (0, sqlite_core_1.text)("data", { mode: "json" }).$type(),
    timestamp: (0, sqlite_core_1.text)("timestamp"),
});
function createDrizzleAdapter(dbUrlOrClient) {
    const db = (0, better_sqlite3_1.drizzle)(dbUrlOrClient); // works for both SQLite & Postgres
    return {
        init() {
            return __awaiter(this, void 0, void 0, function* () {
                yield db.run(`CREATE TABLE IF NOT EXISTS fingerprints (
                id TEXT PRIMARY KEY,
                deviceId TEXT NOT NULL,
                data JSON NOT NULL,
                timestamp TEXT NOT NULL
            )`);
            });
        },
        save(snapshot) {
            return __awaiter(this, void 0, void 0, function* () {
                const id = (0, crypto_1.randomUUID)();
                yield db.insert(fingerprintsTable).values({
                    id,
                    deviceId: snapshot.deviceId,
                    data: snapshot.fingerprint,
                    timestamp: snapshot.timestamp instanceof Date ? snapshot.timestamp.toISOString() : snapshot.timestamp,
                    // ...other fields
                });
                return id;
            });
        },
        getHistory(deviceId_1) {
            return __awaiter(this, arguments, void 0, function* (deviceId, limit = 50) {
                const results = yield db
                    .select()
                    .from(fingerprintsTable)
                    .where((0, conditions_1.eq)(fingerprintsTable.deviceId, deviceId))
                    .orderBy((0, select_1.desc)(fingerprintsTable.timestamp))
                    .limit(limit);
                return results.filter(row => row.data !== null).map(row => ({
                    id: row.id,
                    deviceId: row.deviceId,
                    fingerprint: row.data,
                    timestamp: row.timestamp ? new Date(row.timestamp) : new Date(),
                }));
            });
        },
        findCandidates(query_1, minConfidence_1) {
            return __awaiter(this, arguments, void 0, function* (query, minConfidence, limit = 20) {
                // This is a simplified example. In production, you'd want to optimize this with proper indexing and maybe a more efficient search strategy.
                const all = yield db.select().from(fingerprintsTable);
                const candidates = [];
                for (const row of all) {
                    const confidence = (0, confidence_1.calculateConfidence)(query, row.data);
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
            });
        },
        linkToUser() {
            return __awaiter(this, void 0, void 0, function* () { });
        },
        deleteOldSnapshots(olderThanDays) {
            return __awaiter(this, void 0, void 0, function* () {
                const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
                const result = yield db.delete(fingerprintsTable).where((0, conditions_1.lt)(fingerprintsTable.timestamp, cutoff));
                return result.changes || 0; // number of deleted rows
            });
        },
    };
}
