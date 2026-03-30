import { compareHashes, getHash, canonicalizedStringify } from "./tlsh.js";
import { getGlobalRegistry } from "./registry.js";
/**
 * Baseline field weights used when neither the global registry nor a local
 * override provides a weight for a given path. Higher numbers cause a field
 * to have a larger influence on the final confidence score.
 *
 * Exported so consumers (e.g. `DeviceManager`) can derive adaptive per-device
 * weights by scaling these defaults against observed per-field signal stability.
 */
export const DEFAULT_WEIGHTS = {
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
    canvas: 30,
    webgl: 25,
    audio: 25,
    highEntropyValues: 20,
};
const FIELD_PATHS = Object.keys(DEFAULT_WEIGHTS);
const STABLE_FIELD_PATHS = ["screen", "hardwareConcurrency", "deviceMemory", "platform", "highEntropyValues"];
const ENTROPY_FIELD_PATHS = ["canvas", "webgl", "audio"];
const ATTRACTOR_RESOLUTIONS = new Set(["1920x1080", "1366x768", "1280x800", "390x844"]);
const COMMON_LANGUAGE_PREFIXES = ["en", "en-us", "zh-cn"];
function clampUnit(value) {
    return Math.max(0, Math.min(1, value));
}
function clampScore(value) {
    return Math.round(Math.max(0, Math.min(100, value)));
}
function isPresent(value) {
    if (value === undefined || value === null)
        return false;
    if (typeof value === "string")
        return value.trim().length > 0;
    if (Array.isArray(value))
        return value.length > 0;
    return true;
}
function exactComparator(a, b) {
    if (a === undefined || b === undefined)
        return 0.5;
    return Number(a === b);
}
function average(values, fallback = 1) {
    if (!values.length)
        return fallback;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}
function computeAttractorPenalty(attractorRisk, fieldAgreement, deviceSimilarity) {
    const risk = attractorRisk / 100;
    const agreement = fieldAgreement / 100;
    const similarity = deviceSimilarity / 100;
    // Make common, highly self-consistent fingerprints much more expensive.
    // Squaring the risk keeps low-risk devices mostly unaffected while sharply
    // penalizing generic collision-prone profiles.
    return Math.pow(risk, 2) * (0.35 + agreement * 0.4 + similarity * 0.25);
}
function computeMismatchPenalty(fieldAgreement, deviceSimilarity) {
    const agreementGap = 1 - (fieldAgreement / 100);
    const similarityGap = 1 - (deviceSimilarity / 100);
    return agreementGap * similarityGap;
}
function computeLowSimilarityPenalty(fieldAgreement, deviceSimilarity) {
    if (deviceSimilarity >= 60)
        return 0;
    const similarityShortfall = (60 - deviceSimilarity) / 60;
    const agreementGap = 1 - (fieldAgreement / 100);
    return similarityShortfall * agreementGap;
}
function createScoringContext(userOptions = {}) {
    const { weights: localWeights = {}, comparators: localComparators = {}, defaultWeight: localDefaultWeight = 5, tlshWeight = 0.3, maxDepth = 5, useGlobalRegistry = true, } = userOptions;
    const global = useGlobalRegistry
        ? getGlobalRegistry()
        : { comparators: {}, weights: {}, defaultWeight: 5 };
    const finalDefaultWeight = localDefaultWeight ?? global.defaultWeight ?? 5;
    const mergedWeights = { ...global.weights, ...DEFAULT_WEIGHTS, ...localWeights };
    const mergedComparators = { ...global.comparators, ...localComparators };
    const getComparator = (path) => mergedComparators[path] ?? exactComparator;
    const getWeight = (path) => mergedWeights[path] ?? finalDefaultWeight;
    function compareRecursive(data1, data2, path = "", depth = 0) {
        if (depth > maxDepth)
            return { totalWeight: 0, matchedWeight: 0 };
        if (data1 === undefined || data2 === undefined)
            return { totalWeight: 0, matchedWeight: 0 };
        if (typeof data1 !== "object" || data1 === null || typeof data2 !== "object" || data2 === null) {
            const comparator = getComparator(path);
            const similarity = clampUnit(comparator(data1, data2, path));
            const weight = getWeight(path);
            return { totalWeight: weight, matchedWeight: weight * similarity };
        }
        if (Array.isArray(data1) && Array.isArray(data2)) {
            let total = 0;
            let matched = 0;
            const len = Math.min(data1.length, data2.length);
            for (let i = 0; i < len; i++) {
                const result = compareRecursive(data1[i], data2[i], `${path}[${i}]`, depth + 1);
                total += result.totalWeight;
                matched += result.matchedWeight;
            }
            return { totalWeight: total, matchedWeight: matched };
        }
        let totalWeight = 0;
        let matchedWeight = 0;
        const keys = new Set([...Object.keys(data1 || {}), ...Object.keys(data2 || {})]);
        for (const key of keys) {
            const nextPath = path ? `${path}.${key}` : key;
            const result = compareRecursive(data1?.[key], data2?.[key], nextPath, depth + 1);
            totalWeight += result.totalWeight;
            matchedWeight += result.matchedWeight;
        }
        return { totalWeight, matchedWeight };
    }
    function calculateStructuralScore(data1, data2) {
        const { totalWeight, matchedWeight } = compareRecursive(data1, data2);
        return totalWeight > 0 ? matchedWeight / totalWeight : 0;
    }
    function calculateTlshScore(data1, data2) {
        const tlshMaxDistance = 300;
        const hash1 = getHash(canonicalizedStringify(data1));
        const hash2 = getHash(canonicalizedStringify(data2));
        const diff = compareHashes(hash1, hash2);
        return Math.max(0, (tlshMaxDistance - diff) / tlshMaxDistance);
    }
    function compareField(path, value1, value2) {
        if (value1 === undefined || value2 === undefined)
            return 0;
        const comparator = mergedComparators[path];
        if (comparator) {
            return clampUnit(comparator(value1, value2, path));
        }
        if (typeof value1 === "object" && value1 !== null && typeof value2 === "object" && value2 !== null) {
            const { totalWeight, matchedWeight } = compareRecursive(value1, value2, path, 0);
            return totalWeight > 0 ? matchedWeight / totalWeight : Number(canonicalizedStringify(value1) === canonicalizedStringify(value2));
        }
        return clampUnit(exactComparator(value1, value2));
    }
    function calculateDeviceSimilarity(data1, data2) {
        const structuralScore = calculateStructuralScore(data1, data2);
        const fuzzyScore = tlshWeight > 0 ? calculateTlshScore(data1, data2) : 1;
        const finalScore = structuralScore * (1 - tlshWeight) + fuzzyScore * tlshWeight;
        return clampScore(finalScore * 100);
    }
    return {
        getWeight,
        compareField,
        calculateDeviceSimilarity,
    };
}
export function computeEvidenceRichness(data) {
    const presentCount = FIELD_PATHS.filter((field) => isPresent(data[field])).length;
    return clampScore((presentCount / FIELD_PATHS.length) * 100);
}
export function computeFieldAgreement(data1, data2, options = {}) {
    const context = createScoringContext(options);
    let comparable = 0;
    let matching = 0;
    for (const field of FIELD_PATHS) {
        const value1 = data1[field];
        const value2 = data2[field];
        if (!isPresent(value1) || !isPresent(value2))
            continue;
        comparable += 1;
        if (context.compareField(field, value1, value2) >= 0.9) {
            matching += 1;
        }
    }
    return comparable > 0 ? clampScore((matching / comparable) * 100) : 50;
}
export function computeStructuralStability(data1, data2, options = {}) {
    const context = createScoringContext(options);
    let totalWeight = 0;
    let matchedWeight = 0;
    for (const field of STABLE_FIELD_PATHS) {
        const value1 = data1[field];
        const value2 = data2[field];
        if (!isPresent(value1) || !isPresent(value2))
            continue;
        const weight = context.getWeight(field);
        totalWeight += weight;
        matchedWeight += weight * context.compareField(field, value1, value2);
    }
    return totalWeight > 0 ? clampScore((matchedWeight / totalWeight) * 100) : 50;
}
export function computeEntropyContribution(data1, data2, options = {}) {
    const context = createScoringContext(options);
    let totalWeight = 0;
    let matchedWeight = 0;
    for (const field of ENTROPY_FIELD_PATHS) {
        const value1 = data1[field];
        const value2 = data2[field];
        if (!isPresent(value1) || !isPresent(value2))
            continue;
        const weight = context.getWeight(field);
        totalWeight += weight;
        matchedWeight += weight * context.compareField(field, value1, value2);
    }
    return totalWeight > 0 ? clampScore((matchedWeight / totalWeight) * 100) : 50;
}
export function computeAttractorRisk(data) {
    let matchedSignals = 0;
    const maxSignals = 6;
    const platform = String(data.platform || "").toLowerCase();
    const userAgent = String(data.userAgent || "").toLowerCase();
    const language = String(data.language || "").toLowerCase();
    const width = data.screen?.width;
    const height = data.screen?.height;
    const resolutionKey = width && height ? `${width}x${height}` : "";
    const hardwareConcurrency = Number(data.hardwareConcurrency || 0);
    const deviceMemory = Number(data.deviceMemory || 0);
    if (platform.includes("win") || userAgent.includes("android") || userAgent.includes("iphone") || userAgent.includes("ipad")) {
        matchedSignals += 1;
    }
    if (COMMON_LANGUAGE_PREFIXES.includes(language)) {
        matchedSignals += 1;
    }
    if (userAgent.includes("chrome/") || userAgent.includes("firefox/") || userAgent.includes("safari/")) {
        matchedSignals += 1;
    }
    if (ATTRACTOR_RESOLUTIONS.has(resolutionKey)) {
        matchedSignals += 1;
    }
    if ((hardwareConcurrency === 4 || hardwareConcurrency === 8) && (deviceMemory === 4 || deviceMemory === 8)) {
        matchedSignals += 1;
    }
    if (!isPresent(data.canvas) && !isPresent(data.webgl) && !isPresent(data.audio)) {
        matchedSignals += 1;
    }
    return clampScore((matchedSignals / maxSignals) * 100);
}
export function computeMissingOneSide(data1, data2) {
    let oneSideMissing = 0;
    for (const field of FIELD_PATHS) {
        const present1 = isPresent(data1[field]);
        const present2 = isPresent(data2[field]);
        if (present1 !== present2) {
            oneSideMissing += 1;
        }
    }
    return clampScore((oneSideMissing / FIELD_PATHS.length) * 100);
}
export function computeMissingBothSides(data1, data2) {
    let missingBoth = 0;
    for (const field of FIELD_PATHS) {
        const present1 = isPresent(data1[field]);
        const present2 = isPresent(data2[field]);
        if (!present1 && !present2) {
            missingBoth += 1;
        }
    }
    return clampScore((missingBoth / FIELD_PATHS.length) * 100);
}
export function computeAdaptiveStabilityWeights(stabilities = {}) {
    if (!Object.keys(stabilities).length) {
        return {
            deviceSimilarity: 1,
            evidenceRichness: 1,
            fieldAgreement: 1,
            structuralStability: 1,
            entropyContribution: 1,
            attractorRisk: 1,
            missingOneSide: 1,
            missingBothSides: 1,
        };
    }
    const allFieldStabilities = FIELD_PATHS.map((field) => stabilities[field] ?? 1);
    const stableFieldStabilities = STABLE_FIELD_PATHS.map((field) => stabilities[field] ?? 1);
    const entropyFieldStabilities = ENTROPY_FIELD_PATHS.map((field) => stabilities[field] ?? 1);
    const averageAll = average(allFieldStabilities);
    return {
        deviceSimilarity: averageAll,
        evidenceRichness: 1,
        fieldAgreement: averageAll,
        structuralStability: average(stableFieldStabilities),
        entropyContribution: average(entropyFieldStabilities),
        attractorRisk: 1,
        missingOneSide: 1,
        missingBothSides: 1,
    };
}
export function calculateScoreBreakdown(data1, data2, options = {}) {
    try {
        const context = createScoringContext(options);
        const deviceSimilarity = context.calculateDeviceSimilarity(data1, data2);
        const evidenceRichness = clampScore((computeEvidenceRichness(data1) + computeEvidenceRichness(data2)) / 2);
        const fieldAgreement = computeFieldAgreement(data1, data2, options);
        const structuralStability = computeStructuralStability(data1, data2, options);
        const entropyContribution = computeEntropyContribution(data1, data2, options);
        const attractorRisk = clampScore((computeAttractorRisk(data1) + computeAttractorRisk(data2)) / 2);
        const missingOneSide = computeMissingOneSide(data1, data2);
        const missingBothSides = computeMissingBothSides(data1, data2);
        const adaptiveWeights = computeAdaptiveStabilityWeights(options.stabilities);
        const positiveWeights = {
            deviceSimilarity: 0.62,
            evidenceRichness: 0.06,
            fieldAgreement: 0.18,
            structuralStability: 0.08,
            entropyContribution: 0.06,
        };
        const negativeWeights = {
            attractorRisk: 0.55,
            mismatch: 0.08,
            lowSimilarity: 0.16,
            missingOneSide: 0.02,
            missingBothSides: 0.01,
        };
        const positiveTotal = (deviceSimilarity / 100) * positiveWeights.deviceSimilarity * adaptiveWeights.deviceSimilarity +
            (evidenceRichness / 100) * positiveWeights.evidenceRichness * adaptiveWeights.evidenceRichness +
            (fieldAgreement / 100) * positiveWeights.fieldAgreement * adaptiveWeights.fieldAgreement +
            (structuralStability / 100) * positiveWeights.structuralStability * adaptiveWeights.structuralStability +
            (entropyContribution / 100) * positiveWeights.entropyContribution * adaptiveWeights.entropyContribution;
        const positiveMax = positiveWeights.deviceSimilarity * adaptiveWeights.deviceSimilarity +
            positiveWeights.evidenceRichness * adaptiveWeights.evidenceRichness +
            positiveWeights.fieldAgreement * adaptiveWeights.fieldAgreement +
            positiveWeights.structuralStability * adaptiveWeights.structuralStability +
            positiveWeights.entropyContribution * adaptiveWeights.entropyContribution;
        const negativeTotal = computeAttractorPenalty(attractorRisk, fieldAgreement, deviceSimilarity) * negativeWeights.attractorRisk * adaptiveWeights.attractorRisk +
            computeMismatchPenalty(fieldAgreement, deviceSimilarity) * negativeWeights.mismatch +
            computeLowSimilarityPenalty(fieldAgreement, deviceSimilarity) * negativeWeights.lowSimilarity +
            (missingOneSide / 100) * negativeWeights.missingOneSide * adaptiveWeights.missingOneSide +
            (missingBothSides / 100) * negativeWeights.missingBothSides * adaptiveWeights.missingBothSides;
        const calibrationOffset = 15;
        let composite = positiveMax > 0
            ? clampScore((((positiveTotal - negativeTotal) / positiveMax) * 100) + calibrationOffset)
            : deviceSimilarity;
        if (canonicalizedStringify(data1) !== canonicalizedStringify(data2)) {
            const nonExactCeiling = Math.max(95, Math.min(99, deviceSimilarity + 12));
            composite = Math.min(composite, nonExactCeiling);
        }
        if (canonicalizedStringify(data1) === canonicalizedStringify(data2) && attractorRisk < 70) {
            composite = 100;
        }
        return {
            deviceSimilarity,
            evidenceRichness,
            fieldAgreement,
            structuralStability,
            entropyContribution,
            attractorRisk,
            missingOneSide,
            missingBothSides,
            composite,
        };
    }
    catch (error) {
        console.error("Error calculating score breakdown:", error);
        return {
            deviceSimilarity: 0,
            evidenceRichness: 0,
            fieldAgreement: 0,
            structuralStability: 0,
            entropyContribution: 0,
            attractorRisk: 0,
            missingOneSide: 0,
            missingBothSides: 0,
            composite: 0,
        };
    }
}
/**
 * Factory that creates a stateless fingerprint confidence calculator.
 *
 * The returned object exposes `calculateConfidence(data1, data2)` and
 * `calculateScoreBreakdown(data1, data2)` methods.
 *
 * @param userOptions - Optional configuration overrides.
 * @returns Calculator methods for confidence scoring.
 */
export function createConfidenceCalculator(userOptions = {}) {
    return {
        calculateScoreBreakdown(data1, data2) {
            return calculateScoreBreakdown(data1, data2, userOptions);
        },
        calculateConfidence(data1, data2) {
            return calculateScoreBreakdown(data1, data2, userOptions).composite;
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
