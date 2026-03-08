export { FPUserDataSet, FPDataSet } from "./types/data.js";
export { getHash, compareHashes } from "./libs/tlsh.js";
export { StorageAdapter, StoredFingerprint, DeviceMatch } from "./types/storage.js";
export { calculateConfidence, createConfidenceCalculator } from "./libs/confidence.js";
export {
    registerComparator,
    registerWeight,
    registerPlugin,
    unregisterComparator,
    unregisterWeight,
    setDefaultWeight,
    clearRegistry,
    initializeDefaultRegistry
} from "./libs/registry.js";
export { createInMemoryAdapter } from "./libs/storage.js";
export { createSqliteAdapter } from "./libs/adapters/sqlite.js";
export { createPostgresAdapter } from "./libs/adapters/postgres.js";
export { createRedisAdapter } from "./libs/adapters/redis.js";
export { DeviceManager } from "./core/DeviceManager.js";
