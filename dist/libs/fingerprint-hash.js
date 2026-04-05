import { canonicalizedStringify, getHash } from "./tlsh.js";
/** Fields intentionally excluded from fingerprint hashing because they are highly volatile. */
export const VOLATILE_FIELDS = ["behavioralMetrics"];
/**
 * Remove volatile fields from a fingerprint before canonical comparison or hashing.
 *
 * @param fingerprint - Raw fingerprint payload.
 * @returns Shallow clone without fields listed in {@link VOLATILE_FIELDS}.
 */
export function toComparableFingerprint(fingerprint) {
    const comparable = { ...fingerprint };
    for (const field of VOLATILE_FIELDS) {
        delete comparable[field];
    }
    return comparable;
}
/**
 * Compute a stable fuzzy hash for a comparable fingerprint.
 *
 * Returns `undefined` when the underlying TLSH implementation cannot hash the
 * payload, which allows callers to skip dedup rather than fail the request.
 */
export function getFingerprintHash(fingerprint) {
    try {
        return getHash(canonicalizedStringify(toComparableFingerprint(fingerprint)));
    }
    catch {
        return undefined;
    }
}
/**
 * Return the persisted fingerprint hash for a stored snapshot.
 *
 * Falls back to recomputing the hash from `snapshot.fingerprint` when
 * `signalsHash` is absent.
 */
export function getStoredFingerprintHash(snapshot) {
    return snapshot.signalsHash ?? getFingerprintHash(snapshot.fingerprint);
}
