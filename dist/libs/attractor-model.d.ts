import type { FPDataSet, AttractorModel } from "../types/data.js";
/**
 * Attractor-risk model that wraps the built-in heuristic implemented in
 * {@link computeAttractorRisk}.
 *
 * This is the model used when no `attackorModel` is supplied to
 * {@link createConfidenceCalculator} or {@link calculateScoreBreakdown}.
 * Instantiating it explicitly is useful when mixing default and custom models
 * in the same application.
 */
export declare class DefaultAttractorModel implements AttractorModel {
    score(fp: FPDataSet): number;
}
/**
 * Frequency table used to describe how common each fingerprint signal is in
 * a specific user population.
 *
 * All frequency values should be normalised to `[0, 1]` where:
 * - `1.0` = present in every request in the population (maximum attractor risk)
 * - `0.0` = never seen in the population (no attractor risk)
 *
 * Omitting a dimension causes that dimension to fall back to the built-in
 * heuristic for that signal.
 */
export interface FrequencyTable {
    /**
     * Map of platform string → frequency, e.g.
     * `{ "Win32": 0.85, "MacIntel": 0.12 }`.
     */
    platforms?: Record<string, number>;
    /**
     * Map of `"WIDTHxHEIGHT"` resolution string → frequency, e.g.
     * `{ "1920x1080": 0.55, "1366x768": 0.13 }`.
     */
    resolutions?: Record<string, number>;
    /**
     * Map of primary language tag → frequency, e.g.
     * `{ "en-US": 0.72, "en-GB": 0.08, "fr-FR": 0.05 }`.
     */
    languages?: Record<string, number>;
    /**
     * Map of browser keyword (matched case-insensitively in the user-agent) →
     * frequency, e.g. `{ "chrome": 0.63, "safari": 0.19, "firefox": 0.04 }`.
     */
    browserFamilies?: Record<string, number>;
    /**
     * List of hardware profile tuples with associated frequency.
     * The best-matching profile (exact concurrency + memory match) is used.
     */
    hardwareProfiles?: Array<{
        concurrency: number;
        memory: number;
        frequency: number;
    }>;
}
/**
 * Attractor-risk model driven by a user-supplied frequency table.
 *
 * Each signal dimension (platform, resolution, language, browser family,
 * hardware profile, and missing entropy fields) is scored against the
 * frequency table. The aggregate score is a weighted average of those
 * frequencies, normalised to `[0, 100]`.
 *
 * Dimensions absent from the table fall back to the built-in heuristic for
 * that signal, so a partial table can be supplied without losing coverage.
 *
 * @see {@link createFrequencyTableAttractorModel} for a factory shortcut.
 */
export declare class FrequencyTableAttractorModel implements AttractorModel {
    private readonly table;
    private readonly defaultModel;
    constructor(table: FrequencyTable);
    score(fp: FPDataSet): number;
    private _defaultPlatformRisk;
    private _defaultLanguageRisk;
    private _defaultBrowserRisk;
    private _defaultResolutionRisk;
    private _defaultHardwareRisk;
}
/**
 * Convenience factory for {@link FrequencyTableAttractorModel}.
 *
 * @param table - Frequency table describing signal commonness in the
 *                target population.
 * @returns     A fully constructed {@link AttractorModel}.
 *
 * @example
 * ```ts
 * const model = createFrequencyTableAttractorModel({
 *   platforms:   { "Win32": 0.72, "MacIntel": 0.18 },
 *   resolutions: { "1920x1080": 0.48, "2560x1440": 0.22 },
 *   languages:   { "en-US": 0.68 },
 * });
 *
 * const calculator = createConfidenceCalculator({ attractorModel: model });
 * const score = calculator.calculateConfidence(fp1, fp2);
 * ```
 */
export declare function createFrequencyTableAttractorModel(table: FrequencyTable): AttractorModel;
//# sourceMappingURL=attractor-model.d.ts.map