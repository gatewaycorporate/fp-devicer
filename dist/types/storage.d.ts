import type { FPDataSet } from "./data";
export interface StoredFingerprint {
    id: string;
    deviceId: string;
    userId?: string;
    timestamp: Date;
    fingerprint: FPDataSet;
    ip?: string;
    signalsHash?: string;
    metadata?: Record<string, any>;
}
export interface DeviceMatch {
    deviceId: string;
    confidence: number;
    lastSeen: Date;
}
export interface StorageAdapter {
    init(): Promise<void>;
    save(snapshot: StoredFingerprint): Promise<string>;
    getHistory(deviceId: string, limit?: number): Promise<StoredFingerprint[]>;
    findCandidates(query: FPDataSet, minConfidence: number, limit?: number): Promise<DeviceMatch[]>;
    linkToUser(deviceId: string, userId: string): Promise<void>;
    deleteOldSnapshots(olderThanDays: number): Promise<number>;
    close?(): Promise<void>;
}
//# sourceMappingURL=storage.d.ts.map