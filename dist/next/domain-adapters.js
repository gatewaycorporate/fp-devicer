import { vectorSimilarity } from './vector-similarity.js';
function validateOptions(options) {
    if (!options || !Number.isSafeInteger(options.featureDimension) || options.featureDimension <= 0
        || !options.extractorVersion?.trim())
        throw new Error('Feature dimension and extractor version are required');
}
const sameWriter = {
    id: "same-writer", direction: "undirected", description: "samples produced by the same writer",
};
const sameTranscription = {
    id: "same-transcription", direction: "undirected", description: "samples carrying the same transcription",
};
const sameEnrolledIdentity = {
    id: "same-enrolled-identity", direction: "undirected", description: "sample verified against one enrolled identity",
};
export function createHandwritingAdapter(options) {
    validateOptions(options);
    options = { ...options };
    const extractorVersions = { embedding: options.extractorVersion, transcription: options.extractorVersion };
    return {
        domain: "handwriting",
        schemaVersion: "handwriting.v1",
        extractorVersions,
        relationships: [sameWriter, sameTranscription],
        configuration: {
            schemaVersion: "handwriting.v1", domain: "handwriting",
            extractors: extractorVersions,
            comparators: { embedding: "cosine.v2", transcription: "exact.v1" },
            fusion: "relation-specific.v1", normalization: "cosine-scaled.v2", runtime: "next.v1",
            featureDimension: options.featureDimension,
        },
        createObservation(input, context) {
            return createObservation("handwriting", "handwriting.v1", input, context, extractorVersions, options.featureDimension, {
                embedding: input.embedding ? 1 : 0, transcription: input.transcription ? 1 : 0,
            });
        },
        compare(left, right, relation) {
            if (relation.id === sameTranscription.id) {
                const available = typeof left.features.transcription === 'string' && typeof right.features.transcription === 'string';
                return evidence(left, right, relation, available ? (left.features.transcription === right.features.transcription ? 1 : 0) : Number.NaN, available, "transcription");
            }
            const similarity = vectorSimilarity(left.features.embedding, right.features.embedding, options.featureDimension);
            return evidence(left, right, relation, similarity, Number.isFinite(similarity), "embedding");
        },
    };
}
export function createEnrolledBiometricAdapter(modality, options) {
    if (!modality.trim())
        throw new Error("Biometric modality is required");
    validateOptions(options);
    options = { ...options };
    const extractorVersions = { template: options.extractorVersion };
    return {
        domain: `biometric:${modality}`,
        schemaVersion: "biometric.v1",
        extractorVersions,
        relationships: [sameEnrolledIdentity],
        configuration: {
            schemaVersion: "biometric.v1", domain: `biometric:${modality}`,
            extractors: extractorVersions,
            comparators: { template: "cosine.v2" },
            fusion: "single-source.v1", normalization: "cosine-scaled.v2", runtime: "next.v1",
            featureDimension: options.featureDimension,
        },
        createObservation(input, context) {
            return createObservation(`biometric:${modality}`, "biometric.v1", input, context, extractorVersions, options.featureDimension, {
                template: input.template ? 1 : 0,
            });
        },
        compare(left, right, relation) {
            const similarity = left.features.modality === modality && right.features.modality === modality
                ? vectorSimilarity(left.features.template, right.features.template, options.featureDimension) : Number.NaN;
            return evidence(left, right, relation, similarity, Number.isFinite(similarity), "template");
        },
    };
}
function createObservation(domain, schemaVersion, features, context, extractorVersions, featureDimension, quality) {
    return {
        id: context?.id ?? `${domain}-${JSON.stringify(features)}`,
        domain, schemaVersion,
        observedAt: (context?.observedAt ?? new Date()).toISOString(),
        extractorVersions: { ...extractorVersions },
        provenance: { featureDimension: String(featureDimension) },
        features, quality,
        ...(context?.acquisition ? { acquisition: context.acquisition } : {}),
        missingness: Object.fromEntries(Object.entries(quality).filter(([, value]) => value === 0).map(([key]) => [key, "not_provided"])),
    };
}
function evidence(left, right, relation, similarity, available, dependencyGroup) {
    return [{
            relation: relation.id, leftObservationId: left.id, rightObservationId: right.id,
            comparatorVersion: dependencyGroup === 'transcription' ? 'transcription.exact.v1' : `${dependencyGroup}.cosine.v2`,
            similarity, available, dependencyGroup,
            ...(!available ? { explanation: dependencyGroup === 'transcription' ? 'transcription_unavailable' : 'invalid_vector' } : {}),
        }];
}
