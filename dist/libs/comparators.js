/**
 * Compute a normalized Levenshtein similarity score between two strings.
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
    const lenA = a.length;
    const lenB = b.length;
    const maxLen = Math.max(lenA, lenB);
    // Two-row dynamic programming keeps memory usage linear.
    let previousRow = new Array(lenB + 1);
    let currentRow = new Array(lenB + 1);
    for (let j = 0; j <= lenB; j++) {
        previousRow[j] = j;
    }
    for (let i = 1; i <= lenA; i++) {
        currentRow[0] = i;
        for (let j = 1; j <= lenB; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            const deletion = previousRow[j] + 1;
            const insertion = currentRow[j - 1] + 1;
            const substitution = previousRow[j - 1] + cost;
            currentRow[j] = Math.min(deletion, insertion, substitution);
        }
        const swap = previousRow;
        previousRow = currentRow;
        currentRow = swap;
    }
    const distance = previousRow[lenB];
    return Math.max(0, 1 - distance / maxLen);
}
function stableObjectStringify(value) {
    if (value === null)
        return "null";
    if (Array.isArray(value)) {
        return `[${value.map((entry) => stableObjectStringify(entry)).join(",")}]`;
    }
    const valueType = typeof value;
    if (valueType === "object") {
        const record = value;
        const keys = Object.keys(record).sort();
        const body = keys
            .map((key) => `${JSON.stringify(key)}:${stableObjectStringify(record[key])}`)
            .join(",");
        return `{${body}}`;
    }
    if (valueType === "string")
        return `s:${value}`;
    if (valueType === "number") {
        const n = value;
        return Number.isNaN(n) ? "n:NaN" : `n:${n}`;
    }
    if (valueType === "boolean")
        return `b:${value}`;
    if (valueType === "undefined")
        return "u:";
    if (valueType === "bigint")
        return `bi:${String(value)}`;
    if (valueType === "symbol")
        return `sym:${String(value)}`;
    return `x:${String(value)}`;
}
/**
 * Compute the Jaccard similarity coefficient between two arrays.
 *
 * Both inputs are coerced into sets. Empty arrays on both sides yield `0`
 * because missing evidence should not count as a positive match. If only one
 * side is empty the result is also `0`.
 *
 * @param a - First array (non-array values are treated as an empty array).
 * @param b - Second array.
 * @returns Jaccard index in `[0, 1]`: `|A ∩ B| / |A ∪ B|`.
 */
export function jaccardSimilarity(a, b) {
    const setA = new Set((Array.isArray(a) ? a : []).map((item) => stableObjectStringify(item)));
    const setB = new Set((Array.isArray(b) ? b : []).map((item) => stableObjectStringify(item)));
    if (setA.size === 0 && setB.size === 0)
        return 0;
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
