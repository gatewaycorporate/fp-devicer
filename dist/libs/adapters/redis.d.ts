import type { StorageAdapter } from "../../types/storage.js";
/**
 * Create a {@link StorageAdapter} backed by Redis via `ioredis`.
 *
 * **Key schema**
 * - `fp:device:<deviceId>` — Hash mapping snapshot IDs to serialised
 *   {@link StoredFingerprint} JSON. Keys expire after 90 days.
 * - `fp:latest:<deviceId>` — Stores the most-recent fingerprint JSON for
 *   fast candidate retrieval.
 * - `idx:platform:<value>`, `idx:deviceMemory:<value>`,
 *   `idx:hardwareConcurrency:<value>` — Secondary index sets used for
 *   O(1) candidate pre-filtering via `SINTER`.
 *
 * `deleteOldSnapshots` is a no-op; TTL-based expiry handles retention.
 *
 * @param redisUrl - Optional Redis connection URL.
 *   Defaults to `"redis://localhost:6379"`.
 * @returns A `StorageAdapter` instance. Call `init()` before any other method.
 *
 * @example
 * ```ts
 * const adapter = createRedisAdapter('redis://localhost:6379');
 * await adapter.init();
 * ```
 */
export declare function createRedisAdapter(redisUrl?: string): StorageAdapter;
//# sourceMappingURL=redis.d.ts.map