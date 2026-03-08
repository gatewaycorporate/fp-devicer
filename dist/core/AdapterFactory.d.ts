import type { StorageAdapter } from "../types/storage.js";
export type AdapterType = "in-memory" | "sqlite" | "postgres" | "redis";
export interface AdapterFactoryOptions {
    sqlite?: {
        filePath: string;
    };
    postgres?: {
        connectionString: string;
    };
    redis?: {
        url: string;
    };
}
export declare class AdapterFactory {
    static create(type: AdapterType, options?: AdapterFactoryOptions): StorageAdapter;
}
//# sourceMappingURL=AdapterFactory.d.ts.map