/**
 * Compute a character-level similarity score between two strings using a
 * simplified Levenshtein-inspired distance.
 *
 * The distance counts differing prefix characters and the absolute length
 * difference, then normalises over the longer string's length.
 *
 * @param a - First string.
 * @param b - Second string.
 * @returns Similarity in `[0, 1]`. Returns `1` for identical strings and
 *   `0` when either string is empty (but not both).
 */
export declare function levenshteinSimilarity(a: string, b: string): number;
/**
 * Compute the Jaccard similarity coefficient between two arrays.
 *
 * Both inputs are coerced into sets. Empty arrays on both sides yield `1`
 * (identical empty sets). If only one side is empty the result is `0`.
 *
 * @param a - First array (non-array values are treated as an empty array).
 * @param b - Second array.
 * @returns Jaccard index in `[0, 1]`: `|A ∩ B| / |A ∪ B|`.
 */
export declare function jaccardSimilarity(a: unknown, b: unknown): number;
/**
 * Compute a proximity score between two numeric values.
 *
 * The score is normalised by the larger magnitude so that small differences
 * on large numbers still receive a high score. Non-numeric types fall back
 * to exact-match semantics. Missing (`undefined`) operands yield `0.5`.
 *
 * @param a - First value.
 * @param b - Second value.
 * @returns Proximity score in `[0, 1]`.
 */
export declare function numericProximity(a: unknown, b: unknown): number;
/**
 * Aggregate similarity score for two screen descriptor objects.
 *
 * Combines numeric proximity on `width`, `height`, `colorDepth`, and
 * `pixelDepth` with an exact-match check on `orientation.type`. Each of
 * the five components contributes equally (weight `0.2`).
 *
 * @param screen1 - First screen descriptor (e.g. `FPUserDataSet["screen"]`).
 * @param screen2 - Second screen descriptor.
 * @returns Similarity in `[0, 1]`. Returns `0.5` when either argument is falsy.
 */
export declare function screenSimilarity(screen1: any, screen2: any): number;
//# sourceMappingURL=comparators.d.ts.map