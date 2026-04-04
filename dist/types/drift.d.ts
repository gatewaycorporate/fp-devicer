/**
 * Describes an anomalous change in a single fingerprint field relative to a
 * device's historical baseline.
 */
export interface SuspiciousField {
    /** Dot-notation path of the anomalous field (e.g. `"canvas"`, `"screen.width"`). */
    field: string;
    /**
     * How stable this field was across the device's historical snapshots.
     * `1.0` = never changed; `0.0` = always different between consecutive visits.
     */
    historicalStability: number;
    /**
     * How much the incoming value deviates from the historical distribution.
     * Computed as `1 – average(similarity(incoming, historical[i]))` over all
     * history entries where both values are present. `0.0` = identical to history;
     * `1.0` = completely different.
     */
    currentDeviation: number;
    /**
     * Normalised anomaly score: `deviation / (1 – historicalStability + ε)`.
     * A value of `1.0` means the field changed by exactly as much as expected
     * from its own historical variance. Values above `1.5` are flagged as
     * suspicious. Values above `3.0` indicate a near-impossible change for a
     * field that has historically been fully stable.
     */
    zScore: number;
}
/**
 * Characterises the overall nature of the detected drift.
 *
 * - `NORMAL_AGING`       – low drift; changes consistent with natural browser /
 *                          OS evolution over time.
 * - `INCREMENTAL_DRIFT`  – moderate drift spread across many fields; consistent
 *                          with a gradual environment change (new OS, reinstall).
 * - `ABRUPT_CHANGE`      – high drift concentrated in a small number of fields;
 *                          consistent with targeted signal manipulation or a
 *                          single disruptive event.
 * - `CANONICAL_INJECTION` – very high drift, and the incoming fingerprint
 *                          matches a well-known attractor profile; strongly
 *                          consistent with automated tooling or evasion.
 */
export type DriftPatternFlag = 'NORMAL_AGING' | 'INCREMENTAL_DRIFT' | 'ABRUPT_CHANGE' | 'CANONICAL_INJECTION';
/**
 * Options for controlling the drift analysis computation.
 */
export interface DriftAnalysisOptions {
    /**
     * Maximum number of historical snapshots to load from storage.
     * Defaults to `10`.
     */
    stabilityWindowSize?: number;
    /**
     * Minimum z-score for a field to be included in `suspiciousFields`.
     * Defaults to `1.5`.
     */
    suspiciousZScoreThreshold?: number;
}
/**
 * Full result of a {@link DeviceManager.analyzeDeviceDrift} call.
 */
export interface DriftReport {
    /** The stable device identifier that was analysed. */
    deviceId: string;
    /**
     * Aggregate anomaly score in `[0, 100]`. Higher values indicate that the
     * incoming fingerprint is more anomalous relative to this device's baseline.
     * Scores ≥ 60 warrant investigation.
     */
    driftScore: number;
    /**
     * Fields whose z-score exceeded the suspicious threshold, sorted by
     * descending z-score.
     */
    suspiciousFields: SuspiciousField[];
    /** Qualitative classification of the detected drift pattern. */
    patternFlag: DriftPatternFlag;
    /** Number of historical snapshots used to compute the baseline. */
    snapshotsAnalyzed: number;
    /**
     * Duration of the history window in milliseconds — the elapsed time between
     * the oldest and newest snapshot used in the analysis.
     */
    baselineWindowMs: number;
}
//# sourceMappingURL=drift.d.ts.map