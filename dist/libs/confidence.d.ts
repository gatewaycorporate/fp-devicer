import { FPDataSet, ComparisonOptions } from "../types/data.js";
/**
 * Factory that creates a stateless fingerprint confidence calculator.
 *
 * The returned object exposes a single `calculateConfidence(data1, data2)`
 * method that blends two complementary scoring strategies:
 *
 * 1. **Structural score** – recursive field-by-field comparison using
 *    weighted-average similarity. Each field can have a custom
 *    {@link Comparator} and weight, sourced from the global registry and/or
 *    the local `userOptions`.
 * 2. **TLSH fuzzy score** – a locality-sensitive hash distance that captures
 *    holistic similarity across the whole dataset, independent of individual
 *    field comparators.
 *
 * The two scores are blended: `final = structural * (1 - tlshWeight) + tlsh * tlshWeight`.
 *
 * Options resolution order (highest priority first):
 * - `userOptions.weights` / `userOptions.comparators` (local overrides)
 * - Built-in `DEFAULT_WEIGHTS`
 * - Global registry (when `useGlobalRegistry` is `true`)
 * - Hardcoded fallbacks
 *
 * @param userOptions - Optional configuration overrides.
 * @returns An object with a `calculateConfidence` method.
 *
 * @example
 * ```ts
 * const calculator = createConfidenceCalculator({ tlshWeight: 0.2 });
 * const score = calculator.calculateConfidence(fp1, fp2); // 0-100
 * ```
 */
export declare function createConfidenceCalculator(userOptions?: ComparisonOptions): {
    /**
     * Compare two fingerprint datasets and return a confidence score.
     *
     * @param data1 - Reference (stored) fingerprint.
     * @param data2 - Incoming fingerprint to compare against.
     * @returns An integer score in `[0, 100]` where `100` = exact match.
     *   Returns `0` on unexpected errors.
     */
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
//# sourceMappingURL=confidence.d.ts.map