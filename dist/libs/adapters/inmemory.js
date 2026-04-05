import { calculateConfidence } from "../confidence.js";
import { getStoredFingerprintHash } from "../fingerprint-hash.js";
/**
 * Create a volatile, in-process {@link StorageAdapter} backed by a plain
 * `Map`. All data is lost when the process exits.
 *
 * Intended for **testing and development only**. Because there is no
 * persistence layer, `linkToUser` is a no-op and `deleteOldSnapshots`
 * prunes in-memory history without tracking a deleted-row count.
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
    const hashIndex = new Map();
    const rebuildHashIndex = () => {
        hashIndex.clear();
        for (const history of store.values()) {
            for (const snapshot of history) {
                const signalsHash = getStoredFingerprintHash(snapshot);
                if (signalsHash) {
                    hashIndex.set(signalsHash, snapshot.id);
                }
            }
        }
    };
    return {
        async init() { },
        async save(snapshot) {
            const signalsHash = getStoredFingerprintHash(snapshot);
            const existingId = signalsHash ? hashIndex.get(signalsHash) : undefined;
            if (existingId) {
                return existingId;
            }
            const storedSnapshot = signalsHash && snapshot.signalsHash !== signalsHash
                ? { ...snapshot, signalsHash }
                : snapshot;
            if (!store.has(storedSnapshot.deviceId))
                store.set(storedSnapshot.deviceId, []);
            store.get(storedSnapshot.deviceId).push(storedSnapshot);
            if (signalsHash) {
                hashIndex.set(signalsHash, storedSnapshot.id);
            }
            return storedSnapshot.id;
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
            // This adapter only stores fingerprint history in memory.
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
            rebuildHashIndex();
            return 0; // Snapshot pruning is applied, but deleted-row counts are not tracked.
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
