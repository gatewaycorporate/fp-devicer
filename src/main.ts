export { FPUserDataSet, FPDataSet, FieldStabilityMap, ScoreBreakdown, AttractorModel } from "./types/data.js";
export { getHash, compareHashes } from "./libs/tlsh.js";
export { StorageAdapter, StoredFingerprint, DeviceMatch } from "./types/storage.js";
export { DriftReport, SuspiciousField, DriftPatternFlag, DriftAnalysisOptions } from "./types/drift.js";
export { IdentityEdge, RelatedDevice } from "./types/identity-graph.js";
export { computeDeviceDrift } from "./libs/drift.js";
export { IdentityGraph, subnetKey, jaccardSimilarity } from "./libs/identity-graph.js";
export {
    DefaultAttractorModel,
    FrequencyTableAttractorModel,
    FrequencyTable,
    createFrequencyTableAttractorModel,
} from "./libs/attractor-model.js";
export {
    LshIndex,
    LshOptions,
    createLshIndex,
    buildLshIndex,
} from "./libs/lsh-index.js";
export {
    calculateConfidence,
    createConfidenceCalculator,
    calculateScoreBreakdown,
    computeAdaptiveStabilityWeights,
    computeAttractorRisk,
    computeEntropyContribution,
    computeEvidenceRichness,
    computeFieldAgreement,
    computeMissingBothSides,
    computeMissingOneSide,
    computeStructuralStability,
    computeTemporalDecayFactor,
    DEFAULT_DECAY_HALF_LIFE_MS,
    DEFAULT_WEIGHTS,
} from "./libs/confidence.js";
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
export { createInMemoryAdapter } from "./libs/adapters/inmemory.js";
export { createSqliteAdapter } from "./libs/adapters/sqlite.js";
export { createPostgresAdapter } from "./libs/adapters/postgres.js";
export { createRedisAdapter } from "./libs/adapters/redis.js";
export {
    DeviceManager,
    DeviceManagerLike,
    IdentifyResult,
    IdentifyContext,
    IdentifyEnrichmentInfo,
    IdentifyPostProcessor,
    IdentifyPostProcessorPayload,
    IdentifyPostProcessorResult
} from "./core/DeviceManager.js";
export { PluginRegistrar, DeviceManagerPlugin } from "./core/PluginRegistrar.js";
export { AdapterFactory, AdapterFactoryOptions } from "./core/AdapterFactory.js";
export { Logger, Metrics, ObservabilityOptions } from "./types/observability.js";
export { defaultLogger, defaultMetrics } from "./libs/default-observability.js";
