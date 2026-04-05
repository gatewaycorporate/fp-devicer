/**
 * Raw browser fingerprint data collected from a user's device.
 * Encompasses navigator properties, screen metrics, installed plugins,
 * font enumeration, and high-entropy client hints.
 */
export interface MouseBehaviorMetrics {
    sampleCount: number;
    avgVelocityPxMs: number;
    velocityStdDev: number;
    straightnessRatio: number;
    avgAcceleration: number;
    hasMovement: boolean;
}
export interface KeyboardBehaviorMetrics {
    keystrokeCount: number;
    avgDwellMs: number;
    dwellStdDev: number;
    avgFlightMs: number;
    flightStdDev: number;
    estimatedWpm: number;
}
export interface ScrollBehaviorMetrics {
    eventCount: number;
    avgVelocityPxMs: number;
    velocityStdDev: number;
    directionChangeCount: number;
    totalDistancePx: number;
}
export interface SessionTimingMetrics {
    sessionDurationMs: number;
    timeToFirstInteractionMs: number | null;
    interactionEventCount: number;
    touchEventCount: number;
}
export interface BehavioralMetrics {
    mouse?: MouseBehaviorMetrics;
    keyboard?: KeyboardBehaviorMetrics;
    scroll?: ScrollBehaviorMetrics;
    session: SessionTimingMetrics;
    collectionDurationMs: number;
    hasTouchEvents: boolean;
}
export interface FPUserDataSet {
    userAgent?: string;
    platform?: string;
    timezone?: string;
    language?: string;
    languages?: string[];
    cookieEnabled?: boolean;
    doNotTrack?: string | boolean;
    hardwareConcurrency?: number;
    deviceMemory?: number | string;
    product?: string;
    productSub?: string;
    vendor?: string;
    vendorSub?: string;
    appName?: string;
    appVersion?: string;
    appCodeName?: string;
    appMinorVersion?: string;
    buildID?: string;
    plugins?: {
        name: string;
        description: string;
    }[];
    mimeTypes?: {
        type: string;
        suffixes: string;
        description: string;
    }[];
    screen?: {
        width: number;
        height: number;
        colorDepth?: number;
        pixelDepth?: number;
        orientation?: {
            type: string;
            angle: number;
        };
    };
    fonts?: string[];
    canvas?: string;
    webgl?: string;
    audio?: string;
    highEntropyValues?: {
        architecture?: string;
        bitness?: string;
        brands?: {
            brand: string;
            version: string;
        }[];
        mobile?: boolean;
        model?: string;
        platform?: string;
        platformVersion?: string;
        uaFullVersion?: string;
    };
    behavioralMetrics?: BehavioralMetrics;
}
/**
 * Generic fingerprint dataset type.
 * Defaults to {@link FPUserDataSet} but can be substituted with any
 * `Record`-shaped type to support custom fingerprint schemas.
 *
 * @template T - The underlying dataset shape. Must extend `Record<string, any>`.
 */
export type FPDataSet<T extends Record<string, any> = FPUserDataSet> = T;
/**
 * A field-level similarity function used by the confidence calculator.
 *
 * @param value1 - The first value to compare.
 * @param value2 - The second value to compare.
 * @param path - Dot-notation path of the field being compared (e.g. `"screen.width"`).
 * @returns A normalised similarity score in the range `[0, 1]` where
 *   `1` means identical and `0` means completely dissimilar.
 */
export type Comparator = (value1: any, value2: any, path?: string) => number;
/**
 * Field-level stability map used to adapt scoring weights over historical
 * fingerprint windows.
 */
export interface FieldStabilityMap {
    [path: string]: number;
}
/**
 * Pluggable attractor-risk model, used to replace the built-in heuristic
 * with a frequency table derived from actual traffic.
 *
 * @see {@link createFrequencyTableAttractorModel} for a factory that builds a
 *   model from observed platform/resolution/language/browser frequency data.
 */
export interface AttractorModel {
    /**
     * Score the given fingerprint on the attractor-risk axis.
     * @param fp - The fingerprint to evaluate.
     * @returns A normalised risk score in `[0, 100]` where `100` is the
     *   most-generic, collision-prone profile possible.
     */
    score(fp: FPDataSet): number;
}
/**
 * Multi-dimensional explanation of a fingerprint comparison result.
 *
 * All values are normalised to the range `[0, 100]`.
 */
export interface ScoreBreakdown {
    deviceSimilarity: number;
    evidenceRichness: number;
    fieldAgreement: number;
    structuralStability: number;
    entropyContribution: number;
    attractorRisk: number;
    missingOneSide: number;
    missingBothSides: number;
    composite: number;
}
/**
 * Configuration options for {@link createConfidenceCalculator}.
 * All properties are optional; unset values fall back to global registry
 * defaults or built-in defaults.
 */
export interface ComparisonOptions {
    /** Field/path weights (higher = more important). Will be normalized automatically. */
    weights?: Record<string, number>;
    /** Custom similarity functions (your plugin system) */
    comparators?: Record<string, Comparator>;
    /** Optional field-level stability map used to adapt dimension weights. */
    stabilities?: FieldStabilityMap;
    /** Fallback weight for any field without an explicit weight */
    defaultWeight?: number;
    /** How much weight to give the TLSH hash component (0–1) */
    tlshWeight?: number;
    /** Max recursion depth for nested objects/arrays */
    maxDepth?: number;
    /** Whether this calculator should use the global registry (default: true) */
    useGlobalRegistry?: boolean;
    /**
     * Age of the stored snapshot being compared, in milliseconds.
     * When provided, temporal decay is applied: old volatile-signal agreement
     * contributes less to the positive score, and mismatches against old
     * snapshots are penalised less. Defaults to `0` (no decay).
     */
    snapshotAgeMs?: number;
    /**
     * Half-life for the exponential temporal decay curve, in milliseconds.
     * A snapshot whose age equals `decayHalfLifeMs` will have its decayable
     * dimension weights scaled by `e^-1 ≈ 0.368`.
     * Defaults to {@link DEFAULT_DECAY_HALF_LIFE_MS} (30 days).
     */
    decayHalfLifeMs?: number;
    /** Custom attractor risk model. If omitted, the built-in heuristic is used. */
    attractorModel?: AttractorModel;
}
//# sourceMappingURL=data.d.ts.map