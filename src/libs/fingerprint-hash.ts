import type { FPDataSet } from "../types/data.js";
import type { StoredFingerprint } from "../types/storage.js";
import { canonicalizedStringify, getHash } from "./tlsh.js";

export const VOLATILE_FIELDS = ["behavioralMetrics"] as const;

export function toComparableFingerprint<T extends FPDataSet>(fingerprint: T): T {
  const comparable = { ...fingerprint } as T & Partial<Record<(typeof VOLATILE_FIELDS)[number], unknown>>;

  for (const field of VOLATILE_FIELDS) {
    delete comparable[field];
  }

  return comparable as T;
}

export function getFingerprintHash(fingerprint: FPDataSet): string | undefined {
  try {
    return getHash(canonicalizedStringify(toComparableFingerprint(fingerprint)));
  } catch {
    return undefined;
  }
}

export function getStoredFingerprintHash(
  snapshot: Pick<StoredFingerprint, "fingerprint" | "signalsHash">
): string | undefined {
  return snapshot.signalsHash ?? getFingerprintHash(snapshot.fingerprint);
}