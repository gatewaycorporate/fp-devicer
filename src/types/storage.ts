import type { FPDataSet } from "./data.js";

/**
 * A single persisted fingerprint snapshot associated with a device.
 * Each call to {@link StorageAdapter.save} produces one record.
 */
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

/**
 * A candidate device returned by {@link StorageAdapter.findCandidates}.
 * Carries the device identifier, confidence score, and when it was last seen.
 */
export interface DeviceMatch {
  deviceId: string;
  confidence: number;
  lastSeen: Date;
}

/**
 * Persistence contract for fingerprint storage backends.
 * Implement this interface to add a new storage backend (SQL, NoSQL, etc.).
 * Built-in implementations: {@link createInMemoryAdapter}, {@link createSqliteAdapter},
 * {@link createPostgresAdapter}, {@link createRedisAdapter}.
 */
export interface StorageAdapter {
  /** Initialise the backend (e.g. run migrations, open connections). */
  init(): Promise<void>;
  /**
   * Persist a fingerprint snapshot.
   * @returns The unique ID of the newly created snapshot record.
   */
  save(snapshot: StoredFingerprint): Promise<string>;
  /**
   * Retrieve historical snapshots for a device, most-recent first.
   * @param deviceId - The stable device identifier.
   * @param limit - Maximum number of records to return (default varies by adapter).
   */
  getHistory(deviceId: string, limit?: number): Promise<StoredFingerprint[]>;
  /**
   * Return candidate devices whose stored fingerprint is broadly similar
   * to the incoming query. Used as a pre-filter before full scoring.
   *
   * @param query - The incoming fingerprint to match against.
   * @param minConfidence - Minimum confidence score (0–100) for inclusion.
   * @param limit - Maximum number of candidates to return.
   */
  findCandidates(
    query: FPDataSet,
    minConfidence: number,
    limit?: number
  ): Promise<DeviceMatch[]>;
  /**
   * Associate a stable device ID with an application user ID.
   * @param deviceId - The device to update.
   * @param userId - The user to link.
   */
  linkToUser(deviceId: string, userId: string): Promise<void>;
  /**
   * Purge snapshots older than the given age.
   * @param olderThanDays - Delete records whose timestamp is older than this many days.
   * @returns The number of records deleted.
   */
  deleteOldSnapshots(olderThanDays: number): Promise<number>;
  /** Gracefully close any open connections or file handles. Optional. */
  close?(): Promise<void>;
}