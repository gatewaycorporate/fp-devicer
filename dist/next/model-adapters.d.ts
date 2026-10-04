import type { Evidence, FingerprintAdapter, Observation, Relationship } from './index.js';
import { type SignalProfile } from './signal-profiles.js';
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
    inputProfile?: SignalProfile;
    featureDimension?: number;
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
    inputProfile?: SignalProfile;
    featureDimension: number;
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
export declare class ModelInputError extends Error {
    readonly code = "invalid_model_input";
    constructor(message: string);
}
export declare class ModelInferenceError extends Error {
    readonly cause?: unknown | undefined;
    readonly code = "model_inference_failed";
    constructor(message: string, cause?: unknown | undefined);
}
export declare class ModelInferenceCancelledError extends Error {
    readonly code = "model_inference_cancelled";
    constructor();
}
export declare function createFaceAdapter<TInput, TFeatures extends VectorModelFeatures>(options: VectorModelAdapterOptions<TInput, TFeatures>): FingerprintAdapter<TInput, TFeatures>;
export declare function createPhysicalFingerprintAdapter<TInput, TFeatures extends VectorModelFeatures>(options: VectorModelAdapterOptions<TInput, TFeatures>): FingerprintAdapter<TInput, TFeatures>;
export declare function createSignatureAdapter<TInput, TFeatures extends VectorModelFeatures>(options: VectorModelAdapterOptions<TInput, TFeatures>): FingerprintAdapter<TInput, TFeatures>;
export declare function createModelBackedAdapter<TInput, TFeatures extends Record<string, unknown>>(options: ModelAdapterOptions<TInput, TFeatures>): FingerprintAdapter<TInput, TFeatures>;
//# sourceMappingURL=model-adapters.d.ts.map