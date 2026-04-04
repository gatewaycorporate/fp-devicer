import type { StorageAdapter } from "../types/storage.js";
import type { FPDataSet } from "../types/data.js";
import type { DriftAnalysisOptions, DriftReport } from "../types/drift.js";
import type { RelatedDevice } from "../types/identity-graph.js";
import type { LshOptions } from "../libs/lsh-index.js";
import { IdentityGraph } from "../libs/identity-graph.js";
import { ObservabilityOptions } from "../types/observability.js";
import { DeviceManagerPlugin } from "./PluginRegistrar.js";
export interface IdentifyEnrichmentInfo {
    plugins: string[];
    details: Record<string, Record<string, unknown>>;
    failures: Array<{
        plugin: string;
        message: string;
    }>;
}
export type IdentifyContext = Record<string, unknown> & {
    userId?: string;
    ip?: string;
};
export interface IdentifyPostProcessorPayload {
    incoming: FPDataSet;
    context?: IdentifyContext;
    result: IdentifyResult;
    baseResult: IdentifyResult;
    cacheHit: boolean;
    candidatesCount: number;
    matched: boolean;
    durationMs: number;
}
export interface IdentifyPostProcessorResult {
    result?: Record<string, unknown>;
    enrichmentInfo?: Record<string, unknown>;
    logMeta?: Record<string, unknown>;
}
export type IdentifyPostProcessor = (payload: IdentifyPostProcessorPayload) => Promise<IdentifyPostProcessorResult | void> | IdentifyPostProcessorResult | void;
/**
 * Minimal structural interface that plugins depend on.
 * Avoids a hard circular import between PluginRegistrar and DeviceManager.
 */
export interface DeviceManagerLike {
    registerIdentifyPostProcessor(name: string, processor: IdentifyPostProcessor): () => void;
}
/** Return type of {@link DeviceManager.identify}. */
export interface IdentifyResult {
    deviceId: string;
    confidence: number;
    isNewDevice: boolean;
    /** Mirror of `confidence`; also persisted on the saved snapshot for drift tracking. */
    matchConfidence: number;
    linkedUserId?: string;
    enrichmentInfo: IdentifyEnrichmentInfo;
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
    private identifyPostProcessors;
    private readonly pluginRegistrar;
    /**
     * Cache entry for the deduplication window (feature #8).
     * Keyed by the TLSH hash of the incoming fingerprint.
     */
    private dedupCache;
    /** Cross-device identity graph, updated on every identify call. */
    private readonly identityGraph;
    /**
     * Recent mapping from IP `/24` subnet → list of device IDs seen from that
     * subnet. Used to add shared-IP-subnet identity edges.
     */
    private readonly subnetDevices;
    /**
     * Optional LSH candidate index populated by {@link buildLshIndex}.
     * When present, `identify()` merges LSH-retrieved candidates with those
     * returned by the storage adapter's built-in pre-filter.
     */
    private lshIndex?;
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
    private createEmptyEnrichmentInfo;
    private cloneResultForRequest;
    private applyIdentifyPostProcessors;
    registerIdentifyPostProcessor(name: string, processor: IdentifyPostProcessor): () => void;
    /**
     * Register a plugin with this DeviceManager.
     *
     * The plugin's {@link DeviceManagerPlugin.registerWith} method is called
     * immediately with this instance. Returns an unregister function that removes
     * the plugin and calls any teardown returned by `registerWith`.
     *
     * @param plugin - Any object implementing {@link DeviceManagerPlugin}.
     * @returns A `() => void` that unregisters the plugin.
     */
    use(plugin: DeviceManagerPlugin): () => void;
    /**
     * Returns the list of currently registered plugins (those not yet unregistered).
     */
    getPlugins(): readonly DeviceManagerPlugin[];
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
    identify(incoming: FPDataSet, context?: IdentifyContext): Promise<IdentifyResult>;
    /**
     * Identify multiple devices in a batch.
     *
     * @param incomingList - An array of fingerprint data sets to identify.
     * @param context - Optional context including userId and IP address.
     * @returns A promise that resolves to an array of identification results.
     */
    identifyMany(incomingList: FPDataSet[], context?: IdentifyContext): Promise<IdentifyResult[]>;
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
    /**
     * Analyse how anomalous an incoming fingerprint is relative to a known
     * device's historical baseline.
     *
     * For each tracked fingerprint field, a z-score analog is computed as
     * `deviation / (1 – historicalStability + ε)`. Fields that have been
     * historically stable yet are now different receive a high z-score and are
     * listed in `DriftReport.suspiciousFields`. The aggregate `driftScore` is a
     * weighted average of all per-field z-scores, normalised to `[0, 100]`.
     *
     * A `DriftReport` is classified into one of four patterns:
     * - `NORMAL_AGING`        – score < 30; expected gradual change
     * - `INCREMENTAL_DRIFT`   – score 30–54; broad multi-field change
     * - `ABRUPT_CHANGE`       – score 55–74; concentrated in few fields
     * - `CANONICAL_INJECTION` – score ≥ 75 + high attractor risk; evasion signal
     *
     * @param deviceId  - The stable device identifier to measure against.
     * @param incoming  - The new fingerprint to evaluate.
     * @param options   - Optional overrides for window size and z-score threshold.
     * @returns A {@link DriftReport}, or `null` if no history exists for the device.
     */
    analyzeDeviceDrift(deviceId: string, incoming: FPDataSet, options?: DriftAnalysisOptions): Promise<DriftReport | null>;
    /**
     * Return the list of devices that are related to `deviceId` via the
     * in-process identity graph, sorted by descending edge weight.
     *
     * Edges are built from two signal types observed during `identify()` calls:
     * - **shared-ip-subnet**: two devices seen from the same IPv4 `/24` subnet.
     * - **font-overlap**: two distinct devices with ≥ 80 % Jaccard font
     *   similarity in a session where they were both scored but only one matched.
     *
     * @param deviceId - The device to look up.
     * @returns        An array of {@link RelatedDevice}, or an empty array if
     *                 no edges are known for this device.
     */
    findRelatedDevices(deviceId: string): RelatedDevice[];
    /**
     * Return the internal {@link IdentityGraph} instance.
     *
     * Useful for inspecting raw edges, serialising graph state, or pruning
     * stale edges via {@link IdentityGraph.prune}.
     */
    getIdentityGraph(): IdentityGraph;
    /**
     * Build (or rebuild) the in-memory LSH candidate index from all snapshots
     * currently held by the storage adapter.
     *
     * When the index is present, every {@link identify} call merges LSH-derived
     * candidates with those returned by the adapter's own pre-filter, giving a
     * higher recall for devices whose similarity is concentrated in set-valued
     * fields (`fonts`, `plugins`, `mimeTypes`, `languages`) that the adapter
     * pre-filter may not consider.
     *
     * The method subscribes to O(n) storage reads; avoid calling it on very
     * large datasets without pagination/sampling.  The index is not kept in
     * sync automatically — call `buildLshIndex` again after significant dataset
     * growth, or after bulk imports.
     *
     * @param options - Optional LSH tuning parameters.
     */
    buildLshIndex(options?: LshOptions): Promise<void>;
    /**
     * Return the number of devices currently indexed in the LSH index, or
     * `undefined` if {@link buildLshIndex} has not yet been called.
     */
    getLshIndexSize(): number | undefined;
}
//# sourceMappingURL=DeviceManager.d.ts.map