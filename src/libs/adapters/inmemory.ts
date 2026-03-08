import type { StorageAdapter, StoredFingerprint, DeviceMatch } from "../../types/storage.js";
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
export function createInMemoryAdapter(): StorageAdapter {
  const store = new Map<string, StoredFingerprint[]>();

  return {
    async init() {},
    async save(snapshot) {
      if (!store.has(snapshot.deviceId)) store.set(snapshot.deviceId, []);
      store.get(snapshot.deviceId)!.push(snapshot);
      return snapshot.id;
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
    async deleteOldSnapshots() {
			store.clear(); // In-memory stub: clear all data. In production, this would delete snapshots older than the specified date.
			return 0; // Return 0 since we're not tracking individual deletions in this stub.
		},
  };
}

// Usage: const adapter = createInMemoryAdapter();