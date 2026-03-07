"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerComparator = registerComparator;
exports.registerWeight = registerWeight;
exports.registerPlugin = registerPlugin;
exports.setDefaultWeight = setDefaultWeight;
exports.unregisterComparator = unregisterComparator;
exports.unregisterWeight = unregisterWeight;
exports.clearRegistry = clearRegistry;
exports.getGlobalRegistry = getGlobalRegistry;
let registry = {
    comparators: {},
    weights: {},
    defaultWeight: 5,
};
/** Register a custom similarity comparator for a field or nested path */
function registerComparator(path, comparator) {
    if (typeof comparator !== "function") {
        throw new Error("Comparator must be a function returning a 0–1 similarity score");
    }
    registry.comparators[path] = comparator;
}
/** Register (or override) the weight for a field or nested path */
function registerWeight(path, weight) {
    if (typeof weight !== "number" || weight < 0) {
        throw new Error("Weight must be a non-negative number");
    }
    registry.weights[path] = weight;
}
/** Convenience: register weight + comparator in one call (most common pattern) */
function registerPlugin(path, config) {
    if (config.weight !== undefined)
        registerWeight(path, config.weight);
    if (config.comparator !== undefined)
        registerComparator(path, config.comparator);
}
/** Change the fallback weight for any unregistered field */
function setDefaultWeight(weight) {
    registry.defaultWeight = Math.max(0, weight);
}
/** Remove a registered comparator */
function unregisterComparator(path) {
    return delete registry.comparators[path];
}
/** Remove a registered weight */
function unregisterWeight(path) {
    return delete registry.weights[path];
}
/** Reset everything (perfect for tests) */
function clearRegistry() {
    registry = { comparators: {}, weights: {}, defaultWeight: 5 };
}
// Internal only – used by createConfidenceCalculator
function getGlobalRegistry() {
    return Object.assign(Object.assign({}, registry), { comparators: Object.assign({}, registry.comparators), weights: Object.assign({}, registry.weights) });
}
