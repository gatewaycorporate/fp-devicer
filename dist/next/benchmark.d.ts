import type { CalibrationArtifact, CalibrationEvaluation } from './calibration.js';
import { evaluateCalibration } from './calibration.js';
import type { EvaluationManifest } from './evaluation.js';
import type { FingerprintAdapter, Observation } from './index.js';
export interface EvaluationPair<TFeatures extends Record<string, unknown>> {
    pairId: string;
    left: Observation<TFeatures>;
    right: Observation<TFeatures>;
    label: 0 | 1;
    group?: string;
    quality?: string;
}
export interface EvaluationRunnerOptions {
    manifest: EvaluationManifest;
    relation?: string;
    threshold: number;
    calibration?: {
        artifact: CalibrationArtifact;
        manifest: Parameters<typeof evaluateCalibration>[2];
    };
    calibrationManifest?: EvaluationManifest;
    now?: () => number;
}
export interface EvaluationReport {
    manifestId: string;
    domain: string;
    relation: string;
    threshold: number;
    total: number;
    genuine: number;
    impostor: number;
    supported: number;
    insufficient: number;
    unsupported: number;
    abstentionRate: number;
    falseMatchRate: number | null;
    falseNonMatchRate: number | null;
    score: {
        min: number | null;
        max: number | null;
        mean: number | null;
    };
    latencyMs: {
        p50: number | null;
        p95: number | null;
        p99: number | null;
    };
    qualitySlices: readonly EvaluationSlice[];
    calibration?: CalibrationEvaluation;
}
export interface EvaluationSlice {
    name: string;
    total: number;
    supported: number;
    abstentions: number;
    meanSimilarity: number | null;
}
export declare function runEvaluation<TInput, TFeatures extends Record<string, unknown>>(adapter: FingerprintAdapter<TInput, TFeatures>, pairs: readonly EvaluationPair<TFeatures>[], options: EvaluationRunnerOptions): Promise<EvaluationReport>;
//# sourceMappingURL=benchmark.d.ts.map