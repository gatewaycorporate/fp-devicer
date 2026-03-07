export { FPUserDataSet, FPDataSet } from "./types/data";
export { StorageAdapter, StoredFingerprint, DeviceMatch } from "./types/storage";
export { calculateConfidence, createConfidenceCalculator } from "./libs/confidence";
export {
    registerComparator,
    registerWeight,
    registerPlugin,
    unregisterComparator,
    unregisterWeight,
    setDefaultWeight,
    clearRegistry,
    initializeDefaultRegistry
} from "./libs/registry";
export { createInMemoryAdapter } from "./libs/storage";
export { DeviceManager } from "./core/DeviceManager";