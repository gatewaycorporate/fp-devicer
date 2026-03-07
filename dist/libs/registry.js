import { initializeDefaultRegistry } from "./defaults.js";
let registry = {
    comparators: {},
    weights: {},
    defaultWeight: 5,
};
let defaultsInitialized = false;
/** Internal helper – called automatically on first use */
function ensureDefaults() {
    if (!defaultsInitialized) {
        initializeDefaultRegistry();
        defaultsInitialized = true;
    }
}
/** Register a custom similarity comparator for a field or nested path */
export function registerComparator(path, comparator) {
    if (typeof comparator !== "function") {
        throw new Error("Comparator must be a function returning a 0–1 similarity score");
    }
    registry.comparators[path] = comparator;
}
/** Register (or override) the weight for a field or nested path */
export function registerWeight(path, weight) {
    if (typeof weight !== "number" || weight < 0) {
        throw new Error("Weight must be a non-negative number");
    }
    registry.weights[path] = weight;
}
/** Convenience: register weight + comparator in one call (most common pattern) */
export function registerPlugin(path, config) {
    if (config.weight !== undefined)
        registerWeight(path, config.weight);
    if (config.comparator !== undefined)
        registerComparator(path, config.comparator);
}
/** Change the fallback weight for any unregistered field */
export function setDefaultWeight(weight) {
    registry.defaultWeight = Math.max(0, weight);
}
/** Remove a registered comparator */
export function unregisterComparator(path) {
    return delete registry.comparators[path];
}
/** Remove a registered weight */
export function unregisterWeight(path) {
    return delete registry.weights[path];
}
/** Reset everything (perfect for tests) */
export function clearRegistry() {
    registry = { comparators: {}, weights: {}, defaultWeight: 5 };
}
// Internal only – used by createConfidenceCalculator
export function getGlobalRegistry() {
    ensureDefaults();
    return {
        ...registry,
        comparators: { ...registry.comparators },
        weights: { ...registry.weights },
    };
}
export { initializeDefaultRegistry };
