"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateConfidence = void 0;
exports.createConfidenceCalculator = createConfidenceCalculator;
const tlsh_1 = require("./tlsh");
const registry_1 = require("./registry");
const DEFAULT_WEIGHTS = {
    userAgent: 20,
    platform: 15,
    timezone: 10,
    language: 10,
    languages: 10,
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
    plugins: 10,
    mimeTypes: 10,
    screen: 10,
    fonts: 15
};
function createConfidenceCalculator(userOptions = {}) {
    var _a;
    const { weights: localWeights = {}, comparators: localComparators = {}, defaultWeight: localDefaultWeight = 5, tlshWeight = 0.30, maxDepth = 5, useGlobalRegistry = true, } = userOptions;
    // Merge global registry (if enabled) → local always wins
    const global = useGlobalRegistry ? (0, registry_1.getGlobalRegistry)() : { comparators: {}, weights: {}, defaultWeight: 5 };
    const finalDefaultWeight = (_a = localDefaultWeight !== null && localDefaultWeight !== void 0 ? localDefaultWeight : global.defaultWeight) !== null && _a !== void 0 ? _a : 5;
    const mergedWeights = Object.assign(Object.assign(Object.assign({}, global.weights), DEFAULT_WEIGHTS), localWeights);
    const mergedComparators = Object.assign(Object.assign({}, global.comparators), localComparators);
    const defaultComparator = (a, b) => Number(a === b);
    const getComparator = (path) => { var _a; return (_a = mergedComparators[path]) !== null && _a !== void 0 ? _a : defaultComparator; };
    const getWeight = (path) => { var _a; return (_a = mergedWeights[path]) !== null && _a !== void 0 ? _a : finalDefaultWeight; };
    function compareRecursive(data1, data2, path = "", depth = 0) {
        if (depth > maxDepth)
            return { totalWeight: 0, matchedWeight: 0 };
        if (data1 === undefined || data2 === undefined)
            return { totalWeight: 0, matchedWeight: 0 };
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
            const res = compareRecursive(data1 === null || data1 === void 0 ? void 0 : data1[key], data2 === null || data2 === void 0 ? void 0 : data2[key], newPath, depth + 1);
            totalWeight += res.totalWeight;
            matchedWeight += res.matchedWeight;
        }
        return { totalWeight, matchedWeight };
    }
    return {
        calculateConfidence(data1, data2) {
            try {
                const { totalWeight, matchedWeight } = compareRecursive(data1, data2);
                const structuralScore = totalWeight > 0 ? matchedWeight / totalWeight : 0;
                // TLSH fuzzy component (kept exactly as before)
                let tlshScore = 1;
                if (tlshWeight > 0) {
                    const hash1 = (0, tlsh_1.getHash)(JSON.stringify(data1));
                    const hash2 = (0, tlsh_1.getHash)(JSON.stringify(data2));
                    const diff = (0, tlsh_1.compareHashes)(hash1, hash2);
                    tlshScore = Math.max(0, (100 - diff) / 100);
                }
                const finalScore = structuralScore * (1 - tlshWeight) + tlshScore * tlshWeight;
                return Math.round(Math.max(0, Math.min(100, finalScore * 100)));
            }
            catch (error) {
                console.error("Error calculating confidence:", error);
                return 0;
            }
        },
    };
}
exports.calculateConfidence = createConfidenceCalculator().calculateConfidence;
