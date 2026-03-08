import type { StorageAdapter, DeviceMatch } from "../types/storage.js";
import type { FPDataSet } from "../types/data.js";
import { calculateConfidence } from "../libs/confidence.js";
import { randomUUID } from "crypto";
import { Logger, Metrics, ObservabilityOptions } from "../types/observability.js";
import { defaultLogger, defaultMetrics } from "../libs/default-observability.js";

export class DeviceManager {
  private logger: Logger;
  private metrics: Metrics;

  constructor(private adapter: StorageAdapter, private context: {
    matchThreshold?: number; // confidence threshold for matching devices
    candidateMinScore?: number; // minimum score for pre-filtering candidates
  } & ObservabilityOptions = {}) {
    this.context.matchThreshold ??= 80; // default threshold
    this.context.candidateMinScore ??= 50; // default minimum score for pre-filtering candidates
    this.logger = this.context.logger ?? defaultLogger;
    this.metrics = this.context.metrics ?? defaultMetrics;
  }

  async identify(incoming: FPDataSet, context?: { userId?: string; ip?: string }) {
    const start = performance.now();

    this.logger.debug!("Device identification started", { userId: context?.userId, ip: context?.ip });

    // 1. Quick pre-filter (screen, hardwareConcurrency, etc.) → candidates
    const candidates = await this.adapter.findCandidates(incoming, this.context.candidateMinScore!, this.context.matchThreshold);

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

    const deviceId = bestMatch && bestMatch.confidence > this.context.matchThreshold!
      ? bestMatch.deviceId
      : `dev_${randomUUID()}`;

    const isNewDevice = !bestMatch;
    const finalConfidence = bestMatch?.confidence ?? 0;
    const durationMs = performance.now() - start;

    // 3. Save
    await this.adapter.save({
      id: randomUUID(),
      deviceId,
      userId: context?.userId,
      timestamp: new Date(),
      fingerprint: incoming,
      ip: context?.ip,
    });

    // Record Metrics + Logging
    this.metrics.recordIdentify(
      durationMs,
      finalConfidence,
      isNewDevice,
      candidates.length,
      !!bestMatch
    );

    this.logger.info('Device identification completed', {
      deviceId,
      confidence: finalConfidence,
      isNewDevice,
      candidates: candidates.length,
      durationMs: Math.round(durationMs),
    });

    return {
      deviceId,
      confidence: finalConfidence,
      isNewDevice,
      linkedUserId: context?.userId,
    };
  }

	getMetricsSummary() {
		if (this.metrics.getSummary) {
			return this.metrics.getSummary();
		}
		return null;
	}
}