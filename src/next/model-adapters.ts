import type { Evidence, FingerprintAdapter, Observation, Relationship } from './index.js';

export interface ModelArtifactManifest {
  id: string;
  name: string;
  version: string;
  sourceRepository: string;
  upstreamRevision: string;
  checkpointDigest: string;
  license: string;
  runtime: string;
  preprocessing: string;
  supportedHardware: readonly string[];
  inputSchema: string;
  outputSchema: string;
  components?: readonly ModelArtifactManifest[];
}

export interface ModelAdapterOptions<TInput, TFeatures extends Record<string, unknown>> {
  domain: string;
  schemaVersion: string;
  model: ModelArtifactManifest;
  relationships: readonly Relationship[];
  extractorVersions: Record<string, string>;
  infer?(input: TInput, context: ModelInferenceContext): Promise<TFeatures> | TFeatures;
  runtime?: ModelRuntime<TInput, TFeatures>;
  validateInput?(input: TInput): string | undefined;
  compare(left: Observation<TFeatures>, right: Observation<TFeatures>, relation: Relationship): Evidence[];
  quality?(features: TFeatures): Record<string, number>;
  qualityGate?(features: TFeatures): string | undefined;
}

export interface VectorModelFeatures extends Record<string, unknown> {
  embedding?: readonly number[];
  template?: readonly number[];
  transcription?: string;
}

export interface VectorModelAdapterOptions<TInput, TFeatures extends VectorModelFeatures> {
  model: ModelArtifactManifest;
  infer?(input: TInput, context: ModelInferenceContext): Promise<TFeatures> | TFeatures;
  runtime?: ModelRuntime<TInput, TFeatures>;
  validateInput?(input: TInput): string | undefined;
  extractorVersions: Record<string, string>;
  quality?(features: TFeatures): Record<string, number>;
  qualityGate?(features: TFeatures): string | undefined;
}

export interface ModelInferenceContext {
  readonly requestId?: string;
  readonly signal?: AbortSignal;
}

export interface ModelRuntime<TInput, TFeatures extends Record<string, unknown>> {
  infer(input: TInput, context: ModelInferenceContext): Promise<TFeatures> | TFeatures;
  close?(): Promise<void> | void;
}

export class ModelInputError extends Error {
  readonly code = 'invalid_model_input';

  constructor(message: string) {
    super(message);
    this.name = 'ModelInputError';
  }
}

export class ModelInferenceError extends Error {
  readonly code = 'model_inference_failed';

  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'ModelInferenceError';
  }
}

export class ModelInferenceCancelledError extends Error {
  readonly code = 'model_inference_cancelled';

  constructor() {
    super('Model inference was cancelled');
    this.name = 'ModelInferenceCancelledError';
  }
}

const sameEnrolledIdentity: Relationship = {
  id: 'same-enrolled-identity', direction: 'undirected', description: 'sample verified against one enrolled identity',
};
const sameSubject: Relationship = {
  id: 'same-subject', direction: 'undirected', description: 'samples produced by the same subject',
};
const sameWriter: Relationship = {
  id: 'same-writer', direction: 'undirected', description: 'samples produced by the same writer',
};
const sameTranscription: Relationship = {
  id: 'same-transcription', direction: 'undirected', description: 'samples carrying the same transcription',
};

export function createFaceAdapter<TInput, TFeatures extends VectorModelFeatures>(
  options: VectorModelAdapterOptions<TInput, TFeatures>,
): FingerprintAdapter<TInput, TFeatures> {
  return createVectorAdapter('face', 'face.v1', [sameEnrolledIdentity, sameSubject], options, 'embedding');
}

export function createPhysicalFingerprintAdapter<TInput, TFeatures extends VectorModelFeatures>(
  options: VectorModelAdapterOptions<TInput, TFeatures>,
): FingerprintAdapter<TInput, TFeatures> {
  return createVectorAdapter('physical-fingerprint', 'physical-fingerprint.v1', [sameEnrolledIdentity], options, 'template');
}

export function createSignatureAdapter<TInput, TFeatures extends VectorModelFeatures>(
  options: VectorModelAdapterOptions<TInput, TFeatures>,
): FingerprintAdapter<TInput, TFeatures> {
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

export function createModelBackedAdapter<TInput, TFeatures extends Record<string, unknown>>(
  options: ModelAdapterOptions<TInput, TFeatures>,
): FingerprintAdapter<TInput, TFeatures> {
  if (!options.model.id.trim() || !options.model.name.trim() || !options.model.version.trim() || !options.model.sourceRepository.trim()) {
    throw new Error('Model identity and version are required');
  }
  if (!options.model.checkpointDigest.trim()) throw new Error('Model checkpoint digest is required');
  if (!options.infer && !options.runtime) throw new Error('Model inference runtime is required');
  if (!options.model.upstreamRevision.trim()) throw new Error('Model upstream revision is required');
  if (!options.model.license.trim()) throw new Error('Model license is required');
  if (!options.model.runtime.trim()) throw new Error('Model runtime is required');
  if (!options.model.preprocessing.trim()) throw new Error('Model preprocessing is required');
  if (options.model.supportedHardware.length === 0 || options.model.supportedHardware.some(item => !item.trim())) throw new Error('Model supported hardware is required');
  if (!options.model.inputSchema.trim() || !options.model.outputSchema.trim()) throw new Error('Model input and output schemas are required');
  for (const component of options.model.components ?? []) {
    if (!component.id.trim() || !component.checkpointDigest.trim() || !component.upstreamRevision.trim()) {
      throw new Error('Model pipeline components require identity, revision, and checkpoint provenance');
    }
  }
  if (options.relationships.length === 0) throw new Error('At least one model relationship is required');

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
      if (invalidReason) throw new ModelInputError(invalidReason);
      if (context?.signal?.aborted) throw new ModelInferenceCancelledError();
      const inferenceContext: ModelInferenceContext = { signal: context?.signal };
      let features: TFeatures;
      try {
        features = await (options.runtime?.infer(input, inferenceContext) ?? options.infer!(input, inferenceContext));
      } catch (error) {
        if (error instanceof ModelInputError || error instanceof ModelInferenceCancelledError) throw error;
        throw new ModelInferenceError(`Model inference failed for ${options.domain}`, error);
      }
      if (context?.signal?.aborted) throw new ModelInferenceCancelledError();
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

function createVectorAdapter<TInput, TFeatures extends VectorModelFeatures>(
  domain: string,
  schemaVersion: string,
  relationships: readonly Relationship[],
  options: VectorModelAdapterOptions<TInput, TFeatures>,
  vectorKey: 'embedding' | 'template',
): FingerprintAdapter<TInput, TFeatures> {
  return createModelBackedAdapter({
    domain, schemaVersion, model: options.model, relationships,
    extractorVersions: options.extractorVersions, infer: options.infer, runtime: options.runtime, quality: options.quality, qualityGate: options.qualityGate,
    validateInput: options.validateInput,
    compare(left, right, relation) {
      return [createVectorEvidence(left, right, relation, vectorKey)];
    },
  });
}

function createVectorEvidence<TFeatures extends VectorModelFeatures>(
  left: Observation<TFeatures>,
  right: Observation<TFeatures>,
  relation: Relationship,
  key: 'embedding' | 'template',
): Evidence {
  const leftVector = left.features[key];
  const rightVector = right.features[key];
  const available = Array.isArray(leftVector) && Array.isArray(rightVector);
  return createEvidence(left, right, relation, available ? vectorSimilarity(leftVector, rightVector) : Number.NaN, available, key);
}

function createEvidence<TFeatures extends Record<string, unknown>>(
  left: Observation<TFeatures>,
  right: Observation<TFeatures>,
  relation: Relationship,
  similarity: number,
  available: boolean,
  dependencyGroup: string,
): Evidence {
  return {
    relation: relation.id, leftObservationId: left.id, rightObservationId: right.id,
    comparatorVersion: `${dependencyGroup}.cosine.v1`, similarity, available, dependencyGroup,
  };
}

function vectorSimilarity(left: readonly unknown[], right: readonly unknown[]): number {
  if (left.length === 0 || left.length !== right.length || !left.every(value => typeof value === 'number') || !right.every(value => typeof value === 'number')) return Number.NaN;
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] as number;
    const rightValue = right[index] as number;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue ** 2;
    rightMagnitude += rightValue ** 2;
  }
  if (leftMagnitude === 0 || rightMagnitude === 0) return Number.NaN;
  return Math.max(0, Math.min(1, (dot / Math.sqrt(leftMagnitude * rightMagnitude) + 1) / 2));
}