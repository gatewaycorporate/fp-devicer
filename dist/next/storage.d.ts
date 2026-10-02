import type { Observation } from './index.js';
export declare const NEXT_SNAPSHOT_VERSION = "next.observations.v1";
export interface NextSnapshot<TFeatures extends Record<string, unknown> = Record<string, unknown>> {
    version: typeof NEXT_SNAPSHOT_VERSION;
    domain: string;
    schemaVersion: string;
    observations: readonly Observation<TFeatures>[];
}
export interface NextObservationStore<TFeatures extends Record<string, unknown> = Record<string, unknown>> {
    save(observation: Observation<TFeatures>): Promise<void>;
    get(id: string): Promise<Observation<TFeatures> | undefined>;
    all(): Promise<readonly Observation<TFeatures>[]>;
    remove(id: string): Promise<boolean>;
    snapshot(): Promise<NextSnapshot<TFeatures>>;
    restore(snapshot: NextSnapshot<TFeatures>): Promise<void>;
    transaction<TResult>(operation: (store: NextObservationStore<TFeatures>) => Promise<TResult> | TResult): Promise<TResult>;
}
export interface NextSnapshotPersistence {
    read(): Promise<string | undefined>;
    write(snapshot: string): Promise<void>;
}
export declare function createInMemoryNextStore<TFeatures extends Record<string, unknown>>(domain: string, schemaVersion: string): NextObservationStore<TFeatures>;
export declare function createPersistentNextStore<TFeatures extends Record<string, unknown>>(domain: string, schemaVersion: string, persistence: NextSnapshotPersistence): NextObservationStore<TFeatures> & {
    init(): Promise<void>;
};
export declare function validateSnapshot<TFeatures extends Record<string, unknown>>(snapshot: NextSnapshot<TFeatures>, domain: string, schemaVersion: string): void;
//# sourceMappingURL=storage.d.ts.map