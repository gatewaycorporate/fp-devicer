import type { NextObservationStore } from './storage.js';
export type RedisNextStore = NextObservationStore & {
    init(): Promise<void>;
    close(): Promise<void>;
};
export declare function createRedisNextStore(redisUrl: string | undefined, domain: string, schemaVersion: string): RedisNextStore;
//# sourceMappingURL=redis-storage.d.ts.map