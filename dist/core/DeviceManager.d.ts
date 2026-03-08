import type { StorageAdapter } from "../types/storage.js";
import type { FPDataSet } from "../types/data.js";
import { ObservabilityOptions } from "../types/observability.js";
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
     * @param adapter - Storage backend used for all persistence operations.
     * @param context - Optional tuning parameters and observability overrides.
     * @param context.matchThreshold - Minimum confidence score (0–100) required
     *   to consider two fingerprints the same device. Defaults to `50`.
     * @param context.candidateMinScore - Minimum score (0–100) passed to the
     *   adapter's pre-filter step. Defaults to `30`.
     * @param context.logger - Custom logger; falls back to {@link defaultLogger}.
     * @param context.metrics - Custom metrics sink; falls back to {@link defaultMetrics}.
     */
    constructor(adapter: StorageAdapter, context?: {
        matchThreshold?: number;
        candidateMinScore?: number;
    } & ObservabilityOptions);
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
    identify(incoming: FPDataSet, context?: {
        userId?: string;
        ip?: string;
    }): Promise<{
        deviceId: string;
        confidence: number;
        isNewDevice: boolean;
        linkedUserId: string | undefined;
    }>;
    /**
     * Return the metrics summary from the current metrics sink, if supported.
     *
     * @returns The object returned by `metrics.getSummary()`, or `null` if the
     *   current metrics implementation does not expose a summary.
     */
    getMetricsSummary(): Record<string, any> | null;
}
//# sourceMappingURL=DeviceManager.d.ts.map