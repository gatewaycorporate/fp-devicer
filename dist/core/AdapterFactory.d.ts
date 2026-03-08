import type { StorageAdapter } from "../types/storage.js";
/**
 * Union of the storage backend identifiers supported by {@link AdapterFactory.create}.
 */
export type AdapterType = "in-memory" | "sqlite" | "postgres" | "redis";
/**
 * Backend-specific connection options passed to {@link AdapterFactory.create}.
 *
 * Only the property matching the chosen `AdapterType` needs to be provided;
 * all others are ignored.
 */
export interface AdapterFactoryOptions {
    sqlite?: {
        /** Absolute or relative path to the SQLite database file. */
        filePath: string;
    };
    postgres?: {
        /** PostgreSQL connection string, e.g. `"postgresql://user:pass@host/db"`. */
        connectionString: string;
    };
    redis?: {
        /** Redis connection URL, e.g. `"redis://localhost:6379"`. */
        url: string;
    };
}
/**
 * Static factory for creating {@link StorageAdapter} instances.
 *
 * Centralises adapter construction so callers only need to supply a type
 * string and a minimal options bag, rather than importing each adapter
 * module individually.
 *
 * @example
 * ```ts
 * const adapter = AdapterFactory.create('sqlite', {
 *   sqlite: { filePath: './fingerprints.db' },
 * });
 * await adapter.init();
 * ```
 */
export declare class AdapterFactory {
    /**
     * Instantiate and return the {@link StorageAdapter} for the given type.
     *
     * @param type - Which backend to create. One of `"in-memory"`, `"sqlite"`,
     *   `"postgres"`, or `"redis"`.
     * @param options - Connection options; only the key matching `type` is used.
     * @returns A ready-to-`init()` `StorageAdapter` instance.
     * @throws {Error} If a required connection parameter (e.g. `filePath`) is
     *   missing, or if an unsupported `type` is passed.
     */
    static create(type: AdapterType, options?: AdapterFactoryOptions): StorageAdapter;
}
//# sourceMappingURL=AdapterFactory.d.ts.map