import type { StorageAdapter, DeviceMatch } from "../types/storage.js";
import type { FPDataSet } from "../types/data.js";
import { calculateConfidence } from "../libs/confidence.js";
import { randomUUID } from "crypto";

export class DeviceManager {
  constructor(private adapter: StorageAdapter) {}

  async identify(incoming: FPDataSet, context?: { userId?: string; ip?: string }) {
    // 1. Quick pre-filter (screen, hardwareConcurrency, etc.) → candidates
    const candidates = await this.adapter.findCandidates(incoming, 60, 50);

    // 2. Full scoring
    let bestMatch: DeviceMatch | null = null;
    for (const cand of candidates) {
      const history = await this.adapter.getHistory(cand.deviceId, 1);
      if (!history.length) continue;
      const score = calculateConfidence(incoming, history[0].fingerprint);
      if (score > (bestMatch?.confidence ?? 0)) {
        bestMatch = { ...cand, confidence: score };
      }
    }

    const deviceId = bestMatch && bestMatch.confidence > 80
      ? bestMatch.deviceId
      : `dev_${randomUUID()}`;

    // 3. Save new snapshot
    await this.adapter.save({
      id: randomUUID(),
      deviceId,
      userId: context?.userId,
      timestamp: new Date(),
      fingerprint: incoming,
      ip: context?.ip,
    });

    return {
      deviceId,
      confidence: bestMatch?.confidence ?? 0,
      isNewDevice: !bestMatch,
      linkedUserId: context?.userId,
    };
  }
}