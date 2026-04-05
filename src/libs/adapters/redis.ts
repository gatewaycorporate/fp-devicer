import Redis from "ioredis";
import type { StorageAdapter, DeviceMatch, StoredFingerprint } from "../../types/storage.js";
import { calculateConfidence } from "../confidence.js";
import { FPUserDataSet } from "../../types/data.js";
import { getStoredFingerprintHash } from "../fingerprint-hash.js";

/**
 * Create a {@link StorageAdapter} backed by Redis via `ioredis`.
 *
 * **Key schema**
 * - `fp:device:<deviceId>` — Hash mapping snapshot IDs to serialised
 *   {@link StoredFingerprint} JSON. Keys expire after 90 days.
 * - `fp:latest:<deviceId>` — Cached copy of the most recent snapshot for
 *   candidate scoring.
 * - `idx:devices` — Set of device IDs used for full-store enumeration during
 *   deduplication and exports.
 * - `idx:platform:<value>`, `idx:deviceMemory:<value>`,
 *   `idx:hardwareConcurrency:<value>` — Secondary index sets used for
 *   coarse candidate pre-filtering via `SMEMBERS` / `SINTER`.
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
  const ttlSeconds = 60 * 60 * 24 * 90;

	const deviceKey = (deviceId: string): string => `fp:device:${deviceId}`;
	const latestKey = (deviceId: string): string => `fp:latest:${deviceId}`;

	const parseStoredFingerprint = (value: string): StoredFingerprint | null => {
		try {
			const parsed = JSON.parse(value);
			if (parsed && typeof parsed === "object" && "fingerprint" in parsed && "deviceId" in parsed) {
				return {
					...(parsed as StoredFingerprint),
					timestamp: new Date((parsed as StoredFingerprint).timestamp),
				};
			}
		} catch {
			return null;
		}
		return null;
	};

	const readAllFingerprints = async (): Promise<StoredFingerprint[]> => {
		const deviceIds = await redis.smembers('idx:devices');
		const allFingerprints: StoredFingerprint[] = [];
		if (!deviceIds.length) {
			return allFingerprints;
		}

		const pipeline = redis.pipeline();
		deviceIds.forEach((deviceId: string) => pipeline.hvals(deviceKey(deviceId)));
		const results = await pipeline.exec();
		results.forEach(([err, raw]: [Error | null, string[]]) => {
			if (err) return;
			raw.forEach((value: string) => {
				const snapshot = parseStoredFingerprint(value);
				if (snapshot) {
					allFingerprints.push(snapshot);
				}
			});
		});

		return allFingerprints;
	};

  return {
    async init() { /* optional schema check */ },
    async save(snapshot) {
			const signalsHash = getStoredFingerprintHash(snapshot);
			if (signalsHash) {
				const existing = (await readAllFingerprints()).find(
					(storedSnapshot) => getStoredFingerprintHash(storedSnapshot) === signalsHash
				);
				if (existing) {
					return existing.id;
				}
			}

			const key = deviceKey(snapshot.deviceId);
			const latestSnapshotKey = latestKey(snapshot.deviceId);
			const storedSnapshot = signalsHash && snapshot.signalsHash !== signalsHash
				? { ...snapshot, signalsHash }
				: snapshot;
			await redis.sadd('idx:devices', snapshot.deviceId);
			await redis.sadd(`idx:platform:${snapshot.fingerprint.platform}`, snapshot.deviceId);
			await redis.sadd(`idx:deviceMemory:${snapshot.fingerprint.deviceMemory}`, snapshot.deviceId);
			await redis.sadd(`idx:hardwareConcurrency:${snapshot.fingerprint.hardwareConcurrency}`, snapshot.deviceId);
      await redis
        .multi()
				.hset(key, storedSnapshot.id, JSON.stringify(storedSnapshot))
				.set(latestSnapshotKey, JSON.stringify(storedSnapshot))
				.expire(key, ttlSeconds)
				.expire(latestSnapshotKey, ttlSeconds)
        .exec();
			return storedSnapshot.id;
    },
    async getHistory(deviceId, limit = 50) {
      const key = deviceKey(deviceId);
      const raw = await redis.hvals(key);
			return raw
				.map((value: string) => parseStoredFingerprint(value))
				.filter((snapshot: StoredFingerprint | null): snapshot is StoredFingerprint => snapshot !== null)
				.sort((a: StoredFingerprint, b: StoredFingerprint) => b.timestamp.getTime() - a.timestamp.getTime())
				.slice(0, limit);
    },
    async findCandidates(query, minConfidence, limit = 20) {
			// Narrow the search with low-cost hardware/platform indexes before
			// running full confidence scoring on the remaining candidates.
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

			// Intersect the secondary indexes to keep the candidate pool small.
			let deviceIds: string[];
			if (indexKeys.length === 1) {
				deviceIds = await redis.smembers(indexKeys[0]);
			} else {
				deviceIds = await redis.sinter(...indexKeys); // set intersection
			}

			// Over-fetch slightly because confidence scoring may drop candidates.
			deviceIds = deviceIds.slice(0, limit * 2); // we may drop some after real scoring

			if (deviceIds.length === 0) return [];

			// Score only the pre-filtered candidates.
			const pipeline = redis.pipeline();
			for (const deviceId of deviceIds) {
				pipeline.get(latestKey(deviceId));
			}
			const results = await pipeline.exec();

			const candidates: DeviceMatch[] = [];

			for (let i = 0; i < deviceIds.length; i++) {
				const raw = results?.[i]?.[1] as string | null;
				if (!raw) continue;

				const storedSnapshot = parseStoredFingerprint(raw);
				if (!storedSnapshot) continue;

				const storedData: FPUserDataSet = storedSnapshot.fingerprint;
				const score = calculateConfidence(query, storedData);

				if (score >= minConfidence) {
					candidates.push({
						deviceId: deviceIds[i],
						confidence: score,
						lastSeen: storedSnapshot.timestamp
					});
				}
			}

			// Highest-confidence matches should be returned first.
			return candidates.sort((a, b) => b.confidence - a.confidence).slice(0, limit);
    },
    async linkToUser(deviceId, userId) {
      await redis.hset(`fp:device:${deviceId}`, "userId", userId);
    },
    async deleteOldSnapshots(olderThanDays) {
			// Retention is handled by the per-device TTL set during writes.
      return 0;
    },
		async getAllFingerprints() {
			return readAllFingerprints();
		},
    async close() { await redis.quit(); }
  };
}