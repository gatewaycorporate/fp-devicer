import type { FingerprintAdapter } from './index.js';
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
export declare function createHandwritingAdapter(): FingerprintAdapter<HandwritingSample, HandwritingSample>;
export declare function createEnrolledBiometricAdapter(modality: string): FingerprintAdapter<EnrolledBiometricSample, EnrolledBiometricSample>;
//# sourceMappingURL=domain-adapters.d.ts.map