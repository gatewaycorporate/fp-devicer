import type { NextObservationStore } from './storage.js';
export type SqliteNextStore = NextObservationStore & {
    init(): Promise<void>;
    close(): void;
};
export declare function createSqliteNextStore(databasePath: string, domain: string, schemaVersion: string): SqliteNextStore;
//# sourceMappingURL=sqlite-storage.d.ts.map