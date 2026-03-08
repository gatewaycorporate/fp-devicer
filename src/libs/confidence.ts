import { compareHashes, getHash, canonicalizedStringify } from "./tlsh.js";
import { getGlobalRegistry } from "./registry.js";
import { FPDataSet, ComparisonOptions, Comparator } from "../types/data.js";

/**
 * Baseline field weights used when neither the global registry nor a local
 * override provides a weight for a given path. Higher numbers cause a field
 * to have a larger influence on the final confidence score.
 *
 * @internal
 */
const DEFAULT_WEIGHTS: Record<string, number> = {
  userAgent: 10,
  platform: 20,
  timezone: 10,
  language: 15,
  languages: 20,
  cookieEnabled: 5,
  doNotTrack: 5,
  hardwareConcurrency: 5,
  deviceMemory: 5,
  product: 5,
  productSub: 5,
  vendor: 5,
  vendorSub: 5,
  appName: 5,
  appVersion: 5,
  appCodeName: 5,
  appMinorVersion: 5,
  buildID: 5,
  plugins: 15,
  mimeTypes: 15,
  screen: 10,
  fonts: 15,
  highEntropyValues: 20
};

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
export function createConfidenceCalculator(userOptions: ComparisonOptions = {}) {
  const {
    weights: localWeights = {},
    comparators: localComparators = {},
    defaultWeight: localDefaultWeight = 5,
    tlshWeight = 0.30,
    maxDepth = 5,
    useGlobalRegistry = true,
  } = userOptions;

  // Merge global registry (if enabled) → local always wins
  const global = useGlobalRegistry ? getGlobalRegistry() : { comparators: {}, weights: {}, defaultWeight: 5 };

  const finalDefaultWeight = localDefaultWeight ?? global.defaultWeight ?? 5;
  const mergedWeights = { ...global.weights, ...DEFAULT_WEIGHTS, ...localWeights };
  const mergedComparators = { ...global.comparators, ...localComparators };

  const defaultComparator: Comparator = (a, b) => Number(a === b);

  const getComparator = (path: string): Comparator => mergedComparators[path] ?? defaultComparator;

  const getWeight = (path: string): number => mergedWeights[path] ?? finalDefaultWeight;

  /**
   * Recursively walk two fingerprint values and accumulate weighted similarity.
   *
   * Handles three structural cases:
   * - **Primitive / leaf** – delegates to the registered or default comparator.
   * - **Array** – zips elements by index and recurses into each pair.
   * - **Object** – unions the keys of both objects and recurses into each pair.
   *
   * @param data1 - Value from the first fingerprint at the current path.
   * @param data2 - Value from the second fingerprint at the current path.
   * @param path - Current dot-notation path (empty string at root level).
   * @param depth - Current recursion depth; stops at `maxDepth`.
   * @returns Accumulated `totalWeight` and `matchedWeight` for this sub-tree.
   * @internal
   */
  function compareRecursive(
    data1: any,
    data2: any,
    path = "",
    depth = 0
  ): { totalWeight: number; matchedWeight: number } {
    if (depth > maxDepth) return { totalWeight: 0, matchedWeight: 0 };
    if (data1 === undefined || data2 === undefined) return { totalWeight: 0, matchedWeight: 0 };

    // Leaf / primitive value
    if (typeof data1 !== "object" || data1 === null || typeof data2 !== "object" || data2 === null) {
      const comparator = getComparator(path);
      const similarity = Math.max(0, Math.min(1, comparator(data1, data2, path)));
      const weight = getWeight(path);
      return { totalWeight: weight, matchedWeight: weight * similarity };
    }

    // Array
    if (Array.isArray(data1) && Array.isArray(data2)) {
      let total = 0;
      let matched = 0;
      const len = Math.min(data1.length, data2.length);
      for (let i = 0; i < len; i++) {
        const res = compareRecursive(data1[i], data2[i], `${path}[${i}]`, depth + 1);
        total += res.totalWeight;
        matched += res.matchedWeight;
      }
      return { totalWeight: total, matchedWeight: matched };
    }

    // Object
    let totalWeight = 0;
    let matchedWeight = 0;
    const keys = new Set([...Object.keys(data1 || {}), ...Object.keys(data2 || {})]);

    for (const key of keys) {
      const newPath = path ? `${path}.${key}` : key;
      const res = compareRecursive(data1?.[key], data2?.[key], newPath, depth + 1);
      totalWeight += res.totalWeight;
      matchedWeight += res.matchedWeight;
    }

    return { totalWeight, matchedWeight };
  }

  return {
    /**
     * Compare two fingerprint datasets and return a confidence score.
     *
     * @param data1 - Reference (stored) fingerprint.
     * @param data2 - Incoming fingerprint to compare against.
     * @returns An integer score in `[0, 100]` where `100` = exact match.
     *   Returns `0` on unexpected errors.
     */
    calculateConfidence(data1: FPDataSet, data2: FPDataSet): number {
      try {
        const { totalWeight, matchedWeight } = compareRecursive(data1, data2);
        const structuralScore = totalWeight > 0 ? matchedWeight / totalWeight : 0;

        // TLSH fuzzy component (kept exactly as before)
        let tlshScore = 1;
        if (tlshWeight > 0) {
          const hash1 = getHash(canonicalizedStringify(data1));
          const hash2 = getHash(canonicalizedStringify(data2));
          const diff = compareHashes(hash1, hash2);
          tlshScore = Math.max(0, (100 - diff) / 100);
        }

        const finalScore = structuralScore * (1 - tlshWeight) + tlshScore * tlshWeight;
        return Math.round(Math.max(0, Math.min(100, finalScore * 100)));
      } catch (error) {
        console.error("Error calculating confidence:", error);
        return 0;
      }
    },
  };
}

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
export const calculateConfidence = createConfidenceCalculator().calculateConfidence;
