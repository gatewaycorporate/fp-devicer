import type { FPDataSet } from "../types/data.js";
/**
 * Tuning parameters for the LSH candidate index.
 */
export interface LshOptions {
    /**
     * Number of MinHash functions (signature length).
     * Higher values → more accurate Jaccard estimates, more memory.
     * @default 128
     */
    numHashes?: number;
    /**
     * Number of bands used for band-partitioning.
     * Must evenly divide `numHashes`.
     * Fewer bands → higher similarity threshold before two fingerprints become
     * candidates (lower recall, higher precision).
     * @default 16
     */
    numBands?: number;
}
/**
 * In-memory Locality-Sensitive Hashing index over set-valued fingerprint
 * fields (`fonts`, `plugins`, `mimeTypes`, `languages`).
 *
 * Devices whose token sets share a MinHash band bucket are returned as
 * candidates, providing O(n/b) average-case candidate retrieval where n is
 * the total number of indexed fingerprints and b is the number of bands.
 *
 * The similarity threshold at which two fingerprints become near-certain
 * candidates is approximately `t ≈ (1/numBands)^(1/rowsPerBand)`.
 * With the defaults (128 hashes, 16 bands, 8 rows/band): t ≈ 0.50.
 */
export interface LshIndex {
    /**
     * Index a fingerprint under the given `deviceId`.
     * Calling `add` for the same `deviceId` again adds signature entries; it
     * does NOT replace them. Use `remove` first to replace an existing entry.
     */
    add(deviceId: string, fp: FPDataSet): void;
    /**
     * Remove all band-bucket entries for the given `deviceId`.
     */
    remove(deviceId: string): void;
    /**
     * Return device IDs whose band buckets overlap with the query fingerprint.
     * An empty array is returned when the query token set is empty.
     */
    query(fp: FPDataSet): string[];
    /**
     * Number of deviceId → fingerprint associations currently indexed.
     * (One device may cover multiple fingerprints if `add` is called multiple
     * times for the same ID.)
     */
    size(): number;
    /**
     * Evict all indexed entries.
     */
    clear(): void;
}
/**
 * Extract a deduplicated set of prefixed string tokens from the set-valued
 * fields of a fingerprint.  The prefix ensures tokens from different fields
 * never collide (e.g. a font named "pdf" won't collide with a mimeType of
 * the same string).
 */
declare function extractTokens(fp: FPDataSet): string[];
/**
 * Create a new, empty {@link LshIndex}.
 *
 * @param options - Optional tuning parameters.
 * @returns A ready-to-use LSH index.
 *
 * @example
 * ```ts
 * const index = createLshIndex();
 * index.add('dev_abc', fingerprintA);
 * index.add('dev_xyz', fingerprintB);
 *
 * const candidates = index.query(incomingFingerprint);
 * // candidates: string[] of device IDs that are likely similar
 * ```
 */
export declare function createLshIndex(options?: LshOptions): LshIndex;
/**
 * Build an {@link LshIndex} from an array of `{ deviceId, fingerprint }` pairs.
 *
 * Typically called with the output of `adapter.getAllFingerprints()` (after
 * deduplication to the latest snapshot per device).
 *
 * @param entries - Array of `{ deviceId, fingerprint }` objects.
 * @param options - Optional tuning parameters.
 * @returns A populated LSH index.
 */
export declare function buildLshIndex(entries: Array<{
    deviceId: string;
    fingerprint: FPDataSet;
}>, options?: LshOptions): LshIndex;
/** Re-export for type convenience */
export { extractTokens as _extractTokens };
//# sourceMappingURL=lsh-index.d.ts.map