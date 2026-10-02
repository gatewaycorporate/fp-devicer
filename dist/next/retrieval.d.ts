import { type Observation } from './index.js';
export interface RetrievalIndexManifest {
    indexVersion: string;
    domain: string;
    schemaVersion: string;
    observationCount: number;
    contentIds: readonly string[];
}
export interface RetrievalResult<TFeatures extends Record<string, unknown>> {
    contentId: string;
    observation: Observation<TFeatures>;
}
export interface RetrievalSnapshot<TFeatures extends Record<string, unknown>> {
    indexVersion: string;
    domain: string;
    schemaVersion: string;
    entries: readonly RetrievalResult<TFeatures>[];
}
export interface RetrievalRecallReport {
    k: number;
    queries: number;
    queriesWithExactMatches: number;
    hitsAtK: number;
    recallAtK: number | null;
}
export declare class ExactRetrievalIndex<TFeatures extends Record<string, unknown>> {
    readonly domain: string;
    readonly schemaVersion: string;
    readonly indexVersion: string;
    private readonly entries;
    constructor(domain: string, schemaVersion: string, indexVersion?: string);
    add(observation: Observation<TFeatures>): Promise<string>;
    remove(observationId: string): boolean;
    clear(): void;
    rebuild(observations: readonly Observation<TFeatures>[]): Promise<RetrievalIndexManifest>;
    findExact(features: TFeatures, limit?: number): Promise<readonly RetrievalResult<TFeatures>[]>;
    all(): readonly RetrievalResult<TFeatures>[];
    page(offset: number, limit: number): readonly RetrievalResult<TFeatures>[];
    manifest(): RetrievalIndexManifest;
    snapshot(): RetrievalSnapshot<TFeatures>;
    restore(snapshot: RetrievalSnapshot<TFeatures>): Promise<void>;
    private assertObservation;
}
export declare function exhaustiveCandidates<TFeatures extends Record<string, unknown>>(observations: readonly Observation<TFeatures>[]): readonly Observation<TFeatures>[];
export declare function evaluateExactRecall<TFeatures extends Record<string, unknown>>(index: ExactRetrievalIndex<TFeatures>, queries: readonly TFeatures[], k: number): Promise<RetrievalRecallReport>;
//# sourceMappingURL=retrieval.d.ts.map