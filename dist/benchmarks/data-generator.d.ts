import type { FPDataSet } from '../types/data.js';
export interface LabeledFingerprint {
    id: string;
    data: FPDataSet;
    deviceLabel: string;
}
/**
 * Generate a deterministic but realistically diverse base fingerprint from
 * an integer seed. The resulting profile draws from large static pools so
 * that different seeds produce genuinely different device configurations.
 */
export declare function createBaseFingerprint(seed: number): FPDataSet;
/**
 * Apply realistic noise to a fingerprint to simulate re-visits by the same
 * device under varying conditions.
 *
 * - `low`    — natural per-session jitter (common in practice)
 * - `medium` — minor environment change (new font installed, browser update)
 * - `high`   — notable change but still same device (external monitor, new
 *              browser version, privacy settings toggled)
 * - `extreme`— fundamentally different profile; treated as a different device
 *              in accuracy scoring
 */
export declare function mutate(fp: FPDataSet, mutationLevel: 'none' | 'low' | 'medium' | 'high' | 'extreme'): FPDataSet;
/**
 * Generate a labeled dataset of fingerprints for benchmarking.
 *
 * Each device gets `sessionsPerDevice` samples:
 * - Session 0 : clean baseline (`none`)
 * - Sessions 1+: cycling through `low → medium → high` mutations with a small
 *   chance of an additional `low` jitter layered on top, simulating the
 *   realistic case where every re-visit carries some natural noise.
 *
 * @param numDevices        Number of distinct simulated devices.
 * @param sessionsPerDevice Number of fingerprint snapshots per device.
 */
export declare function generateDataset(numDevices?: number, sessionsPerDevice?: number): LabeledFingerprint[];
//# sourceMappingURL=data-generator.d.ts.map