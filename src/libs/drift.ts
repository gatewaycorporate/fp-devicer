import type { FPDataSet } from "../types/data.js";
import type { StoredFingerprint } from "../types/storage.js";
import type {
  DriftAnalysisOptions,
  DriftPatternFlag,
  DriftReport,
  SuspiciousField,
} from "../types/drift.js";
import { DEFAULT_WEIGHTS, computeAttractorRisk } from "./confidence.js";
import { getGlobalRegistry } from "./registry.js";

const FIELD_PATHS = Object.keys(DEFAULT_WEIGHTS);

/** Small epsilon to avoid division by zero in z-score computation. */
const EPSILON = 0.05;

/** Z-score above which a field is considered suspicious (default). */
const DEFAULT_Z_THRESHOLD = 1.5;

/** Z-score cap used when aggregating the drift score. */
const Z_CAP = 5.0;

function isPresent(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * Pure function that computes a drift report for an incoming fingerprint
 * against a window of historical snapshots.
 *
 * This does not access any storage — all history records must be supplied
 * by the caller (typically {@link DeviceManager.analyzeDeviceDrift}).
 *
 * @param incoming  - The new fingerprint to evaluate.
 * @param history   - Historical snapshots for the device, in any order.
 *                    At least one entry is required.
 * @param options   - Optional tuning parameters.
 * @returns         A partial {@link DriftReport} (without `deviceId`).
 */
export function computeDeviceDrift(
  incoming: FPDataSet,
  history: StoredFingerprint[],
  options: DriftAnalysisOptions = {}
): Omit<DriftReport, "deviceId"> {
  const zThreshold = options.suspiciousZScoreThreshold ?? DEFAULT_Z_THRESHOLD;
  const registry = getGlobalRegistry();

  // Sort history newest-first so history[0] is the most recent baseline.
  const sorted = [...history].sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
  );

  // ── 1. Per-field historical stability ─────────────────────────────────────
  // Measure how stable each field is across consecutive history pairs.
  const fieldStability: Record<string, number> = {};
  if (sorted.length >= 2) {
    for (const field of FIELD_PATHS) {
      const comparator =
        registry.comparators[field] ?? ((a: unknown, b: unknown) => Number(a === b));
      let total = 0;
      let count = 0;
      for (let i = 0; i < sorted.length - 1; i++) {
        const v1 = (sorted[i].fingerprint as Record<string, unknown>)[field];
        const v2 = (sorted[i + 1].fingerprint as Record<string, unknown>)[field];
        if (isPresent(v1) && isPresent(v2)) {
          total += Math.max(0, Math.min(1, comparator(v1, v2, field)));
          count++;
        }
      }
      fieldStability[field] = count > 0 ? total / count : 1;
    }
  } else {
    // Single snapshot: assume every field is perfectly stable.
    for (const field of FIELD_PATHS) {
      fieldStability[field] = 1;
    }
  }

  // ── 2. Per-field deviation of incoming against full history ────────────────
  const fieldDeviation: Record<string, number> = {};
  for (const field of FIELD_PATHS) {
    const comparator =
      registry.comparators[field] ?? ((a: unknown, b: unknown) => Number(a === b));
    const incomingValue = (incoming as Record<string, unknown>)[field];
    if (!isPresent(incomingValue)) {
      // Field absent in incoming — skip; missingness is handled separately.
      continue;
    }
    let totalSim = 0;
    let count = 0;
    for (const snap of sorted) {
      const histValue = (snap.fingerprint as Record<string, unknown>)[field];
      if (isPresent(histValue)) {
        totalSim += Math.max(0, Math.min(1, comparator(incomingValue, histValue, field)));
        count++;
      }
    }
    if (count > 0) {
      fieldDeviation[field] = 1 - totalSim / count;
    }
  }

  // ── 3. Z-score per field ───────────────────────────────────────────────────
  const allFields: (SuspiciousField & { weight: number })[] = [];
  for (const field of FIELD_PATHS) {
    if (fieldDeviation[field] === undefined) continue;
    const stability = fieldStability[field] ?? 1;
    const deviation = fieldDeviation[field];
    const expectedVariance = 1 - stability + EPSILON;
    const zScore = deviation / expectedVariance;

    allFields.push({
      field,
      historicalStability: stability,
      currentDeviation: deviation,
      zScore,
      weight: DEFAULT_WEIGHTS[field] ?? 1,
    });
  }

  const suspiciousFields: SuspiciousField[] = allFields
    .filter((f) => f.zScore >= zThreshold)
    .sort((a, b) => b.zScore - a.zScore)
    .map(({ field, historicalStability, currentDeviation, zScore }) => ({
      field,
      historicalStability,
      currentDeviation,
      zScore,
    }));

  // ── 4. Aggregate drift score ───────────────────────────────────────────────
  // Weighted sum of capped z-scores, normalised to [0, 100].
  let weightedZSum = 0;
  let totalWeight = 0;
  for (const f of allFields) {
    weightedZSum += Math.min(f.zScore, Z_CAP) * f.weight;
    totalWeight += Z_CAP * f.weight; // maximum possible contribution
  }
  const rawDriftScore = totalWeight > 0 ? (weightedZSum / totalWeight) * 100 : 0;
  const driftScore = Math.round(Math.max(0, Math.min(100, rawDriftScore)));

  // ── 5. Pattern classification ──────────────────────────────────────────────
  const attractorRisk = computeAttractorRisk(incoming);
  let patternFlag: DriftPatternFlag;

  if (driftScore >= 75 && attractorRisk >= 50) {
    // High drift into a generic profile → automated evasion
    patternFlag = "CANONICAL_INJECTION";
  } else if (driftScore >= 55 && suspiciousFields.length <= 3) {
    // High drift concentrated in few fields → abrupt targeted change
    patternFlag = "ABRUPT_CHANGE";
  } else if (driftScore >= 30) {
    // Moderate drift spread across many fields → gradual environment shift
    patternFlag = "INCREMENTAL_DRIFT";
  } else {
    patternFlag = "NORMAL_AGING";
  }

  // ── 6. Baseline window ────────────────────────────────────────────────────
  const snapshotsAnalyzed = sorted.length;
  const newest = sorted[0].timestamp.getTime();
  const oldest = sorted[sorted.length - 1].timestamp.getTime();
  const baselineWindowMs = newest - oldest;

  return {
    driftScore,
    suspiciousFields,
    patternFlag,
    snapshotsAnalyzed,
    baselineWindowMs,
  };
}
