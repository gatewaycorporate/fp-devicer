import type { StorageAdapter } from "../../types/storage.js";
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
export declare function createPostgresAdapter(dbUrlOrClient: string): StorageAdapter;
//# sourceMappingURL=postgres.d.ts.map