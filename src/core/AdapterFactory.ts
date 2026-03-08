import { createInMemoryAdapter } from "../libs/adapters/inmemory.js";
import { createPostgresAdapter } from "../libs/adapters/postgres.js";
import { createRedisAdapter } from "../libs/adapters/redis.js";
import { createSqliteAdapter } from "../libs/adapters/sqlite.js";
import type { StorageAdapter } from "../types/storage.js";

export type AdapterType = "in-memory" | "sqlite" | "postgres" | "redis";

export interface AdapterFactoryOptions {
	sqlite?: {
		filePath: string;
	};
	postgres?: {
		connectionString: string;
	};
	redis?: {
		url: string;
	};
}

export class AdapterFactory {
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