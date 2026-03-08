import Redis from "ioredis";
import { randomUUID } from "crypto";
import type { StorageAdapter, DeviceMatch, StoredFingerprint } from "../../types/storage.js";
import { calculateConfidence } from "../confidence.js";
import { FPUserDataSet } from "../../types/data.js";

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
export function createRedisAdapter(redisUrl?: string): StorageAdapter {
  const redis = new (Redis as any)(redisUrl || "redis://localhost:6379");

  return {
    async init() { /* optional schema check */ },
    async save(snapshot) {
      const key = `fp:device:${snapshot.deviceId}`;
      const snapshotId = randomUUID();
			await redis.sadd(`idx:platform:${snapshot.fingerprint.platform}`, key);
			await redis.sadd(`idx:deviceMemory:${snapshot.fingerprint.deviceMemory}`, key);
			await redis.sadd(`idx:hardwareConcurrency:${snapshot.fingerprint.hardwareConcurrency}`, key);
      await redis
        .multi()
        .hset(key, snapshotId, JSON.stringify(snapshot))
        .expire(key, 60 * 60 * 24 * 90) // 90-day TTL
        .exec();
      return snapshotId;
    },
    async getHistory(deviceId, limit = 50) {
      const key = `fp:device:${deviceId}`;
      const raw = await redis.hvals(key);
      return raw.slice(0, limit).map((v: string) => JSON.parse(v));
    },
    async findCandidates(query, minConfidence, limit = 20) {
      // Preselect candidates based on quick checks (e.g., deviceMemory, hardwareConcurrency, platform) if those are part of the fingerprint, then calculate confidence for those candidates.
			// This is a simplified example. In production, you'd want to optimize this with proper indexing and maybe a more efficient search strategy.
			const indexKeys: string[] = [];

			if (query.platform) {
				indexKeys.push(`idx:platform:${query.platform}`);
			}
			if (typeof query.hardwareConcurrency === 'number') {
				indexKeys.push(`idx:hardwareConcurrency:${query.hardwareConcurrency}`);
			}
			if (query.deviceMemory !== undefined) {
				indexKeys.push(`idx:deviceMemory:${query.deviceMemory}`);
			}

			if (indexKeys.length === 0) return [];

			// ←←← THIS IS THE FAST FILTER ←←←
			let deviceIds: string[];
			if (indexKeys.length === 1) {
				deviceIds = await redis.smembers(indexKeys[0]);
			} else {
				deviceIds = await redis.sinter(...indexKeys); // set intersection
			}

			// Optional: early limit to avoid fetching too many
			deviceIds = deviceIds.slice(0, limit * 2); // we may drop some after real scoring

			if (deviceIds.length === 0) return [];

			// Now do the real scoring ONLY on the pre-filtered candidates (very few)
			const pipeline = redis.pipeline();
			for (const deviceId of deviceIds) {
				// Get the latest snapshot (assuming you store latest as a JSON key)
				pipeline.get(`fp:latest:${deviceId}`);
			}
			const results = await pipeline.exec();

			const candidates: DeviceMatch[] = [];

			for (let i = 0; i < deviceIds.length; i++) {
				const raw = results?.[i]?.[1] as string | null;
				if (!raw) continue;

				const storedData: FPUserDataSet = JSON.parse(raw);
				const score = calculateConfidence(query, storedData);

				if (score >= minConfidence) {
					const lastSeenRaw = (storedData as any).lastSeen ?? (storedData as any).timestamp ?? Date.now();
					candidates.push({
						deviceId: deviceIds[i],
						confidence: score,
						lastSeen: new Date(lastSeenRaw)
					});
				}

				if (candidates.length >= limit) break;
			}

			// Return sorted by confidence (same as in-memory adapter)
			return candidates.sort((a, b) => b.confidence - a.confidence);
    },
    async linkToUser(deviceId, userId) {
      await redis.hset(`fp:device:${deviceId}`, "userId", userId);
    },
    async deleteOldSnapshots(olderThanDays) {
      // This is a no-op since we set TTL on keys, but you could also implement a scan + delete here if needed
      return 0;
    },
		async getAllFingerprints() {
			const stream = redis.scanStream({ match: 'fp:device:*', count: 100 });
			const allFingerprints: StoredFingerprint[] = [];
			
			return new Promise((resolve, reject) => {
				stream.on('data', async (keys: string[]) => {
					if (keys.length) {
						const pipeline = redis.pipeline();
						keys.forEach(key => pipeline.hvals(key));
						const results = await pipeline.exec();
						results.forEach(([err, raw]: [Error | null, any]) => {
							if (err) return; // skip errors
							raw.forEach((v: string) => allFingerprints.push(JSON.parse(v)));
						});
					}
				});
				stream.on('end', () => resolve(allFingerprints));
				stream.on('error', (err: any) => reject(err));
			});
		},
    async close() { await redis.quit(); }
  };
}