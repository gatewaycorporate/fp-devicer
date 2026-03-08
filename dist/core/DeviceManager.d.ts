import type { StorageAdapter } from "../types/storage.js";
import type { FPDataSet } from "../types/data.js";
export declare class DeviceManager {
    private adapter;
    private context;
    constructor(adapter: StorageAdapter, context?: {
        matchThreshold?: number;
        candidateMinScore?: number;
    });
    identify(incoming: FPDataSet, context?: {
        userId?: string;
        ip?: string;
    }): Promise<{
        deviceId: string;
        confidence: number;
        isNewDevice: boolean;
        linkedUserId: string | undefined;
    }>;
}
//# sourceMappingURL=DeviceManager.d.ts.map