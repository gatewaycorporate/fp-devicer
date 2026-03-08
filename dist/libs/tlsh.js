import hash from 'tlsh';
import DigestHashBuilder from 'tlsh/lib/digests/digest-hash-builder.js';
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
export function canonicalizedStringify(obj) {
    if (obj === null || obj === undefined)
        return '';
    if (typeof obj !== 'object')
        return String(obj);
    if (Array.isArray(obj))
        return `[${obj.map(canonicalizedStringify).join(',')}]`;
    const keys = Object.keys(obj).sort();
    return `{${keys.map(key => `${key}:${canonicalizedStringify(obj[key])}`).join(',')}}`;
}
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
export function getHash(data) {
    // Convert the input data to a string if it's not already
    const inputString = typeof data === 'string' ? data : canonicalizedStringify(data);
    // Generate the TLSH hash
    const tlshHash = hash(inputString);
    // Return the hash as a string
    return tlshHash;
}
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
export function compareHashes(hash1, hash2) {
    const digest1 = DigestHashBuilder().withHash(hash1).build();
    const digest2 = DigestHashBuilder().withHash(hash2).build();
    return digest1.calculateDifference(digest2, true);
}
