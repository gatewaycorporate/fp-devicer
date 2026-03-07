import type { FPDataSet } from "./data";

export interface StoredFingerprint {
  id: string;                    // ulid or uuid
  deviceId: string;              // stable device identifier
  userId?: string;
  timestamp: Date;
  fingerprint: FPDataSet;
  ip?: string;
  signalsHash?: string;          // optional quick-lookup hash
  metadata?: Record<string, any>;
}

export interface DeviceMatch {
  deviceId: string;
  confidence: number;
  lastSeen: Date;
}

export interface StorageAdapter {
  init(): Promise<void>;
  save(snapshot: StoredFingerprint): Promise<string>;           // returns snapshot id
  getHistory(deviceId: string, limit?: number): Promise<StoredFingerprint[]>;
  findCandidates(
    query: FPDataSet,
    minConfidence: number,
    limit?: number
  ): Promise<DeviceMatch[]>;
  linkToUser(deviceId: string, userId: string): Promise<void>;
  deleteOldSnapshots(olderThanDays: number): Promise<number>;
  close?(): Promise<void>;
}