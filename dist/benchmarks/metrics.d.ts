export interface BenchmarkResult {
    threshold: number;
    precision: number;
    recall: number;
    f1: number;
    far: number;
    frr: number;
    eer: number;
    attr: number;
}
export interface DBSCANResult {
    clusters: number[][];
    noise: number[];
}
export declare function calculateMetrics(scoredPairs: {
    score: number;
    sameDevice: boolean;
    isAttractor: boolean;
}[], thresholds?: number[]): BenchmarkResult[];
export declare function dbscanMetrics(pairs: {
    score: number;
    sameDevice: boolean;
    isAttractor: boolean;
}[], eps: number, minPts: number): DBSCANResult;
//# sourceMappingURL=metrics.d.ts.map