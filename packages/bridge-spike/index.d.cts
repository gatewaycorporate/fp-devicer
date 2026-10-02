export interface LocalComparisonOptions {
  useGlobalRegistry: false;
  comparators?: Record<string, (first: any, second: any, path?: string) => number>;
}

export function computeFieldAgreement(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
  options: LocalComparisonOptions,
): number;

export function computeTemporalDecayFactor(age: number, halfLife?: number): number;
export interface NativeScoringOptions {
  snapshotAgeMs?: number;
  decayHalfLifeMs?: number;
}
export interface ScoreBreakdown {
  deviceSimilarity: number;
  evidenceRichness: number;
  fieldAgreement: number;
  structuralStability: number;
  entropyContribution: number;
  attractorRisk: number;
  missingOneSide: number;
  missingBothSides: number;
  composite: number;
}
export function calculateScoreBreakdown(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
  options?: NativeScoringOptions,
): ScoreBreakdown;
export function calculateConfidence(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
  options?: NativeScoringOptions,
): number;
export function getHash(value: string | Record<string, unknown>): string;
export function compareHashes(first: string, second: string): number;
export function awaitHostNumber(hostOperation: () => number | PromiseLike<number>): Promise<number>;
export function awaitHostValue<T>(hostOperation: () => T | PromiseLike<T>): Promise<T>;
export function runHostSequence<T>(hostOperations: Array<() => T | PromiseLike<T>>): Promise<T[]>;
export interface StorageBridge {
  init(): Promise<void>;
  save(snapshot: unknown): Promise<string>;
  getHistory(deviceId: string, limit?: number): Promise<unknown[]>;
  findCandidates(query: unknown, minConfidence: number, limit?: number): Promise<unknown[]>;
  linkToUser(deviceId: string, userId: string): Promise<void>;
  deleteOldSnapshots(olderThanDays: number): Promise<number>;
  getAllFingerprints(): Promise<unknown[]>;
  close?(): Promise<void>;
}
export function createStorageBridge(hostAdapter: Record<string, unknown>): StorageBridge;
export interface PostProcessor {
  name: string;
  process(payload: Record<string, unknown>): unknown | PromiseLike<unknown>;
}
export interface PostProcessorSequenceResult {
  result: Record<string, unknown>;
  completed: string[];
  failures: Array<{ plugin: string; message: string }>;
}
export function runPostProcessorSequence(
  processors: PostProcessor[],
  payload: Record<string, unknown>,
): Promise<PostProcessorSequenceResult>;
export interface PortableBridge {
  computeFieldAgreement: (...args: any[]) => number;
  computeTemporalDecayFactor: (...args: any[]) => number;
  portable: true;
  [name: string]: unknown;
}
export function loadPortableBridge(loadModule: () => unknown | PromiseLike<unknown>): Promise<PortableBridge>;
export const DEFAULT_DECAY_HALF_LIFE_MS: number;