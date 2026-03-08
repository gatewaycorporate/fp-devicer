export interface BenchmarkResult {
    threshold: number;
    precision: number;
    recall: number;
    f1: number;
    far: number;
    frr: number;
    eer: number;
}
export declare function calculateMetrics(scoredPairs: {
    score: number;
    sameDevice: boolean;
}[], thresholds?: number[]): BenchmarkResult[];
//# sourceMappingURL=metrics.d.ts.map