export const FINGERPRINT_500_DPI = Object.freeze({
    id: 'fingerprint.gray8.500dpi.v1', kind: 'raster', channels: 1, dpi: 500, rejectBlank: true,
});
export const SIGNATURE_224 = Object.freeze({
    id: 'signature.gray8.fit-pad-224.v1', kind: 'raster', channels: 1,
    width: 224, height: 224, preprocessing: 'fit-pad-white', rejectBlank: true,
});
const MAX_DIMENSION = 8192;
const MAX_BYTES = 32 * 1024 * 1024;
export function assertSignalProfile(profile) {
    if (!profile || !/^.+\.v[1-9][0-9]*$/.test(profile.id))
        throw new Error('A versioned signal profile is required');
    if (profile.kind === 'features')
        return;
    if (profile.kind !== 'raster' || ![1, 3].includes(profile.channels))
        throw new Error('Unsupported signal format');
    for (const dimension of [profile.width, profile.height]) {
        if (dimension !== undefined && !validDimension(dimension))
            throw new Error('Invalid profile dimensions');
    }
    if (profile.dpi !== undefined && (!Number.isFinite(profile.dpi) || profile.dpi <= 0))
        throw new Error('Invalid profile DPI');
    if (profile.preprocessing && (!profile.width || !profile.height))
        throw new Error('Normalized profiles require dimensions');
}
export function validateSignal(input, profile) {
    if (!input || typeof input !== 'object' || Array.isArray(input))
        return 'signal_object_required';
    if (profile.kind === 'features')
        return;
    const signal = input;
    if (!validDimension(signal.width) || !validDimension(signal.height))
        return 'invalid_image_dimensions';
    const expectedBytes = signal.width * signal.height * profile.channels;
    if (expectedBytes > MAX_BYTES)
        return 'image_resource_limit';
    if (!(signal.image instanceof Uint8Array) || signal.image.length !== expectedBytes)
        return 'invalid_image_buffer';
    if (profile.width !== undefined && signal.width !== profile.width
        || profile.height !== undefined && signal.height !== profile.height)
        return 'incompatible_image_dimensions';
    if (profile.dpi !== undefined && signal.dpi !== profile.dpi)
        return 'unsupported_acquisition_dpi';
    if (profile.preprocessing && (signal.preprocessing !== profile.id
        || !validDimension(signal.sourceWidth) || !validDimension(signal.sourceHeight)))
        return 'normalization_provenance_required';
    if (profile.rejectBlank) {
        let minimum = 255;
        let maximum = 0;
        let uniform = true;
        for (let index = 0; index < signal.image.length; index += 1) {
            const value = signal.image[index];
            minimum = Math.min(minimum, value);
            maximum = Math.max(maximum, value);
            if (value !== signal.image[index % profile.channels])
                uniform = false;
        }
        if (uniform || minimum >= 245 || maximum <= 10)
            return 'blank_image';
    }
}
export function signalAcquisition(input, profile) {
    if (profile.kind === 'features')
        return {};
    const signal = input;
    return {
        width: signal.width, height: signal.height, channels: profile.channels,
        ...(profile.dpi !== undefined ? { dpi: signal.dpi } : {}),
        ...(profile.preprocessing ? { sourceWidth: signal.sourceWidth, sourceHeight: signal.sourceHeight, preprocessing: profile.id } : {}),
    };
}
function validDimension(value) {
    return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= MAX_DIMENSION;
}
