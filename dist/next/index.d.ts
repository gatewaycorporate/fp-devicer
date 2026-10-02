import type { ModelArtifactManifest } from './model-adapters.js';
export * from './node-model-runtime.js';
export type CalibrationStatus = "uncalibrated" | "supported" | "insufficient_data" | "stale" | "unsupported_configuration";
export type MatchDecision = "match" | "non_match" | "insufficient_evidence";
export interface Observation<TFeatures extends Record<string, unknown> = Record<string, unknown>> {
    id: string;
    domain: string;
    schemaVersion: string;
    observedAt: string;
    extractorVersions: Record<string, string>;
    features: TFeatures;
    quality?: Record<string, number>;
    missingness?: Record<string, string>;
    provenance?: Record<string, string>;
}
export interface Relationship {
    id: string;
    direction: "directed" | "undirected";
    description: string;
}
export interface Evidence {
    relation: string;
    leftObservationId: string;
    rightObservationId: string;
    comparatorVersion: string;
    similarity: number;
    available: boolean;
    quality?: number;
    dependencyGroup?: string;
    explanation?: string;
}
export interface Configuration {
    schemaVersion: string;
    domain: string;
    extractors: Record<string, string>;
    comparators: Record<string, string>;
    fusion: string;
    normalization: string;
    runtime: string;
    model?: ModelArtifactManifest;
    digest: string;
}
export interface ComparisonResult {
    evidence: Evidence[];
    similarity: number | null;
    status: CalibrationStatus;
    configuration: Configuration;
}
export interface MatchResult {
    candidateObservationId?: string;
    similarity: number | null;
    decision: MatchDecision;
    calibrationStatus: CalibrationStatus;
    reasonCodes: string[];
    evidence: Evidence[];
    configuration: Configuration;
}
export interface FingerprintAdapter<TInput, TFeatures extends Record<string, unknown>> {
    readonly domain: string;
    readonly schemaVersion: string;
    readonly extractorVersions: Record<string, string>;
    readonly relationships: readonly Relationship[];
    readonly configuration: Omit<Configuration, "digest">;
    createObservation(input: TInput, context?: {
        observedAt?: Date;
        id?: string;
        signal?: AbortSignal;
    }): Promise<Observation<TFeatures>> | Observation<TFeatures>;
    compare(left: Observation<TFeatures>, right: Observation<TFeatures>, relation: Relationship): Evidence[];
}
export interface MatchOptions {
    relation: string;
    minimumSimilarity: number;
    calibrationStatus?: CalibrationStatus;
}
export declare class InstanceRegistry {
    private readonly adapters;
    register<TInput, TFeatures extends Record<string, unknown>>(adapter: FingerprintAdapter<TInput, TFeatures>): () => void;
    get<TInput, TFeatures extends Record<string, unknown>>(domain: string): FingerprintAdapter<TInput, TFeatures> | undefined;
    domains(): string[];
}
export declare function createExactContentId(domain: string, schemaVersion: string, features: Record<string, unknown>): Promise<string>;
export declare function createBrowserAdapter(): FingerprintAdapter<Record<string, unknown>, Record<string, unknown>>;
export declare function createDocumentAdapter(): FingerprintAdapter<{
    text: string;
}, {
    text: string;
}>;
export declare function createFingerprint<TInput, TFeatures extends Record<string, unknown>>(adapter: FingerprintAdapter<TInput, TFeatures>, input: TInput, context?: {
    observedAt?: Date;
    id?: string;
    signal?: AbortSignal;
}): Promise<Observation<TFeatures>>;
export declare function compareFingerprints<TInput, TFeatures extends Record<string, unknown>>(adapter: FingerprintAdapter<TInput, TFeatures>, left: Observation<TFeatures>, right: Observation<TFeatures>, relation?: string): Promise<ComparisonResult>;
export declare function matchFingerprint<TInput, TFeatures extends Record<string, unknown>>(adapter: FingerprintAdapter<TInput, TFeatures>, incoming: Observation<TFeatures>, candidates: readonly Observation<TFeatures>[], options: MatchOptions): Promise<MatchResult>;
export declare function updateFingerprintHistory<TFeatures extends Record<string, unknown>>(history: readonly Observation<TFeatures>[], observation: Observation<TFeatures>): Observation<TFeatures>[];
export * from './calibration.js';
export * from './adaptation.js';
export * from './domain-adapters.js';
export * from './retrieval.js';
export * from './artifacts.js';
export * from './storage.js';
export * from './model-adapters.js';
export * from './evaluation.js';
export * from './governance.js';
export * from './benchmark.js';
//# sourceMappingURL=index.d.ts.map