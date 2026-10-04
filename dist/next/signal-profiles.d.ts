export interface RasterSignal {
    image: Uint8Array;
    width: number;
    height: number;
    dpi?: number;
    preprocessing?: string;
    sourceWidth?: number;
    sourceHeight?: number;
}
export type SignalProfile = {
    id: string;
    kind: 'features';
} | {
    id: string;
    kind: 'raster';
    channels: 1 | 3;
    width?: number;
    height?: number;
    dpi?: number;
    preprocessing?: 'fit-pad-white';
    rejectBlank?: boolean;
};
export declare const FINGERPRINT_500_DPI: SignalProfile;
export declare const SIGNATURE_224: SignalProfile;
export declare function assertSignalProfile(profile: SignalProfile): void;
export declare function validateSignal(input: unknown, profile: SignalProfile): string | undefined;
export declare function signalAcquisition(input: unknown, profile: SignalProfile): Record<string, string | number | boolean>;
//# sourceMappingURL=signal-profiles.d.ts.map