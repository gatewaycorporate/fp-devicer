import { calculateConfidence } from "../libs/confidence.js";
import { randomUUID } from "crypto";
export class DeviceManager {
    adapter;
    context;
    constructor(adapter, context = {}) {
        this.adapter = adapter;
        this.context = context;
        this.context.matchThreshold ??= 80; // default threshold
        this.context.candidateMinScore ??= 50; // default minimum score for pre-filtering candidates
    }
    async identify(incoming, context) {
        // 1. Quick pre-filter (screen, hardwareConcurrency, etc.) → candidates
        const candidates = await this.adapter.findCandidates(incoming, this.context.candidateMinScore, this.context.matchThreshold);
        // 2. Full scoring
        let bestMatch = null;
        for (const cand of candidates) {
            const history = await this.adapter.getHistory(cand.deviceId, 1);
            if (!history.length)
                continue;
            const score = calculateConfidence(incoming, history[0].fingerprint);
            if (score > (bestMatch?.confidence ?? 0)) {
                bestMatch = { ...cand, confidence: score };
            }
        }
        const deviceId = bestMatch && bestMatch.confidence > this.context.matchThreshold
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
