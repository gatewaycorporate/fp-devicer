import type { FPDataSet } from '../types/data.js';
export interface LabeledFingerprint {
    id: string;
    data: FPDataSet;
    deviceLabel: string;
}
export declare function createBaseFingerprint(seed: number): FPDataSet;
export declare function mutate(fp: FPDataSet, mutationLevel: 'none' | 'low' | 'medium' | 'high' | 'extreme'): FPDataSet;
export declare function generateDataset(numDevices?: number, sessionsPerDevice?: number): LabeledFingerprint[];
//# sourceMappingURL=data-generator.d.ts.map