import { assertSignalProfile, FINGERPRINT_500_DPI, SIGNATURE_224, signalAcquisition, validateSignal } from './signal-profiles.js';
import { vectorSimilarity } from './vector-similarity.js';
export class ModelInputError extends Error {
    code = 'invalid_model_input';
    constructor(message) {
        super(message);
        this.name = 'ModelInputError';
    }
}
export class ModelInferenceError extends Error {
    cause;
    code = 'model_inference_failed';
    constructor(message, cause) {
        super(message);
        this.cause = cause;
        this.name = 'ModelInferenceError';
    }
}
export class ModelInferenceCancelledError extends Error {
    code = 'model_inference_cancelled';
    constructor() {
        super('Model inference was cancelled');
        this.name = 'ModelInferenceCancelledError';
    }
}
const sameEnrolledIdentity = {
    id: 'same-enrolled-identity', direction: 'undirected', description: 'sample verified against one enrolled identity',
};
const sameSubject = {
    id: 'same-subject', direction: 'undirected', description: 'samples produced by the same subject',
};
const sameWriter = {
    id: 'same-writer', direction: 'undirected', description: 'samples produced by the same writer',
};
const sameTranscription = {
    id: 'same-transcription', direction: 'undirected', description: 'samples carrying the same transcription',
};
export function createFaceAdapter(options) {
    if (!options.inputProfile)
        throw new Error('Face adapters require an explicit input profile');
    if (options.inputProfile.kind === 'raster' && (!options.inputProfile.width || !options.inputProfile.height)) {
        throw new Error('Face raster profiles require explicit dimensions');
    }
    return createVectorAdapter('face', 'face.v1', [sameEnrolledIdentity, sameSubject], options, 'embedding');
}
export function createPhysicalFingerprintAdapter(options) {
    if (options.inputProfile?.kind === 'raster' && options.inputProfile.dpi === undefined) {
        throw new Error('Fingerprint raster profiles require acquisition DPI');
    }
    return createVectorAdapter('physical-fingerprint', 'physical-fingerprint.v1', [sameEnrolledIdentity], {
        ...options, inputProfile: options.inputProfile ?? FINGERPRINT_500_DPI,
    }, 'template');
}
export function createSignatureAdapter(options) {
    if (options.inputProfile?.kind === 'raster' && (!options.inputProfile.width || !options.inputProfile.height
        || options.inputProfile.preprocessing !== 'fit-pad-white')) {
        throw new Error('Signature raster profiles require explicit fit-and-pad normalization');
    }
    assertFeatureDimension(options.featureDimension);
    const featureDimension = options.featureDimension;
    return createModelBackedAdapter({
        domain: 'signature', schemaVersion: 'signature.v1', model: options.model,
        inputProfile: options.inputProfile ?? SIGNATURE_224, featureDimension: options.featureDimension,
        relationships: [sameWriter, sameTranscription], extractorVersions: options.extractorVersions,
        infer: options.infer, runtime: options.runtime, validateInput: options.validateInput, quality: options.quality, qualityGate: options.qualityGate,
        compare(left, right, relation) {
            if (relation.id === sameTranscription.id) {
                const available = typeof left.features.transcription === 'string' && typeof right.features.transcription === 'string';
                return [createEvidence(left, right, relation, available ? (left.features.transcription === right.features.transcription ? 1 : 0) : Number.NaN, available, 'transcription')];
            }
            return [createVectorEvidence(left, right, relation, 'embedding', featureDimension)];
        },
    });
}
export function createModelBackedAdapter(options) {
    options = structuredCloneOptions(options);
    if (options.inputProfile)
        assertSignalProfile(options.inputProfile);
    if (options.featureDimension !== undefined)
        assertFeatureDimension(options.featureDimension);
    if (!options.model.id.trim() || !options.model.name.trim() || !options.model.version.trim() || !options.model.sourceRepository.trim()) {
        throw new Error('Model identity and version are required');
    }
    if (!options.model.checkpointDigest.trim())
        throw new Error('Model checkpoint digest is required');
    if (!options.infer && !options.runtime)
        throw new Error('Model inference runtime is required');
    if (!options.model.upstreamRevision.trim())
        throw new Error('Model upstream revision is required');
    if (!options.model.license.trim())
        throw new Error('Model license is required');
    if (!options.model.runtime.trim())
        throw new Error('Model runtime is required');
    if (!options.model.preprocessing.trim())
        throw new Error('Model preprocessing is required');
    if (options.model.supportedHardware.length === 0 || options.model.supportedHardware.some(item => !item.trim()))
        throw new Error('Model supported hardware is required');
    if (!options.model.inputSchema.trim() || !options.model.outputSchema.trim())
        throw new Error('Model input and output schemas are required');
    for (const component of options.model.components ?? []) {
        if (!component.id.trim() || !component.checkpointDigest.trim() || !component.upstreamRevision.trim()) {
            throw new Error('Model pipeline components require identity, revision, and checkpoint provenance');
        }
    }
    if (options.relationships.length === 0)
        throw new Error('At least one model relationship is required');
    const configuration = {
        schemaVersion: options.schemaVersion,
        domain: options.domain,
        extractors: options.extractorVersions,
        comparators: { [`${options.domain}-model`]: `${options.model.name}@${options.model.version}` },
        fusion: 'model.v1',
        normalization: options.inputProfile?.id ?? options.model.preprocessing,
        runtime: options.model.runtime,
        model: options.model,
        ...(options.inputProfile ? { signalProfile: options.inputProfile } : {}),
        ...(options.featureDimension !== undefined ? { featureDimension: options.featureDimension } : {}),
    };
    return {
        domain: options.domain,
        schemaVersion: options.schemaVersion,
        extractorVersions: options.extractorVersions,
        relationships: options.relationships,
        configuration,
        async createObservation(input, context) {
            const invalidReason = (options.inputProfile ? validateSignal(input, options.inputProfile) : undefined)
                ?? options.validateInput?.(input);
            if (invalidReason)
                throw new ModelInputError(invalidReason);
            const acquisition = options.inputProfile ? signalAcquisition(input, options.inputProfile) : {};
            for (const [key, value] of Object.entries(acquisition)) {
                if (context?.acquisition?.[key] !== undefined && context.acquisition[key] !== value) {
                    throw new ModelInputError(`acquisition_metadata_mismatch: ${key}`);
                }
            }
            if (context?.signal?.aborted)
                throw new ModelInferenceCancelledError();
            const inferenceContext = { signal: context?.signal };
            let features;
            try {
                features = await (options.runtime?.infer(input, inferenceContext) ?? options.infer(input, inferenceContext));
            }
            catch (error) {
                if (error instanceof ModelInputError || error instanceof ModelInferenceCancelledError)
                    throw error;
                throw new ModelInferenceError(`Model inference failed for ${options.domain}`, error);
            }
            if (context?.signal?.aborted)
                throw new ModelInferenceCancelledError();
            const quality = options.quality?.(features);
            const missingness = quality
                ? Object.fromEntries(Object.entries(quality).filter(([, value]) => value <= 0).map(([key]) => [key, 'quality_unavailable']))
                : undefined;
            return {
                id: context?.id ?? `${options.domain}-${JSON.stringify(features)}`,
                domain: options.domain,
                schemaVersion: options.schemaVersion,
                observedAt: (context?.observedAt ?? new Date()).toISOString(),
                extractorVersions: { ...options.extractorVersions },
                features,
                provenance: {
                    modelId: options.model.id,
                    modelVersion: options.model.version,
                    upstreamRevision: options.model.upstreamRevision,
                    checkpointDigest: options.model.checkpointDigest,
                    preprocessing: options.model.preprocessing,
                    runtime: options.model.runtime,
                    ...(options.inputProfile ? { signalProfile: options.inputProfile.id } : {}),
                    ...(options.featureDimension !== undefined ? { featureDimension: String(options.featureDimension) } : {}),
                    modelManifest: JSON.stringify(options.model),
                    ...(options.inputProfile ? { signalProfileManifest: JSON.stringify(options.inputProfile) } : {}),
                },
                ...(quality ? { quality } : {}),
                ...(missingness && Object.keys(missingness).length > 0 ? { missingness } : {}),
                ...(context?.acquisition || Object.keys(acquisition).length ? { acquisition: { ...context?.acquisition, ...acquisition } } : {}),
            };
        },
        compare(left, right, relation) {
            const leftFailure = options.qualityGate?.(left.features);
            const rightFailure = options.qualityGate?.(right.features);
            if (leftFailure || rightFailure) {
                return [{
                        relation: relation.id, leftObservationId: left.id, rightObservationId: right.id,
                        comparatorVersion: `${options.domain}-quality.v1`, similarity: Number.NaN,
                        available: false, dependencyGroup: 'quality',
                        explanation: [leftFailure, rightFailure].filter(Boolean).join('; '),
                    }];
            }
            return options.compare(left, right, relation);
        },
        ...(options.runtime?.close ? { close: options.runtime.close.bind(options.runtime) } : {}),
    };
}
function createVectorAdapter(domain, schemaVersion, relationships, options, vectorKey) {
    assertFeatureDimension(options.featureDimension);
    const featureDimension = options.featureDimension;
    return createModelBackedAdapter({
        domain, schemaVersion, model: options.model, relationships,
        inputProfile: options.inputProfile, featureDimension: options.featureDimension,
        extractorVersions: options.extractorVersions, infer: options.infer, runtime: options.runtime, quality: options.quality, qualityGate: options.qualityGate,
        validateInput: options.validateInput,
        compare(left, right, relation) {
            return [createVectorEvidence(left, right, relation, vectorKey, featureDimension)];
        },
    });
}
function assertFeatureDimension(dimension) {
    if (!Number.isSafeInteger(dimension) || dimension <= 0)
        throw new Error('A positive feature dimension is required');
}
function structuredCloneOptions(options) {
    return {
        ...options, model: structuredClone(options.model), extractorVersions: { ...options.extractorVersions },
        ...(options.inputProfile ? { inputProfile: { ...options.inputProfile } } : {}),
    };
}
function createVectorEvidence(left, right, relation, key, dimension) {
    const leftVector = left.features[key];
    const rightVector = right.features[key];
    const similarity = vectorSimilarity(leftVector, rightVector, dimension);
    return createEvidence(left, right, relation, similarity, Number.isFinite(similarity), key);
}
function createEvidence(left, right, relation, similarity, available, dependencyGroup) {
    return {
        relation: relation.id, leftObservationId: left.id, rightObservationId: right.id,
        comparatorVersion: dependencyGroup === 'transcription' ? 'transcription.exact.v1' : `${dependencyGroup}.cosine.v2`,
        similarity, available, dependencyGroup,
        ...(!available ? { explanation: dependencyGroup === 'transcription' ? 'transcription_unavailable' : 'invalid_vector' } : {}),
    };
}
