import type { FPDataSet } from "../types/data.js";
import type { StoredFingerprint } from "../types/storage.js";
import { canonicalizedStringify, getHash } from "./tlsh.js";

/** Fields intentionally excluded from fingerprint hashing because they are highly volatile. */
export const VOLATILE_FIELDS = ["behavioralMetrics"] as const;

/**
 * Remove volatile fields from a fingerprint before canonical comparison or hashing.
 *
 * @param fingerprint - Raw fingerprint payload.
 * @returns Shallow clone without fields listed in {@link VOLATILE_FIELDS}.
 */
export function toComparableFingerprint<T extends FPDataSet>(fingerprint: T): T {
  const comparable = { ...fingerprint } as T & Partial<Record<(typeof VOLATILE_FIELDS)[number], unknown>>;

  for (const field of VOLATILE_FIELDS) {
    delete comparable[field];
  }

  return comparable as T;
}

/**
 * Compute a stable fuzzy hash for a comparable fingerprint.
 *
 * Returns `undefined` when the underlying TLSH implementation cannot hash the
 * payload, which allows callers to skip dedup rather than fail the request.
 */
export function getFingerprintHash(fingerprint: FPDataSet): string | undefined {
  try {
    return getHash(canonicalizedStringify(toComparableFingerprint(fingerprint)));
  } catch {
    return undefined;
  }
}

/**
 * Return the persisted fingerprint hash for a stored snapshot.
 *
 * Falls back to recomputing the hash from `snapshot.fingerprint` when
 * `signalsHash` is absent.
 */
export function getStoredFingerprintHash(
  snapshot: Pick<StoredFingerprint, "fingerprint" | "signalsHash">
): string | undefined {
  return snapshot.signalsHash ?? getFingerprintHash(snapshot.fingerprint);
}