import type { StorageAdapter } from "../types/storage.js";
import type { FPDataSet } from "../types/data.js";
import { ObservabilityOptions } from "../types/observability.js";
/** Return type of {@link DeviceManager.identify}. */
export interface IdentifyResult {
    deviceId: string;
    confidence: number;
    isNewDevice: boolean;
    /** Mirror of `confidence`; also persisted on the saved snapshot for drift tracking. */
    matchConfidence: number;
    linkedUserId?: string;
}
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
export declare class DeviceManager {
    private adapter;
    private context;
    private logger;
    private metrics;
    /**
     * Cache entry for the deduplication window (feature #8).
     * Keyed by the TLSH hash of the incoming fingerprint.
     */
    private dedupCache;
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
    constructor(adapter: StorageAdapter, context?: {
        matchThreshold?: number;
        candidateMinScore?: number;
        /** Number of historical snapshots used for adaptive weight computation. Default `5`. */
        stabilityWindowSize?: number;
        /** Dedup window in ms; repeated identifies within this window skip DB writes. Default `5000`. Set `0` to disable. */
        dedupWindowMs?: number;
    } & ObservabilityOptions);
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
    private computeFieldStabilities;
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
    identify(incoming: FPDataSet, context?: {
        userId?: string;
        ip?: string;
    }): Promise<IdentifyResult>;
    /**
     * Clear the deduplication cache immediately.
     * Useful in tests or after a forced re-identification.
     */
    clearDedupCache(): void;
    /**
     * Return the metrics summary from the current metrics sink, if supported.
     *
     * @returns The object returned by `metrics.getSummary()`, or `null` if the
     *   current metrics implementation does not expose a summary.
     */
    getMetricsSummary(): Record<string, any> | null;
}
//# sourceMappingURL=DeviceManager.d.ts.map