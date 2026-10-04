export type EvaluationSplit = 'calibration' | 'held_out' | 'test';
export interface EvaluationManifest {
    id: string;
    domain: string;
    task: string;
    split: EvaluationSplit;
    sourceDigest: string;
    labelDigest: string;
    observationIds: readonly string[];
    groups: Readonly<Record<string, string>>;
    preprocessing: string;
    modelConfigurationDigest: string;
}
export interface SplitValidationReport {
    valid: boolean;
    sharedObservationIds: readonly string[];
    sharedGroups: readonly string[];
    reasons: readonly string[];
}
export declare function validateEvaluationManifest(manifest: EvaluationManifest): void;
export declare function validateDisjointEvaluationSplits(left: EvaluationManifest, right: EvaluationManifest): SplitValidationReport;
export declare function assertDisjointEvaluationSplits(left: EvaluationManifest, right: EvaluationManifest): void;
//# sourceMappingURL=evaluation.d.ts.map