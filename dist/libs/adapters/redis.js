import Redis from "ioredis";
import { randomUUID } from "crypto";
import { calculateConfidence } from "../confidence.js";
export function createRedisAdapter(redisUrl) {
    const redis = new Redis(redisUrl || "redis://localhost:6379");
    return {
        async init() { },
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
            return raw.slice(0, limit).map((v) => JSON.parse(v));
        },
        async findCandidates(query, minConfidence, limit = 20) {
            // Preselect candidates based on quick checks (e.g., deviceMemory, hardwareConcurrency, platform) if those are part of the fingerprint, then calculate confidence for those candidates.
            // This is a simplified example. In production, you'd want to optimize this with proper indexing and maybe a more efficient search strategy.
            const indexKeys = [];
            if (query.platform) {
                indexKeys.push(`idx:platform:${query.platform}`);
            }
            if (typeof query.hardwareConcurrency === 'number') {
                indexKeys.push(`idx:hardwareConcurrency:${query.hardwareConcurrency}`);
            }
            if (query.deviceMemory !== undefined) {
                indexKeys.push(`idx:deviceMemory:${query.deviceMemory}`);
            }
            if (indexKeys.length === 0)
                return [];
            // ←←← THIS IS THE FAST FILTER ←←←
            let deviceIds;
            if (indexKeys.length === 1) {
                deviceIds = await redis.smembers(indexKeys[0]);
            }
            else {
                deviceIds = await redis.sinter(...indexKeys); // set intersection
            }
            // Optional: early limit to avoid fetching too many
            deviceIds = deviceIds.slice(0, limit * 2); // we may drop some after real scoring
            if (deviceIds.length === 0)
                return [];
            // Now do the real scoring ONLY on the pre-filtered candidates (very few)
            const pipeline = redis.pipeline();
            for (const deviceId of deviceIds) {
                // Get the latest snapshot (assuming you store latest as a JSON key)
                pipeline.get(`fp:latest:${deviceId}`);
            }
            const results = await pipeline.exec();
            const candidates = [];
            for (let i = 0; i < deviceIds.length; i++) {
                const raw = results?.[i]?.[1];
                if (!raw)
                    continue;
                const storedData = JSON.parse(raw);
                const score = calculateConfidence(query, storedData);
                if (score >= minConfidence) {
                    const lastSeenRaw = storedData.lastSeen ?? storedData.timestamp ?? Date.now();
                    candidates.push({
                        deviceId: deviceIds[i],
                        confidence: score,
                        lastSeen: new Date(lastSeenRaw)
                    });
                }
                if (candidates.length >= limit)
                    break;
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
        async close() { await redis.quit(); }
    };
}
