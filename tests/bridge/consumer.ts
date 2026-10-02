import {
  awaitHostNumber,
  awaitHostValue,
  calculateConfidence,
  calculateScoreBreakdown,
  compareHashes,
  computeFieldAgreement,
  computeTemporalDecayFactor,
  createStorageBridge,
  runPostProcessorSequence,
  runHostSequence,
  getHash,
  type LocalComparisonOptions,
} from '../../packages/bridge-spike/index.cjs';

const comparator = (first: unknown, second: unknown, _path?: string): number => Number(first === second);
const options: LocalComparisonOptions = {
  useGlobalRegistry: false,
  comparators: { userAgent: comparator },
};
const score: number = computeFieldAgreement({ userAgent: 'browser' }, { userAgent: 'browser' }, options);
const decay: number = computeTemporalDecayFactor(1000);
const nativeBreakdown = calculateScoreBreakdown({ userAgent: 'browser' }, { userAgent: 'browser' });
const nativeConfidence: number = calculateConfidence({ userAgent: 'browser' }, { userAgent: 'browser' });
const nativeHash: string = getHash('long input reserved for the native hash contract');
const nativeDistance: number = compareHashes(nativeHash, nativeHash);
const awaited: Promise<number> = awaitHostNumber(async () => 7);
const awaitedValue: Promise<{ ready: boolean }> = awaitHostValue(async () => ({ ready: true }));
const sequence: Promise<number[]> = runHostSequence([() => 1, async () => 2]);
const storage = createStorageBridge({
  init: async () => undefined,
  save: async () => 'id',
  getHistory: async () => [],
  findCandidates: async () => [],
  linkToUser: async () => undefined,
  deleteOldSnapshots: async () => 0,
  getAllFingerprints: async () => [],
});
const storedId: Promise<string> = storage.save({});
const postProcessed = runPostProcessorSequence([], { result: {} });
void [score, decay, nativeBreakdown, nativeConfidence, nativeHash, nativeDistance, awaited, awaitedValue, sequence, storedId, postProcessed];