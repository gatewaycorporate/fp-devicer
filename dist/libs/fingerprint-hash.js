import { canonicalizedStringify, getHash } from "./tlsh.js";
export function getFingerprintHash(fingerprint) {
    try {
        return getHash(canonicalizedStringify(fingerprint));
    }
    catch {
        return undefined;
    }
}
export function getStoredFingerprintHash(snapshot) {
    return snapshot.signalsHash ?? getFingerprintHash(snapshot.fingerprint);
}
