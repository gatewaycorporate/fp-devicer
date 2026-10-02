import type { CalibrationStatus, ComparisonResult } from './index.js';
export type PairLabel = 0 | 1;
export interface CalibrationLabel {
    pairId: string;
    label: PairLabel;
    source: "external" | "analyst" | "verified";
}
export interface CalibrationDataManifest {
    id: string;
    population: string;
    task: string;
    observationIds: readonly string[];
    labelSources: readonly string[];
    split: "calibration" | "held_out";
    collectedFrom: string;
    collectedTo: string;
}
export interface CalibrationArtifact {
    id: string;
    method: "empirical-bin.v1";
    configurationDigest: string;
    data: CalibrationDataManifest;
    supportedMasks: readonly string[];
    createdAt: string;
    expiresAt?: string;
    counts: {
        total: number;
        positives: number;
        negatives: number;
    };
    bins: readonly CalibrationBin[];
    conformal: {
        alpha: number;
        quantile: number;
    };
}
export interface CalibrationBin {
    lower: number;
    upper: number;
    count: number;
    positives: number;
    probability: number;
}
export interface CalibratedPrediction {
    probability: number | null;
    predictionSet: readonly PairLabel[];
    status: CalibrationStatus;
    reasonCodes: readonly string[];
    artifactId?: string;
}
export interface CalibrationSample {
    pairId: string;
    comparison: Pick<ComparisonResult, "similarity" | "configuration" | "evidence">;
    label: CalibrationLabel;
}
export interface CalibrationOptions {
    manifest: CalibrationDataManifest;
    artifactId: string;
    createdAt?: Date;
    expiresAt?: Date;
    alpha?: number;
    bins?: number;
}
export interface CalibrationEvaluation {
    total: number;
    supported: number;
    unsupported: number;
    brierScore: number | null;
    logLoss: number | null;
    coverage: number | null;
    meanPredictionSetSize: number | null;
}
export interface CalibrationMaskEvaluation {
    mask: string;
    evaluation: CalibrationEvaluation;
}
export declare function createCalibrationArtifact(samples: readonly CalibrationSample[], options: CalibrationOptions): CalibrationArtifact;
export declare function evaluateCalibration(samples: readonly CalibrationSample[], artifact: CalibrationArtifact, manifest: CalibrationDataManifest, now?: Date): CalibrationEvaluation;
export declare function evaluateCalibrationByMask(samples: readonly CalibrationSample[], artifact: CalibrationArtifact, manifest: CalibrationDataManifest, now?: Date): readonly CalibrationMaskEvaluation[];
export declare function calibrateComparison(comparison: Pick<ComparisonResult, "similarity" | "configuration" | "evidence">, artifact: CalibrationArtifact, now?: Date): CalibratedPrediction;
//# sourceMappingURL=calibration.d.ts.map