import type { FPDataSet } from "../types/data.js";
import type { StoredFingerprint } from "../types/storage.js";
export declare function getFingerprintHash(fingerprint: FPDataSet): string | undefined;
export declare function getStoredFingerprintHash(snapshot: Pick<StoredFingerprint, "fingerprint" | "signalsHash">): string | undefined;
//# sourceMappingURL=fingerprint-hash.d.ts.map