import { calculateConfidence, createConfidenceCalculator, DEFAULT_WEIGHTS } from "../libs/confidence.js";
import { getGlobalRegistry } from "../libs/registry.js";
import { canonicalizedStringify, getHash } from "../libs/tlsh.js";
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
     * Cache entry for the deduplication window (feature #8).
     * Keyed by the TLSH hash of the incoming fingerprint.
     */
    dedupCache = new Map();
    /**
     * @param adapter - Storage backend used for all persistence operations.
     * @param context - Optional tuning parameters and observability overrides.
     * @param context.matchThreshold - Minimum confidence score (0–100) required
     *   to consider two fingerprints the same device. Defaults to `50`.
     * @param context.candidateMinScore - Minimum score (0–100) passed to the
     *   adapter's pre-filter step. Defaults to `30`.
     * @param context.stabilityWindowSize - Number of historical snapshots to load
     *   per candidate for adaptive weight computation. Defaults to `5`.
     *   Set to `1` to disable adaptive weights.
     * @param context.dedupWindowMs - Duration in milliseconds during which
     *   repeated identifies with the same fingerprint hash return a cached result
     *   without a DB write. Defaults to `5000`. Set to `0` to disable.
     * @param context.logger - Custom logger; falls back to {@link defaultLogger}.
     * @param context.metrics - Custom metrics sink; falls back to {@link defaultMetrics}.
     */
    constructor(adapter, context = {}) {
        this.adapter = adapter;
        this.context = context;
        this.context.matchThreshold ??= 50;
        this.context.candidateMinScore ??= 30;
        this.context.stabilityWindowSize ??= 5;
        this.context.dedupWindowMs ??= 5000;
        this.logger = this.context.logger ?? defaultLogger;
        this.metrics = this.context.metrics ?? defaultMetrics;
    }
    /**
     * Compute per-field stability scores across a window of historical snapshots.
     *
     * For each field in {@link DEFAULT_WEIGHTS}, scores consecutive snapshot pairs
     * using the registered comparator (or string equality as fallback), then
     * averages those scores to produce a stability value in `[0, 1]`.
     * A value of `1` means the field never changes; `0` means it always changes.
     *
     * @param snapshots - Ordered historical snapshots for a device.
     * @returns Map of field path → stability score.
     * @internal
     */
    computeFieldStabilities(snapshots) {
        if (snapshots.length < 2)
            return {};
        const registry = getGlobalRegistry();
        const stabilities = {};
        for (const field of Object.keys(DEFAULT_WEIGHTS)) {
            const comparator = registry.comparators[field] ?? ((a, b) => Number(a === b));
            let total = 0;
            let count = 0;
            for (let i = 0; i < snapshots.length - 1; i++) {
                const v1 = snapshots[i].fingerprint[field];
                const v2 = snapshots[i + 1].fingerprint[field];
                if (v1 !== undefined && v2 !== undefined) {
                    total += Math.max(0, Math.min(1, comparator(v1, v2, field)));
                    count++;
                }
            }
            // Default to 1 (fully stable) when no data — avoids down-weighting fields
            // on a device with only one snapshot.
            stabilities[field] = count > 0 ? total / count : 1;
        }
        return stabilities;
    }
    /**
     * Identify a device from an incoming fingerprint dataset.
     *
     * Runs the full pre-filter → score → decide → save pipeline and emits
     * observability signals before returning.
     *
     * - **Dedup cache** – if the same fingerprint hash is seen within
     *   `dedupWindowMs`, the cached result is returned without a DB write.
     * - **Adaptive weights** – when a candidate has ≥ 2 historical snapshots,
     *   per-field stability is measured and low-stability fields are down-weighted
     *   before the full confidence score is computed.
     *
     * @param incoming - The fingerprint data collected from the current request.
     * @param context - Optional per-request context.
     * @param context.userId - Application user ID to associate with this snapshot.
     * @param context.ip - Client IP address to store alongside the snapshot.
     * @returns An object describing the resolved device.
     * @returns .deviceId - Stable device identifier (reused or newly minted).
     * @returns .confidence - Final confidence score in `[0, 100]`.
     * @returns .isNewDevice - `true` when no existing device was matched.
     * @returns .matchConfidence - Same as confidence; also persisted on the snapshot.
     * @returns .linkedUserId - The `userId` passed in `context`, if any.
     */
    async identify(incoming, context) {
        const start = performance.now();
        // --- #8 Dedup cache check ---
        const dedupWindowMs = this.context.dedupWindowMs;
        let cacheKey = null;
        if (dedupWindowMs > 0) {
            cacheKey = getHash(canonicalizedStringify(incoming));
            const cached = this.dedupCache.get(cacheKey);
            if (cached && cached.expiresAt > Date.now()) {
                this.logger.debug("Dedup cache hit — skipping DB write", { cacheKey });
                return cached.result;
            }
        }
        this.logger.debug("Device identification started", { userId: context?.userId, ip: context?.ip });
        // 1. Quick pre-filter (screen, hardwareConcurrency, etc.) → candidates
        const candidates = await this.adapter.findCandidates(incoming, this.context.candidateMinScore, 100);
        // 2. Full scoring with optional adaptive weights
        const windowSize = this.context.stabilityWindowSize;
        let bestMatch = null;
        for (const cand of candidates) {
            const rawHistory = await this.adapter.getHistory(cand.deviceId, windowSize);
            if (!rawHistory.length)
                continue;
            // Normalise to newest-first so history[0] is always the most recent
            // snapshot regardless of adapter ordering (SQLite = DESC, inmemory = ASC).
            const history = [...rawHistory].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
            // Build a per-device confidence scorer that down-weights unstable fields
            let scorer = calculateConfidence;
            if (history.length >= 2) {
                const stabilities = this.computeFieldStabilities(history);
                const adaptedWeights = {};
                for (const [field, baseWeight] of Object.entries(DEFAULT_WEIGHTS)) {
                    adaptedWeights[field] = baseWeight * (stabilities[field] ?? 1);
                }
                scorer = createConfidenceCalculator({ weights: adaptedWeights }).calculateConfidence;
            }
            // Score against the most-recent snapshot (history is newest-first)
            const score = scorer(incoming, history[0].fingerprint);
            if (score > (bestMatch?.confidence ?? 0)) {
                bestMatch = { ...cand, confidence: score };
            }
        }
        const isMatched = !!(bestMatch && bestMatch.confidence > this.context.matchThreshold);
        const deviceId = isMatched ? bestMatch.deviceId : `dev_${randomUUID()}`;
        const isNewDevice = !isMatched;
        const finalConfidence = bestMatch?.confidence ?? 0;
        const durationMs = performance.now() - start;
        // 3. Save — include matchConfidence for drift tracking (#7)
        await this.adapter.save({
            id: randomUUID(),
            deviceId,
            userId: context?.userId,
            timestamp: new Date(),
            fingerprint: incoming,
            ip: context?.ip,
            matchConfidence: finalConfidence,
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
        const result = {
            deviceId,
            confidence: finalConfidence,
            isNewDevice,
            matchConfidence: finalConfidence,
            linkedUserId: context?.userId,
        };
        if (dedupWindowMs > 0 && cacheKey) {
            this.dedupCache.set(cacheKey, { result, expiresAt: Date.now() + dedupWindowMs });
        }
        return result;
    }
    /**
     * Identify multiple devices in a batch.
     *
     * @param incomingList - An array of fingerprint data sets to identify.
     * @param context - Optional context including userId and IP address.
     * @returns A promise that resolves to an array of identification results.
     */
    async identifyMany(incomingList, context) {
        const results = [];
        for (const incoming of incomingList) {
            const result = await this.identify(incoming, context);
            results.push(result);
        }
        return results;
    }
    /**
     * Clear the deduplication cache immediately.
     * Useful in tests or after a forced re-identification.
     */
    clearDedupCache() {
        this.dedupCache.clear();
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
