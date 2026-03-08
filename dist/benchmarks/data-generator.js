import { randomUUID } from 'crypto';
export function createBaseFingerprint(seed) {
    // deterministic base using seed (for reproducibility)
    return {
        userAgent: `Mozilla/5.0 ...`,
        platform: seed % 3 === 0 ? 'Win32' : 'MacIntel',
        timezone: 'America/New_York',
        language: 'en-US',
        languages: ['en-US', 'en'],
        cookieEnabled: true,
        doNotTrack: false,
        product: 'Gecko',
        productSub: '20100101',
        vendor: 'Google Inc.',
        vendorSub: '',
        appName: 'Netscape',
        appVersion: `5.0 (Windows) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${120 + (seed % 5)}.0.0.0 Safari/537.36`,
        appCodeName: 'Mozilla',
        appMinorVersion: '0',
        buildID: '20240101',
        hardwareConcurrency: 8 + (seed % 4),
        deviceMemory: 8,
        screen: {
            width: 1920 + (seed % 100),
            height: 1080,
            colorDepth: 24,
            pixelDepth: 24,
            orientation: {
                type: 'landscape-primary',
                angle: 0
            }
        },
        fonts: ['Arial', 'Helvetica'],
        plugins: [
            { name: "Chrome PDF Viewer", description: "Portable Document Format" }
        ],
        mimeTypes: [
            { type: "application/pdf", description: "Portable Document Format", suffixes: "pdf" }
        ],
        highEntropyValues: {}
    };
}
export function mutate(fp, mutationLevel) {
    const mutated = structuredClone(fp);
    switch (mutationLevel) {
        case 'low': // 1px change (common)
            mutated.screen.width += 1;
            break;
        case 'medium': // Added fonts, minor UA change
            mutated.fonts.push('NewFont-' + Math.random());
            mutated.userAgent = mutated.userAgent.replace('Chrome/120', 'Chrome/121');
            break;
        case 'high': // Browser change
            mutated.platform = 'Linux x86_64';
            mutated.userAgent = `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${130 + Math.floor(Math.random() * 10)}.0.0.0 Safari/537.36`;
            mutated.hardwareConcurrency = 12;
            break;
        case 'extreme': // Major change, likely different device
            mutated.platform = 'Android';
            mutated.hardwareConcurrency = 4;
            mutated.deviceMemory = 4;
            mutated.plugins = [];
            mutated.mimeTypes = [];
            mutated.userAgent = `Mozilla/5.0 (Linux; Android 10; SM-G970F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.132 Mobile Safari/537.36`;
            break;
    }
    return mutated;
}
// Generate labeled dataset
export function generateDataset(numDevices = 1000, sessionsPerDevice = 5) {
    const dataset = [];
    for (let d = 0; d < numDevices; d++) {
        const deviceId = `dev_${randomUUID()}`;
        const base = createBaseFingerprint(d);
        for (let s = 0; s < sessionsPerDevice; s++) {
            const mutation = s === 0 ? 'none' : ['low', 'medium', 'high', 'extreme'][s % 4];
            dataset.push({
                id: deviceId,
                data: mutate(base, mutation),
                deviceLabel: deviceId
            });
        }
    }
    return dataset;
}
