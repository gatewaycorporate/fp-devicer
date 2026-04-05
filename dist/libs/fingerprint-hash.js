import { canonicalizedStringify, getHash } from "./tlsh.js";
export const VOLATILE_FIELDS = ["behavioralMetrics"];
export function toComparableFingerprint(fingerprint) {
    const comparable = { ...fingerprint };
    for (const field of VOLATILE_FIELDS) {
        delete comparable[field];
    }
    return comparable;
}
export function getFingerprintHash(fingerprint) {
    try {
        return getHash(canonicalizedStringify(toComparableFingerprint(fingerprint)));
    }
    catch {
        return undefined;
    }
}
export function getStoredFingerprintHash(snapshot) {
    return snapshot.signalsHash ?? getFingerprintHash(snapshot.fingerprint);
}
