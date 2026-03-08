import { randomUUID } from 'crypto';
// ---------------------------------------------------------------------------
// Seeded PRNG – LCG (fast, deterministic, no external deps)
// ---------------------------------------------------------------------------
function makePrng(seed) {
    let s = seed >>> 0;
    return {
        next() {
            s = (Math.imul(1664525, s) + 1013904223) >>> 0;
            return s / 0x100000000;
        },
        int(min, max) {
            return min + Math.floor(this.next() * (max - min + 1));
        },
        pick(arr) {
            return arr[this.int(0, arr.length - 1)];
        },
        bool(prob = 0.5) {
            return this.next() < prob;
        },
        shuffle(arr) {
            const a = [...arr];
            for (let i = a.length - 1; i > 0; i--) {
                const j = this.int(0, i);
                [a[i], a[j]] = [a[j], a[i]];
            }
            return a;
        },
    };
}
// ---------------------------------------------------------------------------
// Static pools – realistic real-world values
// ---------------------------------------------------------------------------
const PLATFORMS = [
    { os: 'Windows NT 10.0; Win64; x64', platform: 'Win32', appOs: 'Windows' },
    { os: 'Windows NT 11.0; Win64; x64', platform: 'Win32', appOs: 'Windows' },
    { os: 'Macintosh; Intel Mac OS X 10_15_7', platform: 'MacIntel', appOs: 'Macintosh' },
    { os: 'Macintosh; Intel Mac OS X 13_6', platform: 'MacIntel', appOs: 'Macintosh' },
    { os: 'Macintosh; ARM Mac OS X 14_0', platform: 'MacIntel', appOs: 'Macintosh' },
    { os: 'X11; Linux x86_64', platform: 'Linux x86_64', appOs: 'X11' },
    { os: 'X11; Ubuntu; Linux x86_64', platform: 'Linux x86_64', appOs: 'X11' },
];
const CHROME_VERSIONS = [120, 121, 122, 123, 124, 125, 126];
const TIMEZONES = [
    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'America/Sao_Paulo', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
    'Europe/Moscow', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata',
    'Australia/Sydney', 'Pacific/Auckland',
];
const LANGUAGES_MAP = {
    'en-US': ['en-US', 'en'],
    'en-GB': ['en-GB', 'en'],
    'fr-FR': ['fr-FR', 'fr', 'en'],
    'de-DE': ['de-DE', 'de', 'en'],
    'es-ES': ['es-ES', 'es'],
    'ja-JP': ['ja-JP', 'ja'],
    'zh-CN': ['zh-CN', 'zh'],
    'pt-BR': ['pt-BR', 'pt'],
};
const SCREEN_RESOLUTIONS = [
    [1280, 720], [1366, 768], [1440, 900], [1600, 900],
    [1920, 1080], [1920, 1200], [2560, 1080], [2560, 1440],
    [3440, 1440], [3840, 2160], [1024, 768], [1280, 800],
];
const HARDWARE_CONCURRENCY = [2, 4, 6, 8, 10, 12, 16, 20, 24, 32];
const DEVICE_MEMORY = [1, 2, 4, 8, 16, 32];
const FONT_POOL = [
    'Arial', 'Arial Black', 'Arial Narrow', 'Calibri', 'Cambria', 'Comic Sans MS',
    'Consolas', 'Courier New', 'Georgia', 'Helvetica', 'Impact', 'Lucida Console',
    'Lucida Sans Unicode', 'Microsoft Sans Serif', 'Palatino Linotype', 'Segoe UI',
    'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana',
    // Mac-only
    'Gill Sans', 'Optima', 'Futura', 'Baskerville', 'Didot',
    // Linux-only
    'DejaVu Sans', 'Liberation Mono', 'Ubuntu', 'Noto Sans',
    // Installed by Office / Adobe
    'Garamond', 'Rockwell', 'Century Gothic', 'Franklin Gothic Medium',
];
const PLUGIN_POOL = [
    { name: 'Chrome PDF Viewer', description: 'Portable Document Format' },
    { name: 'Chromium PDF Viewer', description: 'Portable Document Format' },
    { name: 'Microsoft Edge PDF Viewer', description: 'Portable Document Format' },
    { name: 'WebKit built-in PDF', description: 'Portable Document Format' },
];
const HEV_BRANDS = [
    [{ brand: 'Chromium', version: '124' }, { brand: 'Google Chrome', version: '124' }, { brand: 'Not-A.Brand', version: '99' }],
    [{ brand: 'Chromium', version: '122' }, { brand: 'Google Chrome', version: '122' }, { brand: 'Not-A.Brand', version: '99' }],
    [{ brand: 'Chromium', version: '120' }, { brand: 'Google Chrome', version: '120' }, { brand: 'Not-A.Brand', version: '8' }],
];
// ---------------------------------------------------------------------------
// Base fingerprint factory
// ---------------------------------------------------------------------------
/**
 * Generate a deterministic but realistically diverse base fingerprint from
 * an integer seed. The resulting profile draws from large static pools so
 * that different seeds produce genuinely different device configurations.
 */
export function createBaseFingerprint(seed) {
    const rng = makePrng(seed * 2654435761); // avalanche seed before use
    const plat = rng.pick(PLATFORMS);
    const chromeVer = rng.pick(CHROME_VERSIONS);
    const timezone = rng.pick(TIMEZONES);
    const langKey = rng.pick(Object.keys(LANGUAGES_MAP));
    const languages = LANGUAGES_MAP[langKey];
    const [sw, sh] = rng.pick(SCREEN_RESOLUTIONS);
    const colorDepth = rng.pick([24, 30, 32]);
    const concurrency = rng.pick(HARDWARE_CONCURRENCY);
    const memory = rng.pick(DEVICE_MEMORY);
    const dnt = rng.bool(0.15) ? '1' : false;
    // Fonts: each device installs a reproducible but varied subset
    const baseFontCount = rng.int(6, 18);
    const fonts = rng.shuffle(FONT_POOL).slice(0, baseFontCount);
    // Plugins: 0–2 plugins
    const pluginCount = rng.int(0, 2);
    const plugins = rng.shuffle(PLUGIN_POOL).slice(0, pluginCount);
    const mimeTypes = plugins.length > 0
        ? [{ type: 'application/pdf', description: 'Portable Document Format', suffixes: 'pdf' }]
        : [];
    // Canvas / webGL / audio: stable per device but unique
    const canvasFp = `cv_${seed}_${rng.int(100000, 999999)}`;
    const webglFp = `wg_${seed}_${rng.int(100000, 999999)}`;
    const audioFp = `au_${seed}_${rng.int(100000, 999999)}`;
    const hev = {
        architecture: rng.pick(['x86', 'x64', 'arm']),
        bitness: rng.pick(['32', '64']),
        brands: rng.pick(HEV_BRANDS),
        mobile: rng.bool(0.12),
        platform: plat.appOs,
        platformVersion: `${rng.int(10, 15)}.${rng.int(0, 9)}.${rng.int(0, 9)}`,
        uaFullVersion: `${chromeVer}.0.${rng.int(5000, 6999)}.${rng.int(100, 200)}`,
    };
    return {
        userAgent: `Mozilla/5.0 (${plat.os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVer}.0.0.0 Safari/537.36`,
        platform: plat.platform,
        timezone,
        language: langKey,
        languages,
        cookieEnabled: rng.bool(0.97),
        doNotTrack: dnt,
        product: 'Gecko',
        productSub: '20100101',
        vendor: 'Google Inc.',
        vendorSub: '',
        appName: 'Netscape',
        appVersion: `5.0 (${plat.appOs}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVer}.0.0.0 Safari/537.36`,
        appCodeName: 'Mozilla',
        appMinorVersion: '0',
        buildID: '20240101',
        hardwareConcurrency: concurrency,
        deviceMemory: memory,
        screen: {
            width: sw,
            height: sh,
            colorDepth,
            pixelDepth: colorDepth,
            orientation: { type: rng.bool(0.85) ? 'landscape-primary' : 'portrait-primary', angle: 0 },
        },
        fonts,
        plugins,
        mimeTypes,
        canvas: canvasFp,
        webgl: webglFp,
        audio: audioFp,
        highEntropyValues: hev,
    };
}
// ---------------------------------------------------------------------------
// Mutation engine
// ---------------------------------------------------------------------------
/**
 * Apply realistic noise to a fingerprint to simulate re-visits by the same
 * device under varying conditions.
 *
 * - `low`    — natural per-session jitter (common in practice)
 * - `medium` — minor environment change (new font installed, browser update)
 * - `high`   — notable change but still same device (external monitor, new
 *              browser version, privacy settings toggled)
 * - `extreme`— fundamentally different profile; treated as a different device
 *              in accuracy scoring
 */
export function mutate(fp, mutationLevel) {
    const mutated = structuredClone(fp);
    // Non-deterministic noise so repeated calls on the same base diverge
    switch (mutationLevel) {
        case 'none':
            break;
        case 'low': {
            // Sub-pixel / DPI rounding differences: ±1–2px width
            mutated.screen.width += Math.round((Math.random() - 0.5) * 4);
            // Canvas hash may differ by a few bits due to GPU driver micro-differences
            mutated.canvas = mutated.canvas.replace(/\d+$/, String(parseInt(mutated.canvas.match(/\d+$/)[0], 10) + Math.floor(Math.random() * 3)));
            // Occasional font list reorder (different enumeration order)
            if (Math.random() < 0.4) {
                mutated.fonts = [...mutated.fonts].sort(() => Math.random() - 0.5);
            }
            break;
        }
        case 'medium': {
            // Browser minor version bump
            mutated.userAgent = mutated.userAgent.replace(/Chrome\/(\d+)/, (_, v) => `Chrome/${parseInt(v) + Math.floor(Math.random() * 2)}`);
            mutated.appVersion = mutated.appVersion.replace(/Chrome\/(\d+)/, (_, v) => `Chrome/${parseInt(v) + Math.floor(Math.random() * 2)}`);
            // Installed a new font / uninstalled one
            if (Math.random() < 0.5 && mutated.fonts.length < FONT_POOL.length) {
                const candidates = FONT_POOL.filter(f => !mutated.fonts.includes(f));
                if (candidates.length)
                    mutated.fonts.push(candidates[Math.floor(Math.random() * candidates.length)]);
            }
            else if (mutated.fonts.length > 3) {
                mutated.fonts.splice(Math.floor(Math.random() * mutated.fonts.length), 1);
            }
            // Timezone may change (VPN, travel)
            if (Math.random() < 0.2) {
                mutated.timezone = TIMEZONES[Math.floor(Math.random() * TIMEZONES.length)];
            }
            // Audio hash drift
            mutated.audio = mutated.audio.replace(/\d+$/, String(parseInt(mutated.audio.match(/\d+$/)[0], 10) + Math.floor(Math.random() * 50)));
            break;
        }
        case 'high': {
            // Connected / disconnected external monitor
            const res = SCREEN_RESOLUTIONS[Math.floor(Math.random() * SCREEN_RESOLUTIONS.length)];
            mutated.screen.width = res[0];
            mutated.screen.height = res[1];
            // Major Chrome upgrade (2–6 versions)
            mutated.userAgent = mutated.userAgent.replace(/Chrome\/(\d+)/, (_, v) => `Chrome/${parseInt(v) + Math.floor(Math.random() * 5) + 2}`);
            mutated.appVersion = mutated.appVersion.replace(/Chrome\/(\d+)/, (_, v) => `Chrome/${parseInt(v) + Math.floor(Math.random() * 5) + 2}`);
            // DoNotTrack toggled
            mutated.doNotTrack = Math.random() < 0.3 ? '1' : false;
            // Several new fonts (or removal of several)
            if (Math.random() < 0.5) {
                const extras = FONT_POOL.filter(f => !mutated.fonts.includes(f)).slice(0, Math.floor(Math.random() * 4) + 1);
                mutated.fonts = [...mutated.fonts, ...extras];
            }
            else {
                mutated.fonts = mutated.fonts.slice(0, Math.max(4, mutated.fonts.length - Math.floor(Math.random() * 3) - 1));
            }
            // webGL hash may differ (driver update)
            mutated.webgl = mutated.webgl.replace(/\d+$/, String(parseInt(mutated.webgl.match(/\d+$/)[0], 10) + Math.floor(Math.random() * 500)));
            break;
        }
        case 'extreme': {
            // Completely different device profile
            const newSeed = Math.floor(Math.random() * 1_000_000) + 50_000;
            const newBase = createBaseFingerprint(newSeed);
            return newBase;
        }
    }
    return mutated;
}
// ---------------------------------------------------------------------------
// Dataset generator
// ---------------------------------------------------------------------------
/**
 * Generate a labeled dataset of fingerprints for benchmarking.
 *
 * Each device gets `sessionsPerDevice` samples:
 * - Session 0 : clean baseline (`none`)
 * - Sessions 1+: cycling through `low → medium → high` mutations with a small
 *   chance of an additional `low` jitter layered on top, simulating the
 *   realistic case where every re-visit carries some natural noise.
 *
 * @param numDevices        Number of distinct simulated devices.
 * @param sessionsPerDevice Number of fingerprint snapshots per device.
 */
export function generateDataset(numDevices = 1000, sessionsPerDevice = 5) {
    const dataset = [];
    const mutationCycle = ['none', 'low', 'medium', 'high', 'low'];
    for (let d = 0; d < numDevices; d++) {
        const deviceId = `dev_${randomUUID()}`;
        const base = createBaseFingerprint(d);
        for (let s = 0; s < sessionsPerDevice; s++) {
            const level = mutationCycle[s % mutationCycle.length];
            // Layer a secondary low-jitter pass on ~40% of non-none sessions to
            // ensure genuine pairs are never perfectly identical
            let data = mutate(base, level);
            if (level !== 'none' && Math.random() < 0.4) {
                data = mutate(data, 'low');
            }
            dataset.push({ id: deviceId, data, deviceLabel: deviceId });
        }
    }
    return dataset;
}
