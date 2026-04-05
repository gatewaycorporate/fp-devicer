import type { FPDataSet } from "../types/data.js";
import type { StoredFingerprint } from "../types/storage.js";
/** Fields intentionally excluded from fingerprint hashing because they are highly volatile. */
export declare const VOLATILE_FIELDS: readonly ["behavioralMetrics"];
/**
 * Remove volatile fields from a fingerprint before canonical comparison or hashing.
 *
 * @param fingerprint - Raw fingerprint payload.
 * @returns Shallow clone without fields listed in {@link VOLATILE_FIELDS}.
 */
export declare function toComparableFingerprint<T extends FPDataSet>(fingerprint: T): T;
/**
 * Compute a stable fuzzy hash for a comparable fingerprint.
 *
 * Returns `undefined` when the underlying TLSH implementation cannot hash the
 * payload, which allows callers to skip dedup rather than fail the request.
 */
export declare function getFingerprintHash(fingerprint: FPDataSet): string | undefined;
/**
 * Return the persisted fingerprint hash for a stored snapshot.
 *
 * Falls back to recomputing the hash from `snapshot.fingerprint` when
 * `signalsHash` is absent.
 */
export declare function getStoredFingerprintHash(snapshot: Pick<StoredFingerprint, "fingerprint" | "signalsHash">): string | undefined;
//# sourceMappingURL=fingerprint-hash.d.ts.map