/**
 * Produce a deterministic, canonicalised JSON-like string from any value.
 *
 * Unlike `JSON.stringify`, object keys are sorted alphabetically at every
 * level of nesting, ensuring that two semantically identical objects always
 * produce the same output regardless of insertion order. Used to generate
 * stable input for the TLSH hashing functions.
 *
 * @param obj - Any serialisable value.
 * @returns A sorted, flat string representation of `obj`.
 */
export declare function canonicalizedStringify(obj: any): string;
/**
 * Generate a TLSH (Trend Micro Locality Sensitive Hash) from a string.
 *
 * TLSH is a fuzzy hash: similar inputs produce similar (close) hashes,
 * enabling approximate-match comparisons via Hamming-like distance.
 * Non-string inputs are first serialised with {@link canonicalizedStringify}.
 *
 * @param data - Input string (or any value that will be stringified).
 * @returns A TLSH hex-encoded hash string.
 */
export declare function getHash(data: string): string;
/**
 * Compute the TLSH distance between two hash strings.
 *
 * A lower value indicates higher similarity. A distance of `0` means the
 * hashes are identical. `len_diff = true` is passed to the underlying
 * comparison so that differences in input length also contribute.
 *
 * @param hash1 - First TLSH hash string (from {@link getHash}).
 * @param hash2 - Second TLSH hash string.
 * @returns An integer distance value where `0` = identical and higher
 *   values indicate greater dissimilarity.
 */
export declare function compareHashes(hash1: string, hash2: string): number;
//# sourceMappingURL=tlsh.d.ts.map