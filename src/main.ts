export { FPUserDataSet, FPDataSet } from "./types/data.ts";
export { getHash, compareHashes } from "./libs/tlsh.ts";
export { StorageAdapter, StoredFingerprint, DeviceMatch } from "./types/storage.ts";
export { calculateConfidence, createConfidenceCalculator } from "./libs/confidence.ts";
export {
    registerComparator,
    registerWeight,
    registerPlugin,
    unregisterComparator,
    unregisterWeight,
    setDefaultWeight,
    clearRegistry,
    initializeDefaultRegistry
} from "./libs/registry.ts";
export { createInMemoryAdapter } from "./libs/storage.ts";
export { DeviceManager } from "./core/DeviceManager.ts";