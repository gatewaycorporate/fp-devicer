import { calculateConfidence } from "../libs/confidence.js";
import { randomUUID } from "crypto";
import { defaultLogger, defaultMetrics } from "../libs/default-observability.js";
/**
 * High-level device identification service.
 *
 * `DeviceManager` orchestrates the full fingerprint matching pipeline:
 * 1. **Pre-filter** – calls `adapter.findCandidates()` to retrieve a small
 *    set of candidate devices whose stored fingerprints are broadly similar
 *    to the incoming data.
 * 2. **Full scoring** – re-scores each candidate against its most-recent
 *    stored snapshot using {@link calculateConfidence}.
 * 3. **Decision** – if the best candidate exceeds `matchThreshold`, its
 *    device ID is reused; otherwise a new UUID-based device ID is minted.
 * 4. **Persistence** – saves the incoming snapshot via `adapter.save()`.
 * 5. **Observability** – emits structured log lines and records metrics
 *    through the injected {@link Logger} and {@link Metrics} instances.
 *
 * @example
 * ```ts
 * const manager = new DeviceManager(adapter, { matchThreshold: 50 });
 * const result = await manager.identify(fingerprintData, { userId: 'u_123' });
 * console.log(result.deviceId, result.confidence);
 * ```
 */
export class DeviceManager {
    adapter;
    context;
    logger;
    metrics;
    /**
     * @param adapter - Storage backend used for all persistence operations.
     * @param context - Optional tuning parameters and observability overrides.
     * @param context.matchThreshold - Minimum confidence score (0–100) required
     *   to consider two fingerprints the same device. Defaults to `50`.
     * @param context.candidateMinScore - Minimum score (0–100) passed to the
     *   adapter's pre-filter step. Defaults to `30`.
     * @param context.logger - Custom logger; falls back to {@link defaultLogger}.
     * @param context.metrics - Custom metrics sink; falls back to {@link defaultMetrics}.
     */
    constructor(adapter, context = {}) {
        this.adapter = adapter;
        this.context = context;
        this.context.matchThreshold ??= 50; // default threshold
        this.context.candidateMinScore ??= 30; // default minimum score for pre-filtering candidates
        this.logger = this.context.logger ?? defaultLogger;
        this.metrics = this.context.metrics ?? defaultMetrics;
    }
    /**
     * Identify a device from an incoming fingerprint dataset.
     *
     * Runs the full pre-filter → score → decide → save pipeline and emits
     * observability signals before returning.
     *
     * @param incoming - The fingerprint data collected from the current request.
     * @param context - Optional per-request context.
     * @param context.userId - Application user ID to associate with this snapshot.
     * @param context.ip - Client IP address to store alongside the snapshot.
     * @returns An object describing the resolved device.
     * @returns .deviceId - Stable device identifier (reused or newly minted).
     * @returns .confidence - Final confidence score in `[0, 100]`.
     * @returns .isNewDevice - `true` when no existing device was matched.
     * @returns .linkedUserId - The `userId` passed in `context`, if any.
     */
    async identify(incoming, context) {
        const start = performance.now();
        this.logger.debug("Device identification started", { userId: context?.userId, ip: context?.ip });
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
        this.metrics.recordIdentify(durationMs, finalConfidence, isNewDevice, candidates.length, !!bestMatch);
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
    /**
     * Return the metrics summary from the current metrics sink, if supported.
     *
     * @returns The object returned by `metrics.getSummary()`, or `null` if the
     *   current metrics implementation does not expose a summary.
     */
    getMetricsSummary() {
        if (this.metrics.getSummary) {
            return this.metrics.getSummary();
        }
        return null;
    }
}
