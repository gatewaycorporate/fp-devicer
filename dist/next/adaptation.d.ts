import type { CalibrationArtifact, CalibratedPrediction, CalibrationSample, PairLabel } from './calibration.js';
export type ConfigurationChange = "none" | "availability" | "extractor" | "schema" | "fusion" | "mixed";
export interface ConfigurationTransition {
    fromDigest: string;
    toDigest: string;
    change: ConfigurationChange;
    reason: string;
}
export interface CalibrationReuseAssessment {
    reusable: boolean;
    status: "compatible" | "requires_new_labels";
    reasonCodes: readonly string[];
}
export interface LabelCandidate {
    sample: CalibrationSample;
    prediction: CalibratedPrediction;
}
export interface LabelRequest {
    pairId: string;
    reason: "uncertainty_review" | "random_audit";
    inclusionProbability: number;
    predictedSet: readonly PairLabel[];
}
export interface LabelAllocation {
    requests: readonly LabelRequest[];
    uncertaintyCount: number;
    auditCount: number;
    auditRate: number;
}
export interface LabelAllocationOptions {
    auditRate: number;
    uncertaintyLimit: number;
    randomValues?: readonly number[];
}
export declare function assessCalibrationReuse(artifact: CalibrationArtifact, transition: ConfigurationTransition): CalibrationReuseAssessment;
export declare function allocateCalibrationLabels(candidates: readonly LabelCandidate[], options: LabelAllocationOptions): LabelAllocation;
//# sourceMappingURL=adaptation.d.ts.map