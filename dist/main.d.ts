export { FPUserDataSet, FPDataSet, FieldStabilityMap, ScoreBreakdown } from "./types/data.js";
export { getHash, compareHashes } from "./libs/tlsh.js";
export { StorageAdapter, StoredFingerprint, DeviceMatch } from "./types/storage.js";
export { calculateConfidence, createConfidenceCalculator, calculateScoreBreakdown, computeAdaptiveStabilityWeights, computeAttractorRisk, computeEntropyContribution, computeEvidenceRichness, computeFieldAgreement, computeMissingBothSides, computeMissingOneSide, computeStructuralStability } from "./libs/confidence.js";
export { registerComparator, registerWeight, registerPlugin, unregisterComparator, unregisterWeight, setDefaultWeight, clearRegistry, initializeDefaultRegistry } from "./libs/registry.js";
export { createInMemoryAdapter } from "./libs/adapters/inmemory.js";
export { createSqliteAdapter } from "./libs/adapters/sqlite.js";
export { createPostgresAdapter } from "./libs/adapters/postgres.js";
export { createRedisAdapter } from "./libs/adapters/redis.js";
export { DeviceManager, DeviceManagerLike, IdentifyResult, IdentifyContext, IdentifyEnrichmentInfo, IdentifyPostProcessor, IdentifyPostProcessorPayload, IdentifyPostProcessorResult } from "./core/DeviceManager.js";
export { PluginRegistrar, DeviceManagerPlugin } from "./core/PluginRegistrar.js";
export { AdapterFactory, AdapterFactoryOptions } from "./core/AdapterFactory.js";
export { Logger, Metrics, ObservabilityOptions } from "./types/observability.js";
export { defaultLogger, defaultMetrics } from "./libs/default-observability.js";
//# sourceMappingURL=main.d.ts.map