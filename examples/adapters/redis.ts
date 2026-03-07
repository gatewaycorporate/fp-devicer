import Redis from "ioredis";
import { randomUUID } from "crypto";
import type { StorageAdapter } from "../../src/types/storage";
import { calculateConfidence } from "../../src/libs/confidence";

export function createRedisAdapter(redisUrl?: string): StorageAdapter {
  const redis = new Redis(redisUrl || "redis://localhost:6379");

  return {
    async init() { /* optional schema check */ },
    async save(snapshot) {
      const key = `fp:device:${snapshot.deviceId}`;
      const snapshotId = randomUUID();
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
      return raw.slice(0, limit).map((v) => JSON.parse(v));
    },
    async findCandidates(query, minConfidence, limit = 20) {// For simplicity, this example does a full scan. In production, you'd want to optimize this with indexing or a more efficient data structure.
        const allKeys = await redis.keys("fp:device:*");
        const candidates = [];
        for (const key of allKeys) {
            const snapshots = await redis.hvals(key);
            for (const snapshot of snapshots) {
                const parsed = JSON.parse(snapshot);
                const confidence = calculateConfidence(query, parsed);
                if (confidence >= minConfidence) {
                    candidates.push({ ...parsed, confidence });
                }
            }
        }
        candidates.sort((a, b) => b.confidence - a.confidence);
        return candidates.slice(0, limit);
    },
    async linkToUser(deviceId, userId) {
      await redis.hset(`fp:device:${deviceId}`, "userId", userId);
    },
    async deleteOldSnapshots(olderThanDays) {
        // This is a no-op since we set TTL on keys, but you could also implement a scan + delete here if needed
        return 0;
    },
    async close() { await redis.quit(); }
  };
}