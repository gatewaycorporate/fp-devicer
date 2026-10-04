import type { FingerprintAdapter } from './index.js';
export interface FeatureAdapterOptions {
    featureDimension: number;
    extractorVersion: string;
}
export interface HandwritingSample {
    [key: string]: unknown;
    embedding?: readonly number[];
    transcription?: string;
}
export interface EnrolledBiometricSample {
    [key: string]: unknown;
    modality: string;
    template?: readonly number[];
}
export declare function createHandwritingAdapter(options: FeatureAdapterOptions): FingerprintAdapter<HandwritingSample, HandwritingSample>;
export declare function createEnrolledBiometricAdapter(modality: string, options: FeatureAdapterOptions): FingerprintAdapter<EnrolledBiometricSample, EnrolledBiometricSample>;
//# sourceMappingURL=domain-adapters.d.ts.map