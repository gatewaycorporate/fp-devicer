import type { StorageAdapter } from "../../types/storage.js";
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
export declare function createSqliteAdapter(dbUrlOrClient: string): StorageAdapter;
//# sourceMappingURL=sqlite.d.ts.map