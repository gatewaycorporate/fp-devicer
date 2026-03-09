import type { FPDataSet } from '../types/data.js';
export interface LabeledFingerprint {
    id: string;
    data: FPDataSet;
    deviceLabel: string;
    isAttractor: boolean;
}
declare function makePrng(seed: number): {
    next(): number;
    int(min: number, max: number): number;
    pick<T>(arr: T[]): T;
    bool(prob?: number): boolean;
    shuffle<T>(arr: T[]): T[];
};
/**
 * Produce a deterministic hex/base64-like string mimicking a canvas toDataURL
 * fingerprint hash. The first ~60 characters are stable for the given seed
 * (representing the GPU/driver baseline) and the last ~20 characters vary on
 * each call (rendering jitter).
 *
 * @param seed - Device seed for the stable portion
 * @param rng  - Seeded PRNG instance for the jitter portion
 */
export declare function generateCanvasBlob(seed: number, rng: ReturnType<typeof makePrng>): string;
/**
 * Generate a deterministic WebGL fingerprint string containing a renderer
 * string and a short extension list. Total length ~150 characters.
 *
 * @param seed - Device seed for the stable renderer portion
 * @param rng  - Seeded PRNG instance for variation
 */
export declare function generateWebGLBlob(seed: number, rng: ReturnType<typeof makePrng>): string;
/**
 * Generate a deterministic audio fingerprint string mimicking a
 * float-precision oscillator/analyser output hash. Total length ~40 chars.
 *
 * @param seed - Device seed for the stable portion
 * @param rng  - Seeded PRNG instance for per-call noise
 */
export declare function generateAudioBlob(seed: number, rng: ReturnType<typeof makePrng>): string;
/**
 * Generate a deterministic but realistically diverse base fingerprint from
 * an integer seed. The resulting profile draws from large static pools so
 * that different seeds produce genuinely different device configurations.
 *
 * @returns A {@link FPDataSet} with realistic, internally consistent field values
 * 				derived from the input `seed`. The same seed will always produce
 *        the same fingerprint, while different seeds will yield diverse profiles.
 * @param seed - Integer seed used to derive all field values. Different seeds
 *               produce different but internally consistent fingerprints. The seed
 *               is processed through a simple PRNG to ensure that similar seeds
 *               yield very different outputs, avoiding near-duplicates.
 *
 * @see {@link createAttractorFingerprint} for a less diverse alternative that
 *      simulates the common "attractor" device profile.
 * @see {@link generateCanvasBlob}, {@link generateWebGLBlob},
 *      {@link generateAudioBlob} for the blob generation helpers used
 *      internally.
 */
export declare function createBaseFingerprint(seed: number): FPDataSet;
/**
 * Create a deterministic "attractor" fingerprint that represents the most
 * common real-world device profile: a Windows 10 desktop running Chrome 124
 * in the `America/New_York` timezone with `en-US` locale and a 1920×1080
 * display.
 *
 * Unlike {@link createBaseFingerprint}, this function fixes all
 * platform/browser/environment parameters to their most prevalent values and
 * uses the seed only to vary the font list, plugin set, and the canvas/WebGL/
 * audio blobs. This makes it suitable for generating a cluster of
 * near-identical fingerprints that stress-test a fingerprinter's ability to
 * distinguish devices that share almost every static signal.
 *
 * @param seed - Integer seed used to deterministically vary the font/plugin
 *               subset and the canvas, WebGL, and audio fingerprint blobs.
 *               Different seeds produce structurally identical profiles that
 *               differ only in those high-entropy fields.
 *
 * @returns A {@link FPDataSet} whose static fields are pinned to the Windows
 *          10 / Chrome 124 attractor profile and whose dynamic fields
 *          (canvas, webgl, audio, fonts, plugins) are derived from `seed`.
 *
 * @see {@link createBaseFingerprint} for a randomly diverse alternative.
 * @see {@link generateCanvasBlob}, {@link generateWebGLBlob},
 *      {@link generateAudioBlob} for the blob generation helpers used
 *      internally.
 *
 * @example
 * ```ts
 * // Generate two attractor fingerprints that share platform/browser signals
 * // but differ in canvas/audio/font details
 * const fp1 = createAttractorFingerprint(1);
 * const fp2 = createAttractorFingerprint(2);
 *
 * console.log(fp1.platform);  // 'Win32'
 * console.log(fp1.canvas === fp2.canvas); // false – seed-derived blobs differ
 * ```
 */
export declare function createAttractorFingerprint(seed: number): FPDataSet;
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
 *
 * @param fp - The base fingerprint to mutate. This object is not modified; a mutated clone is returned.
 * @param mutationLevel - The intensity of mutations to apply, simulating
 *                        different levels of real-world variability for the
 *                        same device.
 * @return A new {@link FPDataSet} object with mutations applied according to the specified level. The original `fp` remains unchanged.
 *
 * @remarks
 * The mutations applied at each level are designed to reflect realistic changes
 * that might occur for the same physical device over time, such as minor browser
 * updates, font installations, or environmental changes. The `extreme` level
 * simulates a scenario where the profile has changed so much that it would be
 * considered a different device for fingerprinting purposes.
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
 *
 * @returns An array of `LabeledFingerprint` objects, where each device has multiple sessions with varying mutation levels. The `deviceLabel` field is the same for all sessions of a given device, allowing for accuracy testing of the fingerprinter's ability to link sessions from the same device despite mutations.
 *
 * @remarks
 * This function creates a dataset that simulates real-world conditions where the same physical device may produce slightly different fingerprints across sessions due to various factors (browser updates, font changes, environmental differences). By including multiple sessions per device with controlled mutation levels, this dataset allows for robust benchmarking of fingerprinting algorithms' ability to correctly identify and link sessions from the same device while distinguishing between different devices.
 */
export declare function generateDataset(numDevices?: number, sessionsPerDevice?: number): LabeledFingerprint[];
export {};
//# sourceMappingURL=data-generator.d.ts.map