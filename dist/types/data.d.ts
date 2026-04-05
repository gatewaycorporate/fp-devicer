/** Aggregated pointer-movement metrics captured during fingerprint collection. */
export interface MouseBehaviorMetrics {
    /** Total pointer samples included in the aggregate. */
    sampleCount: number;
    /** Mean pointer velocity in pixels per millisecond. */
    avgVelocityPxMs: number;
    /** Standard deviation of pointer velocity samples. */
    velocityStdDev: number;
    /** Path efficiency ratio where values closer to `1` are straighter. */
    straightnessRatio: number;
    /** Mean pointer acceleration across the sampled movement events. */
    avgAcceleration: number;
    /** Whether any pointer movement was observed at all. */
    hasMovement: boolean;
}
/** Aggregate keystroke timing metrics derived from keyboard interactions. */
export interface KeyboardBehaviorMetrics {
    /** Number of keystrokes captured in the sample window. */
    keystrokeCount: number;
    /** Average key dwell time in milliseconds. */
    avgDwellMs: number;
    /** Standard deviation of dwell times. */
    dwellStdDev: number;
    /** Average flight time between key presses in milliseconds. */
    avgFlightMs: number;
    /** Standard deviation of flight times. */
    flightStdDev: number;
    /** Estimated typing speed in words per minute. */
    estimatedWpm: number;
}
/** Summary statistics for scroll behavior recorded during collection. */
export interface ScrollBehaviorMetrics {
    /** Number of scroll events observed. */
    eventCount: number;
    /** Average scroll velocity in pixels per millisecond. */
    avgVelocityPxMs: number;
    /** Standard deviation of scroll velocity. */
    velocityStdDev: number;
    /** Number of direction reversals across the sample window. */
    directionChangeCount: number;
    /** Total scroll distance accumulated in pixels. */
    totalDistancePx: number;
}
/** Timing metrics that describe session duration and interaction cadence. */
export interface SessionTimingMetrics {
    /** Total session duration in milliseconds. */
    sessionDurationMs: number;
    /** Delay until the first interaction, or `null` when no interaction occurred. */
    timeToFirstInteractionMs: number | null;
    /** Count of interaction events captured during the session. */
    interactionEventCount: number;
    /** Count of touch-specific events captured during the session. */
    touchEventCount: number;
}
/** Optional behavioral signals collected alongside the static browser fingerprint. */
export interface BehavioralMetrics {
    /** Pointer movement metrics when mouse or trackpad input was observed. */
    mouse?: MouseBehaviorMetrics;
    /** Keyboard timing metrics when key events were observed. */
    keyboard?: KeyboardBehaviorMetrics;
    /** Scroll interaction metrics when scrolling occurred. */
    scroll?: ScrollBehaviorMetrics;
    /** Session-level timing metrics, always present when behavioral collection ran. */
    session: SessionTimingMetrics;
    /** Total time spent collecting behavioral signals, in milliseconds. */
    collectionDurationMs: number;
    /** Whether touch events were observed during collection. */
    hasTouchEvents: boolean;
}
/**
 * Raw browser fingerprint data collected from a user's device.
 * Encompasses navigator properties, screen metrics, installed plugins,
 * rendering fingerprints, and optional behavioral signals.
 */
export interface FPUserDataSet {
    /** Full browser user-agent string. */
    userAgent?: string;
    /** Navigator platform value. */
    platform?: string;
    /** IANA time zone or equivalent browser-reported time zone. */
    timezone?: string;
    /** Primary browser language. */
    language?: string;
    /** Ordered browser language preferences. */
    languages?: string[];
    /** Whether cookies are enabled in the browser. */
    cookieEnabled?: boolean;
    /** Browser do-not-track preference. */
    doNotTrack?: string | boolean;
    /** Number of logical CPU cores reported by the browser. */
    hardwareConcurrency?: number;
    /** Approximate device memory as reported by client hints or navigator APIs. */
    deviceMemory?: number | string;
    /** Navigator product token. */
    product?: string;
    /** Navigator productSub token. */
    productSub?: string;
    /** Browser vendor string. */
    vendor?: string;
    /** Browser vendorSub string. */
    vendorSub?: string;
    /** Navigator appName value. */
    appName?: string;
    /** Navigator appVersion value. */
    appVersion?: string;
    /** Navigator appCodeName value. */
    appCodeName?: string;
    /** Legacy browser app minor version when available. */
    appMinorVersion?: string;
    /** Firefox-style build identifier when available. */
    buildID?: string;
    /** Installed browser plugins with names and descriptions. */
    plugins?: {
        name: string;
        description: string;
    }[];
    /** Registered MIME types exposed by the browser plugin system. */
    mimeTypes?: {
        type: string;
        suffixes: string;
        description: string;
    }[];
    /** Screen geometry and orientation metadata. */
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
    /** Enumerated font family names available to the page. */
    fonts?: string[];
    /** Canvas rendering fingerprint. */
    canvas?: string;
    /** WebGL rendering fingerprint. */
    webgl?: string;
    /** Audio fingerprint derived from a deterministic render pipeline. */
    audio?: string;
    /** High-entropy client hints and related browser-identifying signals. */
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
    /** Optional interactive behavior metrics collected during the session. */
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
    /** Stability score in `[0, 1]` for the field at the given dot-path. */
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