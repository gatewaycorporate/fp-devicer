import type { FPDataSet } from "../types/data.js";
import type { StoredFingerprint } from "../types/storage.js";
import { canonicalizedStringify, getHash } from "./tlsh.js";

export function getFingerprintHash(fingerprint: FPDataSet): string | undefined {
  try {
    return getHash(canonicalizedStringify(fingerprint));
  } catch {
    return undefined;
  }
}

export function getStoredFingerprintHash(
  snapshot: Pick<StoredFingerprint, "fingerprint" | "signalsHash">
): string | undefined {
  return snapshot.signalsHash ?? getFingerprintHash(snapshot.fingerprint);
}