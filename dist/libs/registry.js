import { initializeDefaultRegistry } from "./default-plugins.js";
let registry = {
    comparators: {},
    weights: {},
    defaultWeight: 5,
};
let defaultsInitialized = false;
/**
 * Lazily seeds the registry with built-in comparators and weights on the
 * first call to any registry getter. Subsequent calls are no-ops.
 * @internal
 */
function ensureDefaults() {
    if (!defaultsInitialized) {
        initializeDefaultRegistry();
        defaultsInitialized = true;
    }
}
/**
 * Register a custom similarity comparator for a field or nested path.
 *
 * The comparator replaces whatever function was previously associated with
 * `path` (including any built-in default). Use {@link registerPlugin} to
 * set both a weight and a comparator in a single call.
 *
 * @param path - Dot-notation field path, e.g. `"screen.width"` or `"fonts"`.
 * @param comparator - A {@link Comparator} returning a `[0, 1]` similarity score.
 * @throws {Error} If `comparator` is not a function.
 */
export function registerComparator(path, comparator) {
    if (typeof comparator !== "function") {
        throw new Error("Comparator must be a function returning a 0–1 similarity score");
    }
    registry.comparators[path] = comparator;
}
/**
 * Register (or override) the importance weight for a field or nested path.
 *
 * Higher weights give a field more influence on the final confidence score.
 * Weights are normalised internally, so only relative magnitudes matter.
 *
 * @param path - Dot-notation field path.
 * @param weight - A non-negative number representing relative importance.
 * @throws {Error} If `weight` is not a non-negative number.
 */
export function registerWeight(path, weight) {
    if (typeof weight !== "number" || weight < 0) {
        throw new Error("Weight must be a non-negative number");
    }
    registry.weights[path] = weight;
}
/**
 * Register a weight and/or comparator for a field path in one call.
 *
 * This is the most common extension point. Either `weight` or `comparator`
 * (or both) may be provided; omitted properties are left unchanged.
 *
 * @param path - Dot-notation field path.
 * @param config - An object with optional `weight` and/or `comparator`.
 *
 * @example
 * ```ts
 * registerPlugin('userAgent', {
 *   weight: 25,
 *   comparator: (a, b) => levenshteinSimilarity(a, b),
 * });
 * ```
 */
export function registerPlugin(path, config) {
    if (config.weight !== undefined)
        registerWeight(path, config.weight);
    if (config.comparator !== undefined)
        registerComparator(path, config.comparator);
}
/**
 * Change the fallback weight applied to any field that has no explicit
 * weight registration.
 *
 * @param weight - New default weight. Values below `0` are clamped to `0`.
 */
export function setDefaultWeight(weight) {
    registry.defaultWeight = Math.max(0, weight);
}
/**
 * Remove a previously registered comparator for the given path.
 *
 * After removal the confidence calculator reverts to the default
 * strict-equality comparator for that field.
 *
 * @param path - Dot-notation field path whose comparator should be removed.
 * @returns `true` if the comparator existed and was removed, `false` otherwise.
 */
export function unregisterComparator(path) {
    return delete registry.comparators[path];
}
/**
 * Remove a previously registered weight for the given path.
 *
 * After removal the field will use the current default weight.
 *
 * @param path - Dot-notation field path whose weight should be removed.
 * @returns `true` if the weight existed and was removed, `false` otherwise.
 */
export function unregisterWeight(path) {
    return delete registry.weights[path];
}
/**
 * Reset the global registry to an empty state.
 *
 * All registered comparators, weights, and the default weight are cleared.
 * The built-in defaults will be re-seeded lazily on the next call to
 * {@link getGlobalRegistry}. Primarily useful for test isolation.
 */
export function clearRegistry() {
    registry = { comparators: {}, weights: {}, defaultWeight: 5 };
}
/**
 * Return a read-only shallow copy of the current registry state.
 *
 * Triggers lazy default initialisation on first call. Consumed internally
 * by {@link createConfidenceCalculator} when `useGlobalRegistry` is `true`.
 *
 * @internal
 */
export function getGlobalRegistry() {
    ensureDefaults();
    return {
        ...registry,
        comparators: { ...registry.comparators },
        weights: { ...registry.weights },
    };
}
export { initializeDefaultRegistry };
