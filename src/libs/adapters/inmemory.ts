import type { StorageAdapter, StoredFingerprint, DeviceMatch } from "../../types/storage.js";
import { calculateConfidence } from "../confidence.js";
import { getStoredFingerprintHash } from "../fingerprint-hash.js";

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
export function createInMemoryAdapter(): StorageAdapter {
  const store = new Map<string, StoredFingerprint[]>();
  const hashIndex = new Map<string, string>();

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
    async init() {},
    async save(snapshot) {
      const signalsHash = getStoredFingerprintHash(snapshot);
      const existingId = signalsHash ? hashIndex.get(signalsHash) : undefined;
      if (existingId) {
        return existingId;
      }

      const storedSnapshot = signalsHash && snapshot.signalsHash !== signalsHash
        ? { ...snapshot, signalsHash }
        : snapshot;

      if (!store.has(storedSnapshot.deviceId)) store.set(storedSnapshot.deviceId, []);
      store.get(storedSnapshot.deviceId)!.push(storedSnapshot);
      if (signalsHash) {
        hashIndex.set(signalsHash, storedSnapshot.id);
      }
      return storedSnapshot.id;
    },
    async getHistory(deviceId, limit = 50) {
      return (store.get(deviceId) || []).slice(-limit);
    },
    async findCandidates(query, minConfidence, limit = 20) {
      const matches: DeviceMatch[] = [];
      for (const [deviceId, history] of store) {
        if (!history.length) continue;
        const latest = history[history.length - 1];
        const score = calculateConfidence(query, latest.fingerprint);
        if (score >= minConfidence) {
          matches.push({ deviceId, confidence: score, lastSeen: latest.timestamp });
        }
        if (matches.length >= limit) break;
      }
      return matches.sort((a, b) => b.confidence - a.confidence);
    },
    async linkToUser() {
      // In-memory stub: no-op since we don't have a real DB to update. In production, this would update all snapshots for the deviceId to set userId.
    },
    async deleteOldSnapshots(olderThanDays: number) {
			store.forEach((history, deviceId) => {
				const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
				const filtered = history.filter(s => s.timestamp.getTime() >= cutoff);
				if (filtered.length === 0) {
					store.delete(deviceId);
				} else {
					store.set(deviceId, filtered);
				}
			});
      rebuildHashIndex();
			return 0; // Return 0 since we're not tracking individual deletions in this stub.
		},
		async getAllFingerprints() {
			const allFingerprints: StoredFingerprint[] = [];
			for (const history of store.values()) {
				allFingerprints.push(...history);
			}
			return allFingerprints;
		}
  };
}

// Usage: const adapter = createInMemoryAdapter();