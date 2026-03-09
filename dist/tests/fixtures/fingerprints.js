import { mutate, createBaseFingerprint } from '../../benchmarks/data-generator.js';
export const fpIdentical = createBaseFingerprint(1);
export const fpVerySimilar = mutate(fpIdentical, "low");
export const fpSimilar = mutate(fpIdentical, "medium");
export const fpDifferent = mutate(fpIdentical, "high");
export const fpVeryDifferent = mutate(fpIdentical, "extreme");
