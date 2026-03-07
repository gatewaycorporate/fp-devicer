import type { StorageAdapter, StoredFingerprint, DeviceMatch } from "../types/storage";
import { calculateConfidence } from "./confidence";

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
    async deleteOldSnapshots() { return 0; },
  };
}

// Usage: const adapter = createInMemoryAdapter();