import type { StorageAdapter, DeviceMatch, StoredFingerprint } from "../types/storage.js";
import type { FPDataSet } from "../types/data.js";
import type { DriftAnalysisOptions, DriftReport } from "../types/drift.js";
import type { RelatedDevice } from "../types/identity-graph.js";
import type { LshIndex, LshOptions } from "../libs/lsh-index.js";
import { calculateConfidence, createConfidenceCalculator, DEFAULT_WEIGHTS } from "../libs/confidence.js";
import { computeDeviceDrift } from "../libs/drift.js";
import { IdentityGraph, subnetKey, jaccardSimilarity } from "../libs/identity-graph.js";
import { buildLshIndex } from "../libs/lsh-index.js";
import { getFingerprintHash } from "../libs/fingerprint-hash.js";
import { getGlobalRegistry } from "../libs/registry.js";
import { randomUUID } from "crypto";
import { Logger, Metrics, ObservabilityOptions } from "../types/observability.js";
import { defaultLogger, defaultMetrics } from "../libs/default-observability.js";
import { PluginRegistrar, DeviceManagerPlugin } from "./PluginRegistrar.js";

export interface IdentifyEnrichmentInfo {
  plugins: string[];
  details: Record<string, Record<string, unknown>>;
  failures: Array<{ plugin: string; message: string }>;
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

export type IdentifyPostProcessor = (
  payload: IdentifyPostProcessorPayload
) => Promise<IdentifyPostProcessorResult | void> | IdentifyPostProcessorResult | void;

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
export class DeviceManager {
  private logger: Logger;
  private metrics: Metrics;
  private identifyPostProcessors: Array<{ name: string; processor: IdentifyPostProcessor }> = [];
  private readonly pluginRegistrar = new PluginRegistrar();

  /**
   * Cache entry for the deduplication window (feature #8).
   * Keyed by the TLSH hash of the incoming fingerprint.
   */
  private dedupCache = new Map<string, { result: IdentifyResult; expiresAt: number }>();

  /** Cross-device identity graph, updated on every identify call. */
  private readonly identityGraph = new IdentityGraph();

  /**
   * Recent mapping from IP `/24` subnet → list of device IDs seen from that
   * subnet. Used to add shared-IP-subnet identity edges.
   */
  private readonly subnetDevices = new Map<string, string[]>();

  /**
   * Optional LSH candidate index populated by {@link buildLshIndex}.
   * When present, `identify()` merges LSH-retrieved candidates with those
   * returned by the storage adapter's built-in pre-filter.
   */
  private lshIndex?: LshIndex;

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
  constructor(private adapter: StorageAdapter, private context: {
    matchThreshold?: number;
    candidateMinScore?: number;
    /** Number of historical snapshots used for adaptive weight computation. Default `5`. */
    stabilityWindowSize?: number;
    /** Dedup window in ms; repeated identifies within this window skip DB writes. Default `5000`. Set `0` to disable. */
    dedupWindowMs?: number;
  } & ObservabilityOptions = {}) {
    this.context.matchThreshold ??= 50;
    this.context.candidateMinScore ??= 30;
    this.context.stabilityWindowSize ??= 5;
    this.context.dedupWindowMs ??= 5000;
    this.logger = this.context.logger ?? defaultLogger;
    this.metrics = this.context.metrics ?? defaultMetrics;
  }

  private createEmptyEnrichmentInfo(): IdentifyEnrichmentInfo {
    return {
      plugins: [],
      details: {},
      failures: [],
    };
  }

  private cloneResultForRequest(baseResult: IdentifyResult, context?: IdentifyContext): IdentifyResult {
    return {
      ...baseResult,
      linkedUserId: context?.userId,
      enrichmentInfo: this.createEmptyEnrichmentInfo(),
    };
  }

  private async applyIdentifyPostProcessors(
    baseResult: IdentifyResult,
    incoming: FPDataSet,
    context: IdentifyContext | undefined,
    execution: { cacheHit: boolean; candidatesCount: number; matched: boolean; durationMs: number }
  ): Promise<{ result: IdentifyResult; logMeta: Record<string, Record<string, unknown>> }> {
    let result = this.cloneResultForRequest(baseResult, context);
    const logMeta: Record<string, Record<string, unknown>> = {};

    for (const { name, processor } of this.identifyPostProcessors) {
      try {
        const processed = await processor({
          incoming,
          context,
          result,
          baseResult: this.cloneResultForRequest(baseResult, context),
          cacheHit: execution.cacheHit,
          candidatesCount: execution.candidatesCount,
          matched: execution.matched,
          durationMs: execution.durationMs,
        });

        if (!processed) {
          continue;
        }

        result = {
          ...result,
          ...(processed.result ?? {}),
          enrichmentInfo: result.enrichmentInfo,
        } as IdentifyResult;

        if (!result.enrichmentInfo.plugins.includes(name)) {
          result.enrichmentInfo.plugins.push(name);
        }

        if (processed.enrichmentInfo) {
          result.enrichmentInfo.details[name] = processed.enrichmentInfo;
        }

        if (processed.logMeta) {
          logMeta[name] = processed.logMeta;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.enrichmentInfo.failures.push({ plugin: name, message });
        this.logger.warn("Identify post-processor failed", { plugin: name, message });
      }
    }

    return { result, logMeta };
  }

  registerIdentifyPostProcessor(name: string, processor: IdentifyPostProcessor): () => void {
    this.identifyPostProcessors.push({ name, processor });
    return () => {
      this.identifyPostProcessors = this.identifyPostProcessors.filter(
        (registered) => registered.name !== name || registered.processor !== processor
      );
    };
  }

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
  use(plugin: DeviceManagerPlugin): () => void {
    return this.pluginRegistrar.register(this, plugin);
  }

  /**
   * Returns the list of currently registered plugins (those not yet unregistered).
   */
  getPlugins(): readonly DeviceManagerPlugin[] {
    return this.pluginRegistrar.getRegisteredPlugins();
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
  private computeFieldStabilities(snapshots: StoredFingerprint[]): Record<string, number> {
    if (snapshots.length < 2) return {};
    const registry = getGlobalRegistry();
    const stabilities: Record<string, number> = {};

    for (const field of Object.keys(DEFAULT_WEIGHTS)) {
      const comparator = registry.comparators[field] ?? ((a: any, b: any) => Number(a === b));
      let total = 0;
      let count = 0;
      for (let i = 0; i < snapshots.length - 1; i++) {
        const v1 = (snapshots[i].fingerprint as any)[field];
        const v2 = (snapshots[i + 1].fingerprint as any)[field];
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
  async identify(incoming: FPDataSet, context?: IdentifyContext): Promise<IdentifyResult> {
    const start = performance.now();
    const fingerprintHash = getFingerprintHash(incoming);

    // --- #8 Dedup cache check ---
    const dedupWindowMs = this.context.dedupWindowMs!;
    const cacheKey = fingerprintHash ?? null;
    let baseResult: IdentifyResult | null = null;
    let cacheHit = false;
    let candidatesCount = 0;
    if (dedupWindowMs > 0 && cacheKey) {
      const cached = this.dedupCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        this.logger.debug!("Dedup cache hit — skipping DB write", { cacheKey });
        baseResult = cached.result;
        cacheHit = true;
      }
    }

    this.logger.debug!("Device identification started", { userId: context?.userId, ip: context?.ip });

    if (!baseResult) {
      // 1a. Adapter pre-filter (screen, hardwareConcurrency, etc.) → candidates
      const adapterCandidates = await this.adapter.findCandidates(incoming, this.context.candidateMinScore!, 100);

      // 1b. LSH candidate augmentation — merge any extra device IDs surfaced by
      //     the LSH index (set-similarity over fonts/plugins/mimeTypes/languages)
      //     that the adapter's pre-filter may have missed.
      let candidates = adapterCandidates;
      if (this.lshIndex) {
        const adapterIds = new Set(adapterCandidates.map((c) => c.deviceId));
        const lshIds = this.lshIndex.query(incoming);
        const extraIds = lshIds.filter((id) => !adapterIds.has(id));
        if (extraIds.length > 0) {
          const extraCandidates: DeviceMatch[] = extraIds.map((deviceId) => ({
            deviceId,
            confidence: 0,   // will be re-scored by full scoring pass
            lastSeen: new Date(0),
          }));
          candidates = [...adapterCandidates, ...extraCandidates];
        }
      }
      candidatesCount = candidates.length;

      // 2. Full scoring with optional adaptive weights
      const windowSize = this.context.stabilityWindowSize!;
      let bestMatch: DeviceMatch | null = null;
      for (const cand of candidates) {
        const rawHistory = await this.adapter.getHistory(cand.deviceId, windowSize);
        if (!rawHistory.length) continue;

        // Normalise to newest-first so history[0] is always the most recent
        // snapshot regardless of adapter ordering (SQLite = DESC, inmemory = ASC).
        const history = [...rawHistory].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

        // Build a per-device confidence scorer that down-weights unstable fields
        // and accounts for the age of the most-recent snapshot being scored against.
        const snapshotAgeMs = Date.now() - history[0].timestamp.getTime();
        let scorer = calculateConfidence;
        if (history.length >= 2) {
          const stabilities = this.computeFieldStabilities(history);
          const adaptedWeights: Record<string, number> = {};
          for (const [field, baseWeight] of Object.entries(DEFAULT_WEIGHTS)) {
            adaptedWeights[field] = baseWeight * (stabilities[field] ?? 1);
          }
          scorer = createConfidenceCalculator({ weights: adaptedWeights, snapshotAgeMs }).calculateConfidence;
        } else {
          // Even with a single snapshot, apply temporal decay so a stale first
          // impression doesn't over-confidently match a new incoming request.
          scorer = createConfidenceCalculator({ snapshotAgeMs }).calculateConfidence;
        }

        // Score against the most-recent snapshot (history is newest-first)
        const score = scorer(incoming, history[0].fingerprint);
        if (score > (bestMatch?.confidence ?? 0)) {
          bestMatch = { ...cand, confidence: score };
        }
      }

      const isMatched = !!(bestMatch && bestMatch.confidence > this.context.matchThreshold!);
      const deviceId = isMatched ? bestMatch!.deviceId : `dev_${randomUUID()}`;
      const isNewDevice = !isMatched;
      const finalConfidence = bestMatch?.confidence ?? 0;

      // 3. Save — include matchConfidence for drift tracking (#7)
      await this.adapter.save({
        id: randomUUID(),
        deviceId,
        userId: context?.userId,
        timestamp: new Date(),
        fingerprint: incoming,
        ip: context?.ip,
        signalsHash: fingerprintHash,
        matchConfidence: finalConfidence,
      });

      baseResult = {
        deviceId,
        confidence: finalConfidence,
        isNewDevice,
        matchConfidence: finalConfidence,
        enrichmentInfo: this.createEmptyEnrichmentInfo(),
      };

      if (dedupWindowMs > 0 && cacheKey) {
        this.dedupCache.set(cacheKey, { result: baseResult, expiresAt: Date.now() + dedupWindowMs });
      }

      // ── Identity graph update ────────────────────────────────────────────
      // 1. IP-subnet edge: link this device to others seen from the same /24.
      const ip = context?.ip;
      if (ip) {
        const subnet = subnetKey(ip);
        if (subnet) {
          const peersInSubnet = this.subnetDevices.get(subnet) ?? [];
          for (const peerId of peersInSubnet) {
            if (peerId !== deviceId) {
              this.identityGraph.addEdge(deviceId, peerId, "shared-ip-subnet", 0.4);
            }
          }
          if (!peersInSubnet.includes(deviceId)) {
            peersInSubnet.push(deviceId);
            // Keep per-subnet list bounded to avoid unbounded growth.
            if (peersInSubnet.length > 200) peersInSubnet.shift();
            this.subnetDevices.set(subnet, peersInSubnet);
          }
        }
      }

      // 2. Font-overlap edge: among scored candidates that were NOT matched,
      //    add a weak edge when font Jaccard similarity is high.
      const incomingFonts: string[] = Array.isArray((incoming as any).fonts)
        ? (incoming as any).fonts
        : [];
      if (incomingFonts.length > 0) {
        for (const cand of candidates) {
          if (cand.deviceId === deviceId) continue; // skip matched device
          const candHistory = await this.adapter.getHistory(cand.deviceId, 1);
          if (!candHistory.length) continue;
          const candFonts: string[] = Array.isArray((candHistory[0].fingerprint as any).fonts)
            ? (candHistory[0].fingerprint as any).fonts
            : [];
          const jaccard = jaccardSimilarity(incomingFonts, candFonts);
          if (jaccard >= 0.8) {
            this.identityGraph.addEdge(deviceId, cand.deviceId, "font-overlap", jaccard * 0.3);
          }
        }
      }
    }

    const durationMs = performance.now() - start;
    const matched = !baseResult.isNewDevice;
    const { result, logMeta } = await this.applyIdentifyPostProcessors(baseResult, incoming, context, {
      cacheHit,
      candidatesCount,
      matched,
      durationMs,
    });

    this.metrics.recordIdentify(
      durationMs,
      result.confidence,
      result.isNewDevice,
      candidatesCount,
      matched
    );

    this.logger.info('Device identification completed', {
      deviceId: result.deviceId,
      confidence: result.confidence,
      isNewDevice: result.isNewDevice,
      candidates: candidatesCount,
      durationMs: Math.round(durationMs),
      cacheHit,
      enrichmentInfo: result.enrichmentInfo,
      pluginLogMeta: logMeta,
    });

    return result;
  }

	/**
	 * Identify multiple devices in a batch.
	 *
	 * @param incomingList - An array of fingerprint data sets to identify.
	 * @param context - Optional context including userId and IP address.
	 * @returns A promise that resolves to an array of identification results.
	 */
  async identifyMany(incomingList: FPDataSet[], context?: IdentifyContext): Promise<IdentifyResult[]> {
		const results: IdentifyResult[] = [];
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
  clearDedupCache(): void {
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
  async analyzeDeviceDrift(
    deviceId: string,
    incoming: FPDataSet,
    options?: DriftAnalysisOptions
  ): Promise<DriftReport | null> {
    const windowSize = options?.stabilityWindowSize ?? 10;
    const history = await this.adapter.getHistory(deviceId, windowSize);
    if (history.length === 0) return null;

    const partial = computeDeviceDrift(incoming, history, options);
    return { deviceId, ...partial };
  }

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
  findRelatedDevices(deviceId: string): RelatedDevice[] {
    return this.identityGraph.getRelated(deviceId);
  }

  /**
   * Return the internal {@link IdentityGraph} instance.
   *
   * Useful for inspecting raw edges, serialising graph state, or pruning
   * stale edges via {@link IdentityGraph.prune}.
   */
  getIdentityGraph(): IdentityGraph {
    return this.identityGraph;
  }

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
  async buildLshIndex(options?: LshOptions): Promise<void> {
    const all = await this.adapter.getAllFingerprints();

    // Use only the most-recent snapshot per device (newest timestamp).
    const latestByDevice = new Map<string, { fingerprint: FPDataSet; ts: number }>();
    for (const snap of all) {
      const ts = snap.timestamp.getTime();
      const existing = latestByDevice.get(snap.deviceId);
      if (!existing || ts > existing.ts) {
        latestByDevice.set(snap.deviceId, { fingerprint: snap.fingerprint, ts });
      }
    }

    const entries = Array.from(latestByDevice.entries()).map(([deviceId, { fingerprint }]) => ({
      deviceId,
      fingerprint,
    }));

    this.lshIndex = buildLshIndex(entries, options);
  }

  /**
   * Return the number of devices currently indexed in the LSH index, or
   * `undefined` if {@link buildLshIndex} has not yet been called.
   */
  getLshIndexSize(): number | undefined {
    return this.lshIndex?.size();
  }
}