import type { FPDataSet } from "../types/data.js";

// ─── Public interfaces ────────────────────────────────────────────────────────

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

// ─── Token extraction ─────────────────────────────────────────────────────────

/**
 * Extract a deduplicated set of prefixed string tokens from the set-valued
 * fields of a fingerprint.  The prefix ensures tokens from different fields
 * never collide (e.g. a font named "pdf" won't collide with a mimeType of
 * the same string).
 */
function extractTokens(fp: FPDataSet): string[] {
  const tokens = new Set<string>();

  const fonts: unknown = (fp as Record<string, unknown>).fonts;
  if (Array.isArray(fonts)) {
    for (const f of fonts) if (typeof f === "string" && f) tokens.add(`f:${f}`);
  }

  const plugins: unknown = (fp as Record<string, unknown>).plugins;
  if (Array.isArray(plugins)) {
    for (const p of plugins) if (typeof p === "string" && p) tokens.add(`p:${p}`);
  }

  const mimeTypes: unknown = (fp as Record<string, unknown>).mimeTypes;
  if (Array.isArray(mimeTypes)) {
    for (const m of mimeTypes) if (typeof m === "string" && m) tokens.add(`mt:${m}`);
  }

  const languages: unknown = (fp as Record<string, unknown>).languages;
  if (Array.isArray(languages)) {
    for (const l of languages) if (typeof l === "string" && l) tokens.add(`l:${l}`);
  }

  return Array.from(tokens);
}

// ─── Deterministic hash family ────────────────────────────────────────────────

/**
 * FNV-1a 32-bit hash of a string, mixed with a per-function seed.
 * Used as the MinHash universe hash: `h_seed(token)`.
 *
 * The seed is mixed in at the start so each of the `numHashes` functions
 * produces a different permutation of the hash space.
 */
function seededStringHash(token: string, seed: number): number {
  // Initialise from seed using a fast integer avalanche pass so different
  // seeds produce structurally different starting states.
  let h = (Math.imul(seed, 0x9e3779b9) ^ 0x811c9dc5) >>> 0;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // Final avalanche (Thomas Wang hash finaliser)
  h ^= h >>> 16;
  h = Math.imul(h, 0x45d9f3b) >>> 0;
  h ^= h >>> 16;
  return h;
}

/** Generate `numHashes` deterministic seeds using an LCG. */
function generateSeeds(numHashes: number): number[] {
  const seeds: number[] = [];
  let state = 1664525; // LCG initial state (not 0)
  for (let i = 0; i < numHashes; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    seeds.push(state);
  }
  return seeds;
}

// ─── LshIndexImpl ─────────────────────────────────────────────────────────────

class LshIndexImpl implements LshIndex {
  private readonly numHashes: number;
  private readonly numBands: number;
  private readonly rowsPerBand: number;
  private readonly seeds: number[];

  /** band index → bucket key → set of deviceIds */
  private readonly buckets: Array<Map<string, Set<string>>>;

  /**
   * Reverse lookup: deviceId → list of (bandIndex, bucketKey) pairs where it
   * is registered.  Used by `remove()` to clean up without a full scan.
   */
  private readonly deviceLocations = new Map<string, Array<[number, string]>>();
  private _size = 0;

  constructor(options: Required<LshOptions>) {
    this.numHashes = options.numHashes;
    this.numBands = options.numBands;

    if (this.numHashes % this.numBands !== 0) {
      throw new RangeError(
        `numHashes (${this.numHashes}) must be divisible by numBands (${this.numBands})`
      );
    }

    this.rowsPerBand = this.numHashes / this.numBands;
    this.seeds = generateSeeds(this.numHashes);
    this.buckets = Array.from({ length: this.numBands }, () => new Map());
  }

  add(deviceId: string, fp: FPDataSet): void {
    const sig = this.computeSignature(fp);
    if (!sig) return;

    const locations: Array<[number, string]> = [];
    for (let b = 0; b < this.numBands; b++) {
      const start = b * this.rowsPerBand;
      const bucketKey = sig.slice(start, start + this.rowsPerBand).join(",");
      let bucket = this.buckets[b].get(bucketKey);
      if (!bucket) {
        bucket = new Set();
        this.buckets[b].set(bucketKey, bucket);
      }
      bucket.add(deviceId);
      locations.push([b, bucketKey]);
    }

    const existing = this.deviceLocations.get(deviceId);
    if (existing) {
      existing.push(...locations);
    } else {
      this.deviceLocations.set(deviceId, locations);
    }
    this._size++;
  }

  remove(deviceId: string): void {
    const locations = this.deviceLocations.get(deviceId);
    if (!locations) return;

    for (const [bandIdx, bucketKey] of locations) {
      const bucket = this.buckets[bandIdx].get(bucketKey);
      if (bucket) {
        bucket.delete(deviceId);
        if (bucket.size === 0) this.buckets[bandIdx].delete(bucketKey);
      }
    }
    this.deviceLocations.delete(deviceId);
    this._size--;
  }

  query(fp: FPDataSet): string[] {
    const sig = this.computeSignature(fp);
    if (!sig) return [];

    const result = new Set<string>();
    for (let b = 0; b < this.numBands; b++) {
      const start = b * this.rowsPerBand;
      const bucketKey = sig.slice(start, start + this.rowsPerBand).join(",");
      const bucket = this.buckets[b].get(bucketKey);
      if (bucket) for (const id of bucket) result.add(id);
    }
    return Array.from(result);
  }

  size(): number {
    return this._size;
  }

  clear(): void {
    for (const bandBuckets of this.buckets) bandBuckets.clear();
    this.deviceLocations.clear();
    this._size = 0;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private computeSignature(fp: FPDataSet): number[] | null {
    const tokens = extractTokens(fp);
    if (tokens.length === 0) return null;

    const sig: number[] = new Array(this.numHashes);
    for (let i = 0; i < this.numHashes; i++) {
      let min = 0xffffffff;
      for (const token of tokens) {
        const h = seededStringHash(token, this.seeds[i]);
        if (h < min) min = h;
      }
      sig[i] = min;
    }
    return sig;
  }
}

// ─── Public factory functions ─────────────────────────────────────────────────

const DEFAULT_LSH_OPTIONS: Required<LshOptions> = {
  numHashes: 128,
  numBands: 16,
};

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
export function createLshIndex(options?: LshOptions): LshIndex {
  return new LshIndexImpl({
    numHashes: options?.numHashes ?? DEFAULT_LSH_OPTIONS.numHashes,
    numBands: options?.numBands ?? DEFAULT_LSH_OPTIONS.numBands,
  });
}

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
export function buildLshIndex(
  entries: Array<{ deviceId: string; fingerprint: FPDataSet }>,
  options?: LshOptions
): LshIndex {
  const index = createLshIndex(options);
  for (const { deviceId, fingerprint } of entries) {
    index.add(deviceId, fingerprint);
  }
  return index;
}

/** Re-export for type convenience */
export { extractTokens as _extractTokens };
