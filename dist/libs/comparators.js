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
export function levenshteinSimilarity(a, b) {
    if (a === b)
        return 1;
    if (!a || !b)
        return 0;
    const maxLen = Math.max(a.length, b.length);
    let distance = Math.abs(a.length - b.length);
    const minLen = Math.min(a.length, b.length);
    for (let i = 0; i < minLen; i++) {
        if (a[i] !== b[i])
            distance++;
    }
    return Math.max(0, 1 - distance / maxLen);
}
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
export function jaccardSimilarity(a, b) {
    const setA = new Set(Array.isArray(a) ? a : []);
    const setB = new Set(Array.isArray(b) ? b : []);
    if (setA.size === 0 && setB.size === 0)
        return 1;
    let intersection = 0;
    for (const item of setA) {
        if (setB.has(item))
            intersection++;
    }
    return intersection / (setA.size + setB.size - intersection);
}
/**
 * Return `1` for strictly equal values, `0` for unequal values.
 * When either operand is `undefined` a neutral score of `0.5` is returned
 * to avoid penalising missing fields.
 *
 * @param a - First value.
 * @param b - Second value.
 * @returns `1`, `0.5`, or `0`.
 */
function exactMatch(a, b) {
    if (a === undefined || b === undefined)
        return 0.5;
    return a === b ? 1 : 0;
}
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
export function numericProximity(a, b) {
    if (a === undefined || b === undefined)
        return 0.5;
    if (typeof a !== "number" || typeof b !== "number")
        return a === b ? 1 : 0;
    if (a === b)
        return 1;
    const range = Math.max(Math.abs(a), Math.abs(b), 1);
    return Math.max(0, 1 - Math.abs(a - b) / range);
}
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
export function screenSimilarity(screen1, screen2) {
    if (!screen1 || !screen2)
        return 0.5;
    const widthSim = numericProximity(screen1.width, screen2.width);
    const heightSim = numericProximity(screen1.height, screen2.height);
    const colorDepthSim = numericProximity(screen1.colorDepth, screen2.colorDepth);
    const pixelDepthSim = numericProximity(screen1.pixelDepth, screen2.pixelDepth);
    const orientationSim = exactMatch(screen1.orientation?.type, screen2.orientation?.type);
    return (widthSim + heightSim + colorDepthSim + pixelDepthSim + orientationSim) / 5;
}
