import { calculateConfidence } from "../confidence.js";
/**
 * Create a volatile, in-process {@link StorageAdapter} backed by a plain
 * `Map`. All data is lost when the process exits.
 *
 * Intended for **testing and development only**. Because there is no
 * persistence layer, `linkToUser` and `deleteOldSnapshots` are no-ops.
 *
 * @returns A fully initialised (eager) `StorageAdapter` instance.
 *
 * @example
 * ```ts
 * const adapter = createInMemoryAdapter();
 * await adapter.init(); // no-op but keeps the API consistent
 * ```
 */
export function createInMemoryAdapter() {
    const store = new Map();
    return {
        async init() { },
        async save(snapshot) {
            if (!store.has(snapshot.deviceId))
                store.set(snapshot.deviceId, []);
            store.get(snapshot.deviceId).push(snapshot);
            return snapshot.id;
        },
        async getHistory(deviceId, limit = 50) {
            return (store.get(deviceId) || []).slice(-limit);
        },
        async findCandidates(query, minConfidence, limit = 20) {
            const matches = [];
            for (const [deviceId, history] of store) {
                if (!history.length)
                    continue;
                const latest = history[history.length - 1];
                const score = calculateConfidence(query, latest.fingerprint);
                if (score >= minConfidence) {
                    matches.push({ deviceId, confidence: score, lastSeen: latest.timestamp });
                }
                if (matches.length >= limit)
                    break;
            }
            return matches.sort((a, b) => b.confidence - a.confidence);
        },
        async linkToUser() {
            // In-memory stub: no-op since we don't have a real DB to update. In production, this would update all snapshots for the deviceId to set userId.
        },
        async deleteOldSnapshots(olderThanDays) {
            store.forEach((history, deviceId) => {
                const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
                const filtered = history.filter(s => s.timestamp.getTime() >= cutoff);
                if (filtered.length === 0) {
                    store.delete(deviceId);
                }
                else {
                    store.set(deviceId, filtered);
                }
            });
            return 0; // Return 0 since we're not tracking individual deletions in this stub.
        },
        async getAllFingerprints() {
            const allFingerprints = [];
            for (const history of store.values()) {
                allFingerprints.push(...history);
            }
            return allFingerprints;
        }
    };
}
// Usage: const adapter = createInMemoryAdapter();
