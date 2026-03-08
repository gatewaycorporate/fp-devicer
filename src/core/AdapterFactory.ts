import { createInMemoryAdapter } from "../libs/adapters/inmemory.js";
import { createPostgresAdapter } from "../libs/adapters/postgres.js";
import { createRedisAdapter } from "../libs/adapters/redis.js";
import { createSqliteAdapter } from "../libs/adapters/sqlite.js";
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
export class AdapterFactory {
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
	static create(type: AdapterType, options: AdapterFactoryOptions = {}): StorageAdapter {
		switch (type) {
			case "in-memory":
				return createInMemoryAdapter();

			case "sqlite": {
				const filePath = options.sqlite?.filePath;
				if (!filePath) {
					throw new Error("Missing sqlite.filePath for sqlite adapter");
				}
				return createSqliteAdapter(filePath);
			}

			case "postgres": {
				const connectionString = options.postgres?.connectionString;
				if (!connectionString) {
					throw new Error(
						"Missing postgres.connectionString for postgres adapter"
					);
				}
				return createPostgresAdapter(connectionString);
			}

			case "redis": {
				const url = options.redis?.url;
				if (!url) {
					throw new Error("Missing redis.url for redis adapter");
				}
				return createRedisAdapter(url);
			}

			default:
				throw new Error(`Unsupported adapter type: ${type satisfies never}`);
		}
	}
}