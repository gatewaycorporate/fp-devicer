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
    return createVectorAdapter('face', 'face.v1', [sameEnrolledIdentity, sameSubject], options, 'embedding');
}
export function createPhysicalFingerprintAdapter(options) {
    return createVectorAdapter('physical-fingerprint', 'physical-fingerprint.v1', [sameEnrolledIdentity], options, 'template');
}
export function createSignatureAdapter(options) {
    return createModelBackedAdapter({
        domain: 'signature', schemaVersion: 'signature.v1', model: options.model,
        relationships: [sameWriter, sameTranscription], extractorVersions: options.extractorVersions,
        infer: options.infer, runtime: options.runtime, validateInput: options.validateInput, quality: options.quality, qualityGate: options.qualityGate,
        compare(left, right, relation) {
            if (relation.id === sameTranscription.id) {
                const available = left.features.transcription !== undefined && right.features.transcription !== undefined;
                return [createEvidence(left, right, relation, available ? (left.features.transcription === right.features.transcription ? 1 : 0) : Number.NaN, available, 'transcription')];
            }
            return [createVectorEvidence(left, right, relation, 'embedding')];
        },
    });
}
export function createModelBackedAdapter(options) {
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
        normalization: 'adapter-defined',
        runtime: options.model.runtime,
        model: options.model,
    };
    return {
        domain: options.domain,
        schemaVersion: options.schemaVersion,
        extractorVersions: options.extractorVersions,
        relationships: options.relationships,
        configuration,
        async createObservation(input, context) {
            const invalidReason = options.validateInput?.(input);
            if (invalidReason)
                throw new ModelInputError(invalidReason);
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
                extractorVersions: options.extractorVersions,
                features,
                provenance: {
                    modelId: options.model.id,
                    modelVersion: options.model.version,
                    upstreamRevision: options.model.upstreamRevision,
                    checkpointDigest: options.model.checkpointDigest,
                    preprocessing: options.model.preprocessing,
                    runtime: options.model.runtime,
                },
                ...(quality ? { quality } : {}),
                ...(missingness && Object.keys(missingness).length > 0 ? { missingness } : {}),
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
    return createModelBackedAdapter({
        domain, schemaVersion, model: options.model, relationships,
        extractorVersions: options.extractorVersions, infer: options.infer, runtime: options.runtime, quality: options.quality, qualityGate: options.qualityGate,
        validateInput: options.validateInput,
        compare(left, right, relation) {
            return [createVectorEvidence(left, right, relation, vectorKey)];
        },
    });
}
function createVectorEvidence(left, right, relation, key) {
    const leftVector = left.features[key];
    const rightVector = right.features[key];
    const available = Array.isArray(leftVector) && Array.isArray(rightVector);
    return createEvidence(left, right, relation, available ? vectorSimilarity(leftVector, rightVector) : Number.NaN, available, key);
}
function createEvidence(left, right, relation, similarity, available, dependencyGroup) {
    return {
        relation: relation.id, leftObservationId: left.id, rightObservationId: right.id,
        comparatorVersion: `${dependencyGroup}.cosine.v1`, similarity, available, dependencyGroup,
    };
}
function vectorSimilarity(left, right) {
    if (left.length === 0 || left.length !== right.length || !left.every(value => typeof value === 'number') || !right.every(value => typeof value === 'number'))
        return Number.NaN;
    let dot = 0;
    let leftMagnitude = 0;
    let rightMagnitude = 0;
    for (let index = 0; index < left.length; index += 1) {
        const leftValue = left[index];
        const rightValue = right[index];
        dot += leftValue * rightValue;
        leftMagnitude += leftValue ** 2;
        rightMagnitude += rightValue ** 2;
    }
    if (leftMagnitude === 0 || rightMagnitude === 0)
        return Number.NaN;
    return Math.max(0, Math.min(1, (dot / Math.sqrt(leftMagnitude * rightMagnitude) + 1) / 2));
}
