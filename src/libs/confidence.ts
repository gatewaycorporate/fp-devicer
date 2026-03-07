import { compareHashes, getHash } from "./tlsh";
import { getGlobalRegistry } from "./registry";
import { FPDataSet, ComparisonOptions, Comparator } from "../types/data";

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
    calculateConfidence(data1: FPDataSet, data2: FPDataSet): number {
      try {
        const { totalWeight, matchedWeight } = compareRecursive(data1, data2);
        const structuralScore = totalWeight > 0 ? matchedWeight / totalWeight : 0;

        // TLSH fuzzy component (kept exactly as before)
        let tlshScore = 1;
        if (tlshWeight > 0) {
          const hash1 = getHash(JSON.stringify(data1));
          const hash2 = getHash(JSON.stringify(data2));
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

export const calculateConfidence = createConfidenceCalculator().calculateConfidence;
