import type { FPDataSet } from "../types/data.js";
import type { StoredFingerprint } from "../types/storage.js";
import type { DriftAnalysisOptions, DriftReport } from "../types/drift.js";
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
export declare function computeDeviceDrift(incoming: FPDataSet, history: StoredFingerprint[], options?: DriftAnalysisOptions): Omit<DriftReport, "deviceId">;
//# sourceMappingURL=drift.d.ts.map