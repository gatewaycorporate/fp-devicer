import type { NextObservationStore } from './storage.js';
export type PostgresNextStore = NextObservationStore & {
    init(): Promise<void>;
    close(): Promise<void>;
};
export declare function createPostgresNextStore(connectionString: string, domain: string, schemaVersion: string): PostgresNextStore;
//# sourceMappingURL=postgres-storage.d.ts.map