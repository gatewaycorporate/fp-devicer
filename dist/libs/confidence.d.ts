import { FPDataSet, ComparisonOptions, FieldStabilityMap, ScoreBreakdown } from "../types/data.js";
/**
 * Default half-life for the temporal decay curve.
 * A candidate snapshot that is exactly this old will have its decayable
 * dimension weights scaled to `e^-1 ≈ 0.368`.
 */
export declare const DEFAULT_DECAY_HALF_LIFE_MS: number;
/**
 * Compute the exponential temporal decay factor for a snapshot of the given age.
 *
 * Returns `1.0` for a fresh snapshot (age ≤ 0) and approaches `0` as the
 * snapshot ages. The formula is `e^(-snapshotAgeMs / halfLifeMs)`.
 *
 * @param snapshotAgeMs  - Age of the snapshot in milliseconds.
 * @param halfLifeMs     - Half-life in milliseconds (default: {@link DEFAULT_DECAY_HALF_LIFE_MS}).
 * @returns A decay factor in `(0, 1]`.
 */
export declare function computeTemporalDecayFactor(snapshotAgeMs: number, halfLifeMs?: number): number;
/**
 * Baseline field weights used when neither the global registry nor a local
 * override provides a weight for a given path. Higher numbers cause a field
 * to have a larger influence on the final confidence score.
 *
 * Exported so consumers (e.g. `DeviceManager`) can derive adaptive per-device
 * weights by scaling these defaults against observed per-field signal stability.
 */
export declare const DEFAULT_WEIGHTS: Record<string, number>;
type DimensionWeights = Record<Exclude<keyof ScoreBreakdown, "composite">, number>;
/**
 * Measure how much usable fingerprint data is present in a single snapshot.
 *
 * The score is the percentage of modeled top-level fields that are populated.
 */
export declare function computeEvidenceRichness(data: FPDataSet): number;
/**
 * Measure how many comparable fields agree strongly between two fingerprints.
 *
 * A field is counted as matching when its similarity score is at least `0.9`.
 */
export declare function computeFieldAgreement(data1: FPDataSet, data2: FPDataSet, options?: ComparisonOptions): number;
/**
 * Score agreement across the subset of fields considered structurally stable.
 *
 * This emphasizes properties such as screen characteristics, CPU concurrency,
 * memory, platform, and high-entropy client hints.
 */
export declare function computeStructuralStability(data1: FPDataSet, data2: FPDataSet, options?: ComparisonOptions): number;
/**
 * Score agreement across high-entropy rendering signals such as canvas, WebGL, and audio.
 */
export declare function computeEntropyContribution(data1: FPDataSet, data2: FPDataSet, options?: ComparisonOptions): number;
/**
 * Estimate how generic and collision-prone a fingerprint appears to be.
 *
 * Higher scores indicate common platform/language/browser combinations and a
 * lack of distinctive rendering signals.
 */
export declare function computeAttractorRisk(data: FPDataSet): number;
/** Return the percentage of modeled fields that are present on only one side of the comparison. */
export declare function computeMissingOneSide(data1: FPDataSet, data2: FPDataSet): number;
/** Return the percentage of modeled fields that are absent from both fingerprints. */
export declare function computeMissingBothSides(data1: FPDataSet, data2: FPDataSet): number;
/**
 * Derive per-dimension scaling factors from historical field stabilities.
 *
 * Stable devices keep full weight across all dimensions, while volatile devices
 * down-weight dimensions that rely on unstable fields.
 */
export declare function computeAdaptiveStabilityWeights(stabilities?: FieldStabilityMap): DimensionWeights;
/**
 * Compute the full multi-dimensional score breakdown for two fingerprints.
 *
 * The breakdown combines structural similarity, evidence richness, agreement on
 * stable and high-entropy fields, attractor risk, missing-data penalties, and
 * optional temporal decay based on snapshot age.
 *
 * @param data1 - Incoming or reference fingerprint.
 * @param data2 - Candidate fingerprint to compare against.
 * @param options - Comparison overrides including weights, comparators, stabilities, and decay settings.
 * @returns Normalized component scores plus the final `composite` confidence score.
 */
export declare function calculateScoreBreakdown(data1: FPDataSet, data2: FPDataSet, options?: ComparisonOptions): ScoreBreakdown;
/**
 * Factory that creates a stateless fingerprint confidence calculator.
 *
 * The returned object exposes `calculateConfidence(data1, data2)` and
 * `calculateScoreBreakdown(data1, data2)` methods.
 *
 * @param userOptions - Optional configuration overrides.
 * @returns Calculator methods for confidence scoring.
 */
export declare function createConfidenceCalculator(userOptions?: ComparisonOptions): {
    calculateScoreBreakdown(data1: FPDataSet, data2: FPDataSet): ScoreBreakdown;
    calculateConfidence(data1: FPDataSet, data2: FPDataSet): number;
};
/**
 * Pre-built confidence calculator using all default settings.
 *
 * Equivalent to `createConfidenceCalculator().calculateConfidence`.
 * Suitable for quick comparisons without custom weights or comparators.
 *
 * @param data1 - Reference fingerprint.
 * @param data2 - Incoming fingerprint.
 * @returns Confidence score in `[0, 100]`.
 */
export declare const calculateConfidence: (data1: FPDataSet, data2: FPDataSet) => number;
export {};
//# sourceMappingURL=confidence.d.ts.map