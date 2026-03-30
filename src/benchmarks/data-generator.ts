import type { FPDataSet } from '../types/data.js'; // adjust path
import { randomUUID } from 'crypto';

export interface LabeledFingerprint {
  id: string;
  data: FPDataSet;
  deviceLabel: string; // same device = same label
	isAttractor: boolean;	// whether this fingerprint belongs to an "attractor" device (one of the most common profiles)
}

export interface ScenarioPair {
  label: string;
  fp1: FPDataSet;
  fp2: FPDataSet;
  expectedSameDevice: boolean;
}

// ---------------------------------------------------------------------------
// Seeded PRNG – LCG (fast, deterministic, no external deps)
// ---------------------------------------------------------------------------
function makePrng(seed: number) {
  let s = seed >>> 0;
  return {
    next(): number {           // [0, 1)
      s = (Math.imul(1664525, s) + 1013904223) >>> 0;
      return s / 0x100000000;
    },
    int(min: number, max: number): number {  // [min, max]
      return min + Math.floor(this.next() * (max - min + 1));
    },
    pick<T>(arr: T[]): T {
      return arr[this.int(0, arr.length - 1)];
    },
    bool(prob = 0.5): boolean {
      return this.next() < prob;
    },
    shuffle<T>(arr: T[]): T[] {
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
// djb2 hash – mirrors snatch.js simpleHash exactly
// ---------------------------------------------------------------------------
function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return (hash >>> 0).toString(36);
}

function replaceMajorVersion(input: string | undefined, nextVersion: number, family = 'Chrome'): string | undefined {
  if (!input) return input;
  const pattern = new RegExp(`${family}\\/(\\d+)`, 'i');
  return input.replace(pattern, `${family}/${nextVersion}`);
}

function cloneFingerprint<T extends FPDataSet>(fingerprint: T): T {
  return structuredClone(fingerprint);
}

function createTorFingerprint(seed: number): FPDataSet {
  const rng = makePrng(seed ^ 0x10203040);
  return {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; rv:115.0) Gecko/20100101 Firefox/115.0',
    platform: 'Win32',
    timezone: 'UTC',
    language: 'en-US',
    languages: ['en-US', 'en'],
    cookieEnabled: true,
    doNotTrack: '1',
    product: 'Gecko',
    productSub: '20100101',
    vendor: '',
    vendorSub: '',
    appName: 'Netscape',
    appVersion: '5.0 (Windows)',
    appCodeName: 'Mozilla',
    appMinorVersion: '0',
    buildID: '20240101',
    hardwareConcurrency: 8,
    deviceMemory: 8,
    screen: {
      width: 1000,
      height: 1000,
      colorDepth: 24,
      pixelDepth: 24,
      orientation: { type: 'landscape-primary', angle: 0 },
    },
    fonts: ['Arial', 'Times New Roman'],
    plugins: [],
    mimeTypes: [],
    canvas: simpleHash(`tor-canvas-${rng.int(0, 2)}`),
    webgl: simpleHash(`tor-webgl-${rng.int(0, 2)}`),
    audio: simpleHash(`tor-audio-${rng.int(0, 2)}`),
    highEntropyValues: {
      architecture: 'x64',
      bitness: '64',
      brands: [{ brand: 'Firefox', version: '115' }],
      mobile: false,
      platform: 'Windows',
      platformVersion: '10.0.0',
      uaFullVersion: '115.0.0',
    },
  };
}

function createPrivacyResistantFingerprint(seed: number): FPDataSet {
  const rng = makePrng(seed ^ 0x50505050);
  return {
    ...createTorFingerprint(seed),
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) PrivacyBrowser/1.0 Safari/537.36',
    platform: 'Linux x86_64',
    language: 'en-US',
    fonts: ['Arial', 'Noto Sans'],
    canvas: undefined,
    webgl: undefined,
    audio: undefined,
    hardwareConcurrency: 4,
    deviceMemory: 4,
    screen: {
      width: 1366,
      height: 768,
      colorDepth: 24,
      pixelDepth: 24,
      orientation: { type: 'landscape-primary', angle: 0 },
    },
    highEntropyValues: {
      architecture: 'x64',
      bitness: '64',
      brands: [{ brand: 'PrivacyBrowser', version: `${rng.int(1, 2)}` }],
      mobile: false,
      platform: 'Linux',
      platformVersion: '6.0.0',
      uaFullVersion: '1.0.0',
    },
  };
}

/**
 * Produce a deterministic hex/base64-like string mimicking a canvas toDataURL
 * fingerprint hash. The first ~60 characters are stable for the given seed
 * (representing the GPU/driver baseline) and the last ~20 characters vary on
 * each call (rendering jitter).
 *
 * @param seed - Device seed for the stable portion
 * @param rng  - Seeded PRNG instance for the jitter portion
 */
export function generateCanvasBlob(seed: number, rng: ReturnType<typeof makePrng>): string {
	// Simulate the raw pixel data string a canvas toDataURL would produce.
  // Stable portion represents GPU/driver baseline; jitter represents
  // per-render floating-point noise.
  const stableRng = makePrng(seed ^ 0xdeadbeef);

  // Stable: ~200 chars of base-64-like pixel data (same GPU = same pixels)
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let rawStable = '';
  for (let i = 0; i < 200; i++) {
    rawStable += CHARS[stableRng.int(0, CHARS.length - 1)];
  }

  // Jitter: ~10 chars of noise that varies per render call
  let rawJitter = '';
  for (let i = 0; i < 10; i++) {
    rawJitter += CHARS[rng.int(0, CHARS.length - 1)];
  }

  // Hash the combined raw string exactly as snatch does
  return simpleHash(rawStable + rawJitter);
}

/**
 * Generate a deterministic WebGL fingerprint string containing a renderer
 * string and a short extension list. Total length ~150 characters.
 *
 * @param seed - Device seed for the stable renderer portion
 * @param rng  - Seeded PRNG instance for variation
 */
export function generateWebGLBlob(seed: number, rng: ReturnType<typeof makePrng>): string {
	const RENDERERS = [
    'ANGLE (NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0)',
    'ANGLE (AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0)',
    'ANGLE (Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0)',
    'ANGLE (Apple M1 GPU, Metal)',
    'ANGLE (Apple M2 GPU, Metal)',
    'Mesa/X.org (llvmpipe LLVM 15.0.7 256 bits)',
    'Adreno (TM) 650',
    'Mali-G78 MP14',
  ];
  const EXTENSIONS = [
    'EXT_color_buffer_float', 'EXT_float_blend', 'EXT_texture_compression_bptc',
    'EXT_texture_compression_rgtc', 'EXT_texture_filter_anisotropic',
    'OES_texture_float_linear', 'WEBGL_compressed_texture_s3tc',
    'WEBGL_debug_renderer_info', 'WEBGL_lose_context', 'WEBGL_multi_draw',
  ];

  const stableRng = makePrng(seed ^ 0xcafe1234);
  const renderer = RENDERERS[stableRng.int(0, RENDERERS.length - 1)];

  // Extension list varies slightly per session (driver updates add/remove exts)
  const extCount = rng.int(4, 7);
  const shuffled = [...EXTENSIONS].sort(() => rng.next() - 0.5);
  const exts = shuffled.slice(0, extCount).join(',');

  // snatch concatenates renderer + extension list before hashing
  return simpleHash(`${renderer}~~${exts}`);
}

/**
 * Generate a deterministic audio fingerprint string mimicking a
 * float-precision oscillator/analyser output hash. Total length ~40 chars.
 *
 * @param seed - Device seed for the stable portion
 * @param rng  - Seeded PRNG instance for per-call noise
 */
export function generateAudioBlob(seed: number, rng: ReturnType<typeof makePrng>): string {
	const stableRng = makePrng(seed ^ 0xabcdef01);

  // Simulate AnalyserNode buffer output: a float sum string like "124.12345678"
  const intPart    = stableRng.int(100, 999);
  const fracStable = String(stableRng.int(10000000, 99999999)); // 8 stable digits
  const fracJitter = String(rng.int(1000, 9999));               // 4 varying digits

  const rawFloat = `${intPart}.${fracStable}${fracJitter}`;
  return simpleHash(rawFloat);
}

// ---------------------------------------------------------------------------
// Static pools – realistic real-world values
// ---------------------------------------------------------------------------
const PLATFORMS = [
	{ os: 'Windows NT 10.0; Win64; x64', platform: 'Win32',         appOs: 'Windows', mobile: false },
	{ os: 'Windows NT 11.0; Win64; x64', platform: 'Win32',         appOs: 'Windows', mobile: false },
	{ os: 'Macintosh; Intel Mac OS X 10_15_7', platform: 'MacIntel', appOs: 'Macintosh', mobile: false },
	{ os: 'Macintosh; Intel Mac OS X 13_6',    platform: 'MacIntel', appOs: 'Macintosh', mobile: false },
	{ os: 'Macintosh; ARM Mac OS X 14_0',      platform: 'MacIntel', appOs: 'Macintosh', mobile: false },
	{ os: 'X11; Linux x86_64',  platform: 'Linux x86_64', appOs: 'X11', mobile: false },
	{ os: 'X11; Ubuntu; Linux x86_64', platform: 'Linux x86_64', appOs: 'X11', mobile: false },
	{ os: 'Linux; Android 13', platform: 'Linux armv8l', appOs: 'Android', mobile: true },
	{ os: 'Linux; Android 14', platform: 'Linux armv8l', appOs: 'Android', mobile: true },
	{ os: 'iPhone OS 17_0 like Mac OS X', platform: 'iPhone', appOs: 'iPhone', mobile: true },
	{ os: 'iPhone OS 16_0 like Mac OS X', platform: 'iPhone', appOs: 'iPhone', mobile: true },
];

const BROWSER_PROFILES = [
  // Chrome – Windows
  {
    uaTemplate: (plat: typeof PLATFORMS[number], ver: number) =>
      `Mozilla/5.0 (${plat.os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${ver}.0.0.0 Safari/537.36`,
    vendor: 'Google Inc.',
    appName: 'Netscape',
    product: 'Gecko',
    productSub: '20100101',
  },
  // Chrome – Mac
  {
    uaTemplate: (plat: typeof PLATFORMS[number], ver: number) =>
      `Mozilla/5.0 (${plat.os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${ver}.0.0.0 Safari/537.36`,
    vendor: 'Google Inc.',
    appName: 'Netscape',
    product: 'Gecko',
    productSub: '20100101',
  },
  // Firefox – Windows
  {
    uaTemplate: (plat: typeof PLATFORMS[number], ver: number) =>
      `Mozilla/5.0 (${plat.os}; rv:${ver}.0) Gecko/20100101 Firefox/${ver}.0`,
    vendor: '',
    appName: 'Netscape',
    product: 'Gecko',
    productSub: '20100101',
  },
  // Firefox – Mac
  {
    uaTemplate: (plat: typeof PLATFORMS[number], ver: number) =>
      `Mozilla/5.0 (${plat.os}; rv:${ver}.0) Gecko/20100101 Firefox/${ver}.0`,
    vendor: '',
    appName: 'Netscape',
    product: 'Gecko',
    productSub: '20100101',
  },
  // Safari – Mac
  {
    uaTemplate: (plat: typeof PLATFORMS[number], ver: number) =>
      `Mozilla/5.0 (${plat.os}) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${ver}.0 Safari/605.1.15`,
    vendor: 'Apple Computer, Inc.',
    appName: 'Netscape',
    product: 'Gecko',
    productSub: '20030107',
  },
  // Safari – iPhone
  {
    uaTemplate: (plat: typeof PLATFORMS[number], ver: number) =>
      `Mozilla/5.0 (${plat.os}) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${ver}.0 Mobile/15E148 Safari/604.1`,
    vendor: 'Apple Computer, Inc.',
    appName: 'Netscape',
    product: 'Gecko',
    productSub: '20030107',
  },
  // Edge – Windows
  {
    uaTemplate: (plat: typeof PLATFORMS[number], ver: number) =>
      `Mozilla/5.0 (${plat.os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${ver}.0.0.0 Safari/537.36 Edg/${ver}.0.0.0`,
    vendor: 'Google Inc.',
    appName: 'Netscape',
    product: 'Gecko',
    productSub: '20100101',
  },
	// Chrome – Android
	{
		uaTemplate: (plat: typeof PLATFORMS[number], ver: number) =>
			`Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${ver}.0.0.0 Mobile Safari/537.36`,
		vendor: 'Google Inc.',
		appName: 'Netscape',
		product: 'Gecko',
		productSub: '20100101',
	},
	// Chrome – iPhone
	{
		uaTemplate: (plat: typeof PLATFORMS[number], ver: number) =>
			`Mozilla/5.0 (${plat.os}) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/${ver}.0.0.0 Mobile/15E148 Safari/604.1`,
		vendor: 'Apple Computer, Inc.',
		appName: 'Netscape',
		product: 'Gecko',
		productSub: '20030107',
	},
	// Firefox – Android
	{
		uaTemplate: (plat: typeof PLATFORMS[number], ver: number) =>
			`Mozilla/5.0 (Android 13; Mobile; rv:${ver}.0) Gecko/${ver}.0 Firefox/${ver}.0`,
		vendor: '',
		appName: 'Netscape',
		product: 'Gecko',
		productSub: '20100101',
	},
	// Firefox – iPhone
	{
		uaTemplate: (plat: typeof PLATFORMS[number], ver: number) =>
			`Mozilla/5.0 (${plat.os}) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/${ver}.0 Mobile/15E148 Safari/604.1`,
		vendor: '',
		appName: 'Netscape',
		product: 'Gecko',
		productSub: '20100101',
	},
	// Edge – Android
	{
		uaTemplate: (plat: typeof PLATFORMS[number], ver: number) =>
			`Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${ver}.0.0.0 Mobile Safari/537.36 EdgA/${ver}.0.0.0`,
		vendor: 'Google Inc.',
		appName: 'Netscape',
		product: 'Gecko',
		productSub: '20100101',
	},
	// Edge – iPhone
	{
		uaTemplate: (plat: typeof PLATFORMS[number], ver: number) =>
			`Mozilla/5.0 (${plat.os}) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${ver}.0 EdgiOS/${ver}.0.0.0 Mobile/15E148 Safari/604.1`,
		vendor: 'Apple Computer, Inc.',
		appName: 'Netscape',
		product: 'Gecko',
		productSub: '20030107',
	},
	// Opera – Windows
	{
		uaTemplate: (plat: typeof PLATFORMS[number], ver: number) =>
			`Mozilla/5.0 (${plat.os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${ver}.0.0.0 Safari/537.36 OPR/${ver}.0.0.0`,
		vendor: 'Google Inc.',
		appName: 'Netscape',
		product: 'Gecko',
		productSub: '20100101',
	},
	// Opera – Mac
	{
		uaTemplate: (plat: typeof PLATFORMS[number], ver: number) =>
			`Mozilla/5.0 (${plat.os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${ver}.0.0.0 Safari/537.36 OPR/${ver}.0.0.0`,
		vendor: 'Google Inc.',
		appName: 'Netscape',
		product: 'Gecko',
		productSub: '20100101',
	},
	// Opera – Android
	{
		uaTemplate: (plat: typeof PLATFORMS[number], ver: number) =>
			`Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${ver}.0.0.0 Mobile Safari/537.36 OPR/${ver}.0.0.0`,
		vendor: 'Google Inc.',
		appName: 'Netscape',
		product: 'Gecko',
		productSub: '20100101',
	},
	// Samsung Internet – Android
	{
		uaTemplate: (plat: typeof PLATFORMS[number], ver: number) =>
			`Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/${ver}.0 Chrome/${ver}.0.0.0 Mobile Safari/537.36`,
		vendor: 'Google Inc.',
		appName: 'Netscape',
		product: 'Gecko',
		productSub: '20100101',
	},
	// Brave – Windows
	{
		uaTemplate: (plat: typeof PLATFORMS[number], ver: number) =>
			`Mozilla/5.0 (${plat.os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${ver}.0.0.0 Safari/537.36`,
		vendor: 'Google Inc.',
		appName: 'Netscape',
		product: 'Gecko',
		productSub: '20100101',
	},
	// Brave – Mac
	{
		uaTemplate: (plat: typeof PLATFORMS[number], ver: number) =>
			`Mozilla/5.0 (${plat.os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${ver}.0.0.0 Safari/537.36`,
		vendor: 'Google Inc.',
		appName: 'Netscape',
		product: 'Gecko',
		productSub: '20100101',
	},
	// Chrome – Linux
	{
		uaTemplate: (plat: typeof PLATFORMS[number], ver: number) =>
			`Mozilla/5.0 (${plat.os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${ver}.0.0.0 Safari/537.36`,
		vendor: 'Google Inc.',
		appName: 'Netscape',
		product: 'Gecko',
		productSub: '20100101',
	},
	// Firefox – Linux
	{
		uaTemplate: (plat: typeof PLATFORMS[number], ver: number) =>
			`Mozilla/5.0 (${plat.os}; rv:${ver}.0) Gecko/20100101 Firefox/${ver}.0`,
		vendor: '',
		appName: 'Netscape',
		product: 'Gecko',
		productSub: '20100101',
	},
]

const CHROME_VERSIONS = [120, 121, 122, 123, 124, 125, 126];

const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Sao_Paulo', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'Europe/Moscow', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata',
  'Australia/Sydney', 'Pacific/Auckland',
];

const LANGUAGES_MAP: Record<string, string[]> = {
  'en-US': ['en-US', 'en'],
  'en-GB': ['en-GB', 'en'],
  'fr-FR': ['fr-FR', 'fr', 'en'],
  'de-DE': ['de-DE', 'de', 'en'],
  'es-ES': ['es-ES', 'es'],
  'ja-JP': ['ja-JP', 'ja'],
  'zh-CN': ['zh-CN', 'zh'],
  'pt-BR': ['pt-BR', 'pt'],
};

const SCREEN_RESOLUTIONS: [number, number][] = [
  [1280, 720], [1366, 768], [1440, 900], [1600, 900],
  [1920, 1080], [1920, 1200], [2560, 1080], [2560, 1440],
  [3440, 1440], [3840, 2160], [1024, 768], [1280, 800],
];

const HARDWARE_CONCURRENCY = [2, 4, 6, 8, 10, 12, 16, 20, 24, 32];
const DEVICE_MEMORY       = [1, 2, 4, 8, 16, 32];

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
  { name: 'Chrome PDF Viewer',        description: 'Portable Document Format' },
  { name: 'Chromium PDF Viewer',      description: 'Portable Document Format' },
  { name: 'Microsoft Edge PDF Viewer',description: 'Portable Document Format' },
  { name: 'WebKit built-in PDF',      description: 'Portable Document Format' },
];

const HEV_BRANDS = [
  [{ brand: 'Chromium', version: '124' }, { brand: 'Google Chrome', version: '124' }, { brand: 'Not-A.Brand', version: '99' }],
  [{ brand: 'Chromium', version: '122' }, { brand: 'Google Chrome', version: '122' }, { brand: 'Not-A.Brand', version: '99' }],
  [{ brand: 'Chromium', version: '120' }, { brand: 'Google Chrome', version: '120' }, { brand: 'Not-A.Brand', version: '8'  }],
];

// ---------------------------------------------------------------------------
// Base fingerprint factory
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic but realistically diverse base fingerprint from
 * an integer seed. The resulting profile draws from large static pools so
 * that different seeds produce genuinely different device configurations.
 * 
 * @returns A {@link FPDataSet} with realistic, internally consistent field values
 * 				derived from the input `seed`. The same seed will always produce
 *        the same fingerprint, while different seeds will yield diverse profiles.
 * @param seed - Integer seed used to derive all field values. Different seeds
 *               produce different but internally consistent fingerprints. The seed
 *               is processed through a simple PRNG to ensure that similar seeds
 *               yield very different outputs, avoiding near-duplicates.
 *
 * @see {@link createAttractorFingerprint} for a less diverse alternative that
 *      simulates the common "attractor" device profile.
 * @see {@link generateCanvasBlob}, {@link generateWebGLBlob},
 *      {@link generateAudioBlob} for the blob generation helpers used
 *      internally.
 */
export function createBaseFingerprint(seed: number): FPDataSet {
  const rng = makePrng(seed * 2654435761);

  const plat         = rng.pick(PLATFORMS);
  const profile      = rng.pick(BROWSER_PROFILES);
  const chromeVer    = rng.pick(CHROME_VERSIONS);
  const timezone     = rng.pick(TIMEZONES);
  const langKey      = rng.pick(Object.keys(LANGUAGES_MAP));
  const languages    = LANGUAGES_MAP[langKey];
  const [sw, sh]     = plat.mobile ? [rng.int(320, 480), rng.int(480, 800)] : rng.pick(SCREEN_RESOLUTIONS);
  const colorDepth   = rng.pick([24, 30, 32]);
  const concurrency  = plat.mobile ? rng.pick([4, 8]) : rng.pick(HARDWARE_CONCURRENCY);
  const memory       = rng.pick(DEVICE_MEMORY);
  const dnt          = rng.bool(0.15) ? '1' : false as any;

  const baseFontCount = rng.int(6, 18);
  const fonts = rng.shuffle(FONT_POOL).slice(0, baseFontCount);

  const pluginCount = rng.int(0, 2);
  const plugins = rng.shuffle(PLUGIN_POOL).slice(0, pluginCount);

  const mimeTypes = plugins.length > 0
    ? [{ type: 'application/pdf', description: 'Portable Document Format', suffixes: 'pdf' }]
    : [];

  // Replace the old cv_/wg_/au_ strings with the simpleHash-based blob helpers
  const canvasFp = generateCanvasBlob(seed, rng);
  const webglFp  = generateWebGLBlob(seed, rng);
  const audioFp  = generateAudioBlob(seed, rng);

  const hev = {
    architecture: rng.pick(['x86', 'x64', 'arm']),
    bitness: rng.pick(['32', '64']),
    brands: rng.pick(HEV_BRANDS),
    mobile: plat.mobile,
    platform: plat.appOs,
    platformVersion: `${rng.int(10, 15)}.${rng.int(0, 9)}.${rng.int(0, 9)}`,
    uaFullVersion: `${chromeVer}.0.${rng.int(5000, 6999)}.${rng.int(100, 200)}`,
  };

  return {
    userAgent: profile.uaTemplate(plat, chromeVer),
    platform: plat.platform,
    timezone,
    language: langKey,
    languages,
    cookieEnabled: rng.bool(0.97),
    doNotTrack: dnt,
    product: profile.product,
    productSub: profile.productSub,
    vendor: profile.vendor,           // was hardcoded 'Google Inc.'
    vendorSub: '',
    appName: profile.appName,
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
      orientation: { type: plat.mobile ? 'portrait-primary' : 'landscape-primary', angle: 0 },
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

/**
 * Create a deterministic "attractor" fingerprint that represents the most
 * common real-world device profile: a Windows 10 desktop running Chrome 124
 * in the `America/New_York` timezone with `en-US` locale and a 1920×1080
 * display.
 *
 * Unlike {@link createBaseFingerprint}, this function fixes all
 * platform/browser/environment parameters to their most prevalent values and
 * uses the seed only to vary the font list, plugin set, and the canvas/WebGL/
 * audio blobs. This makes it suitable for generating a cluster of
 * near-identical fingerprints that stress-test a fingerprinter's ability to
 * distinguish devices that share almost every static signal.
 *
 * @param seed - Integer seed used to deterministically vary the font/plugin
 *               subset and the canvas, WebGL, and audio fingerprint blobs.
 *               Different seeds produce structurally identical profiles that
 *               differ only in those high-entropy fields.
 *
 * @returns A {@link FPDataSet} whose static fields are pinned to the Windows
 *          10 / Chrome 124 attractor profile and whose dynamic fields
 *          (canvas, webgl, audio, fonts, plugins) are derived from `seed`.
 *
 * @see {@link createBaseFingerprint} for a randomly diverse alternative.
 * @see {@link generateCanvasBlob}, {@link generateWebGLBlob},
 *      {@link generateAudioBlob} for the blob generation helpers used
 *      internally.
 *
 * @example
 * ```ts
 * // Generate two attractor fingerprints that share platform/browser signals
 * // but differ in canvas/audio/font details
 * const fp1 = createAttractorFingerprint(1);
 * const fp2 = createAttractorFingerprint(2);
 *
 * console.log(fp1.platform);  // 'Win32'
 * console.log(fp1.canvas === fp2.canvas); // false – seed-derived blobs differ
 * ```
 */
export function createAttractorFingerprint(seed: number): FPDataSet {
	const rng = makePrng(seed * 2654435761);

	const plat = PLATFORMS.find(p => p.platform === 'Win32' && p.os.includes('10.0'))!;
	const profile = BROWSER_PROFILES[0]; // Chrome/Windows profile
	const chromeVer = 124;
	const timezone = 'America/New_York';
	const langKey = 'en-US';
	const languages = LANGUAGES_MAP[langKey];
	const [sw, sh] = [1920, 1080];
	const colorDepth = 24;
	const concurrency = 8;
	const memory = 8;
	const dnt = false as any;

	const baseFontCount = rng.int(8, 14);
	const fonts = rng.shuffle(FONT_POOL).slice(0, baseFontCount);

	const pluginCount = rng.int(0, 1);
	const plugins = rng.shuffle(PLUGIN_POOL).slice(0, pluginCount);

	const mimeTypes = plugins.length > 0
		? [{ type: 'application/pdf', description: 'Portable Document Format', suffixes: 'pdf' }]
		: [];

	const canvasFp = generateCanvasBlob(seed, rng);
	const webglFp  = generateWebGLBlob(seed, rng);
	const audioFp  = generateAudioBlob(seed, rng);

	const hev = {
		architecture: 'x64',
		bitness: '64',
		brands: HEV_BRANDS[0],
		mobile: false,
		platform: 'Windows',
		platformVersion: `10.0.${rng.int(19041, 22631)}`,
		uaFullVersion: `124.0.${rng.int(5000, 6999)}.${rng.int(100, 200)}`,
	};

	return {
		userAgent: profile.uaTemplate(plat, chromeVer),
		platform: plat.platform,
		timezone,
		language: langKey,
		languages,
		cookieEnabled: true,
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
			orientation: { type: 'landscape-primary', angle: 0 },
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
 * 
 * @param fp - The base fingerprint to mutate. This object is not modified; a mutated clone is returned.
 * @param mutationLevel - The intensity of mutations to apply, simulating
 *                        different levels of real-world variability for the
 *                        same device.
 * @return A new {@link FPDataSet} object with mutations applied according to the specified level. The original `fp` remains unchanged.
 * 
 * @remarks
 * The mutations applied at each level are designed to reflect realistic changes
 * that might occur for the same physical device over time, such as minor browser
 * updates, font installations, or environmental changes. The `extreme` level
 * simulates a scenario where the profile has changed so much that it would be
 * considered a different device for fingerprinting purposes.
 */
export function mutate(fp: FPDataSet, mutationLevel: 'none' | 'low' | 'medium' | 'high' | 'extreme'): FPDataSet {
  const mutated = structuredClone(fp);
  // Low/medium/high mutations intentionally include session noise so repeated
  // calls on the same base can diverge. Extreme mutations are deterministic so
  // tests can rely on a stable clearly-different profile.
  switch (mutationLevel) {
    case 'none':
      break;

    case 'low': {
      // Sub-pixel / DPI rounding differences: always ±1–2px (never zero)
      mutated.screen!.width += (Math.random() < 0.5 ? 1 : -1) * (Math.floor(Math.random() * 2) + 1);
      // Canvas hash always gets micro-jitter — use simpleHash so the change
      // is guaranteed regardless of the hash's trailing characters
      mutated.canvas = simpleHash(mutated.canvas! + String(Math.floor(Math.random() * 3) + 1));
      // Occasional font list reorder (different enumeration order)
      if (Math.random() < 0.4 && mutated.fonts!.length >= 2) {
        const original = mutated.fonts!.slice();
        const shuffled = [...original].sort(() => Math.random() - 0.5);
        // If the shuffle happened to preserve the original order, force a swap
        mutated.fonts = shuffled.every((f, i) => f === original[i])
          ? [shuffled[1], shuffled[0], ...shuffled.slice(2)]
          : shuffled;
      }
      break;
    }

    case 'medium': {
      // Browser minor version bump — always at least 1 to guarantee a change
      mutated.userAgent = mutated.userAgent!.replace(
        /Chrome\/(\d+)/,
        (_, v) => `Chrome/${parseInt(v) + Math.floor(Math.random() * 2) + 1}`
      );
      mutated.appVersion = mutated.appVersion!.replace(
        /Chrome\/(\d+)/,
        (_, v) => `Chrome/${parseInt(v) + Math.floor(Math.random() * 2) + 1}`
      );
      // Installed a new font / uninstalled one
      if (Math.random() < 0.5 && mutated.fonts!.length < FONT_POOL.length) {
        const candidates = FONT_POOL.filter(f => !mutated.fonts!.includes(f));
        if (candidates.length) mutated.fonts!.push(candidates[Math.floor(Math.random() * candidates.length)]);
      } else if (mutated.fonts!.length > 3) {
        mutated.fonts!.splice(Math.floor(Math.random() * mutated.fonts!.length), 1);
      }
      // Timezone may change (VPN, travel) — always pick a different one
      if (Math.random() < 0.2) {
        const otherZones = TIMEZONES.filter(tz => tz !== mutated.timezone);
        mutated.timezone = otherZones[Math.floor(Math.random() * otherZones.length)];
      }
			// Canvas: re-hash with fresh jitter to simulate GPU micro-differences.
      // The stable seed is derived from the existing hash so the same device
      // stays recognisable; only the jitter suffix changes.
      const jitterRng = makePrng(Date.now() ^ Math.floor(Math.random() * 0xffffffff));
      mutated.canvas = simpleHash(mutated.canvas! + jitterRng.int(0, 99999).toString());
      // Audio: small float drift
      mutated.audio = simpleHash(mutated.audio! + String(Math.floor(Math.random() * 50)));
      break;
    }

    case 'high': {
      // Connected / disconnected external monitor — always pick a different resolution
      const otherRes = SCREEN_RESOLUTIONS.filter(
        ([w, h]) => w !== mutated.screen!.width || h !== mutated.screen!.height
      );
      const res = (otherRes.length ? otherRes : SCREEN_RESOLUTIONS)[
        Math.floor(Math.random() * (otherRes.length || SCREEN_RESOLUTIONS.length))
      ];
      mutated.screen!.width  = res[0];
      mutated.screen!.height = res[1];
      // Major Chrome upgrade (2–6 versions)
      mutated.userAgent = mutated.userAgent!.replace(
        /Chrome\/(\d+)/,
        (_, v) => `Chrome/${parseInt(v) + Math.floor(Math.random() * 5) + 2}`
      );
      mutated.appVersion = mutated.appVersion!.replace(
        /Chrome\/(\d+)/,
        (_, v) => `Chrome/${parseInt(v) + Math.floor(Math.random() * 5) + 2}`
      );
      // DoNotTrack toggled
      mutated.doNotTrack = Math.random() < 0.3 ? '1' : false as any;
      // Several new fonts (or removal of several)
      if (Math.random() < 0.5) {
        const extras = FONT_POOL.filter(f => !mutated.fonts!.includes(f)).slice(0, Math.floor(Math.random() * 4) + 1);
        mutated.fonts = [...mutated.fonts!, ...extras];
      } else {
        mutated.fonts = mutated.fonts!.slice(0, Math.max(4, mutated.fonts!.length - Math.floor(Math.random() * 3) - 1));
      }
			// Canvas: larger drift (driver update changes pixel output)
      const jitterRng = makePrng(Date.now() ^ Math.floor(Math.random() * 0xffffffff));
      mutated.canvas = simpleHash(mutated.canvas! + jitterRng.int(0, 9999999).toString());
      // WebGL: renderer string may change after driver update
      const webglJitter = makePrng(Date.now() ^ Math.floor(Math.random() * 0xffffffff));
      mutated.webgl = simpleHash(mutated.webgl! + webglJitter.int(0, 9999999).toString());
      break;
    }

    case 'extreme': {
      // Derive a stable far-away fingerprint from the original profile.
      const fingerprintSeed = parseInt(simpleHash(JSON.stringify(fp)), 36);
      const newSeed = 50_000 + (fingerprintSeed % 1_000_000);
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
 * 
 * @returns An array of `LabeledFingerprint` objects, where each device has multiple sessions with varying mutation levels. The `deviceLabel` field is the same for all sessions of a given device, allowing for accuracy testing of the fingerprinter's ability to link sessions from the same device despite mutations.
 *
 * @remarks
 * This function creates a dataset that simulates real-world conditions where the same physical device may produce slightly different fingerprints across sessions due to various factors (browser updates, font changes, environmental differences). By including multiple sessions per device with controlled mutation levels, this dataset allows for robust benchmarking of fingerprinting algorithms' ability to correctly identify and link sessions from the same device while distinguishing between different devices.
 */
export function generateDataset(numDevices = 1000, sessionsPerDevice = 5): LabeledFingerprint[] {
  const dataset: LabeledFingerprint[] = [];
  const mutationCycle: Array<'none' | 'low' | 'medium' | 'high'> = ['none', 'low', 'medium', 'high', 'low'];

  for (let d = 0; d < numDevices; d++) {
    const deviceId = `dev_${randomUUID()}`;
    const base = createBaseFingerprint(d);

		// ~10–15% chance this device is an attractor-zone device
		const isAttractor = Math.random() < 0.125;
		const baseFp = isAttractor ? createAttractorFingerprint(d) : base;

    for (let s = 0; s < sessionsPerDevice; s++) {
      const level = mutationCycle[s % mutationCycle.length];
      // Layer a secondary low-jitter pass on ~40% of non-none sessions to
      // ensure genuine pairs are never perfectly identical
      let data = mutate(baseFp, level);
      if (level !== 'none' && Math.random() < 0.4) {
        data = mutate(data, 'low');
      }

      dataset.push({ id: deviceId, data, deviceLabel: deviceId, isAttractor });
    }
  }
  return dataset;
}

export function generateBrowserDrift(
  seed: number,
  level: 'minor' | 'major' | 'cross-browser'
): ScenarioPair {
  const base = createBaseFingerprint(seed);
  const drifted = cloneFingerprint(base);
  const rng = makePrng(seed ^ 0x11111111);

  if (level === 'minor') {
    drifted.userAgent = replaceMajorVersion(base.userAgent, 124 + rng.int(1, 2));
    drifted.appVersion = replaceMajorVersion(base.appVersion, 124 + rng.int(1, 2));
    drifted.highEntropyValues = {
      ...drifted.highEntropyValues,
      uaFullVersion: `124.0.${rng.int(6000, 6999)}.${rng.int(100, 200)}`,
    };
    return { label: 'browser-drift:minor', fp1: base, fp2: drifted, expectedSameDevice: true };
  }

  if (level === 'major') {
    drifted.userAgent = replaceMajorVersion(base.userAgent, 130 + rng.int(0, 3));
    drifted.appVersion = replaceMajorVersion(base.appVersion, 130 + rng.int(0, 3));
    drifted.plugins = [{ name: 'Chrome PDF Viewer', description: 'Portable Document Format' }];
    drifted.mimeTypes = [{ type: 'application/pdf', description: 'Portable Document Format', suffixes: 'pdf' }];
    drifted.fonts = [...(base.fonts ?? []).slice(0, 8), 'Fira Code'];
    return { label: 'browser-drift:major', fp1: base, fp2: drifted, expectedSameDevice: true };
  }

  const crossBrowser = createBaseFingerprint(seed + 9000);
  crossBrowser.platform = base.platform;
  crossBrowser.screen = base.screen!;
  crossBrowser.hardwareConcurrency = base.hardwareConcurrency;
  crossBrowser.deviceMemory = base.deviceMemory;
  crossBrowser.userAgent = `Mozilla/5.0 (${base.platform || 'X11'}) Gecko/20100101 Firefox/${rng.int(122, 128)}.0`;
  crossBrowser.vendor = '';
  crossBrowser.product = 'Gecko';
  crossBrowser.productSub = '20100101';
  return { label: 'browser-drift:cross-browser', fp1: base, fp2: crossBrowser, expectedSameDevice: false };
}

export function generateEnvironmentChange(
  seed: number,
  scenario: 'home-office' | 'external-dock' | 'mobile-desktop'
): ScenarioPair {
  const base = createBaseFingerprint(seed);
  const changed = cloneFingerprint(base);

  if (scenario === 'home-office') {
    changed.timezone = base.timezone;
    changed.language = base.language;
    changed.languages = [...(base.languages ?? [])];
    return { label: 'environment-change:home-office', fp1: base, fp2: changed, expectedSameDevice: true };
  }

  if (scenario === 'external-dock') {
    changed.screen = {
      ...base.screen!,
      width: 2560,
      height: 1440,
      orientation: { type: 'landscape-primary', angle: 0 },
    };
    return { label: 'environment-change:external-dock', fp1: base, fp2: changed, expectedSameDevice: true };
  }

  const mobile = createBaseFingerprint(seed + 7000);
  mobile.platform = 'iPhone';
  mobile.screen = {
    width: 390,
    height: 844,
    colorDepth: 24,
    pixelDepth: 24,
    orientation: { type: 'portrait-primary', angle: 0 },
  };
  mobile.userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  mobile.vendor = 'Apple Computer, Inc.';
  mobile.hardwareConcurrency = 4;
  mobile.deviceMemory = 4;
  return { label: 'environment-change:mobile-desktop', fp1: base, fp2: mobile, expectedSameDevice: false };
}

export function generatePrivacyResistance(
  seed: number,
  type: 'tor' | 'resistant-browser' | 'canvas-defender'
): ScenarioPair {
  if (type === 'tor') {
    const torA = createTorFingerprint(seed);
    const torB = createTorFingerprint(seed + 1);
    return { label: 'privacy-resistance:tor', fp1: torA, fp2: torB, expectedSameDevice: false };
  }

  if (type === 'resistant-browser') {
    const left = createPrivacyResistantFingerprint(seed);
    const right = createPrivacyResistantFingerprint(seed + 1);
    return { label: 'privacy-resistance:resistant-browser', fp1: left, fp2: right, expectedSameDevice: false };
  }

  const base = createBaseFingerprint(seed);
  const defended = cloneFingerprint(base);
  defended.canvas = simpleHash(`${base.canvas}-defended`);
  defended.webgl = simpleHash(`${base.webgl}-defended`);
  return { label: 'privacy-resistance:canvas-defender', fp1: base, fp2: defended, expectedSameDevice: true };
}

export function generateAdversarialPerturbation(
  seed: number,
  type: 'canvas-noise' | 'font-randomization' | 'ua-rotation'
): ScenarioPair {
  const base = createBaseFingerprint(seed);
  const changed = cloneFingerprint(base);

  if (type === 'canvas-noise') {
    changed.canvas = simpleHash(`${base.canvas}-noise`);
    changed.webgl = simpleHash(`${base.webgl}-noise`);
    return { label: 'adversarial-perturbation:canvas-noise', fp1: base, fp2: changed, expectedSameDevice: true };
  }

  if (type === 'font-randomization') {
    changed.fonts = [...(base.fonts ?? [])].reverse();
    changed.plugins = [];
    changed.mimeTypes = [];
    return { label: 'adversarial-perturbation:font-randomization', fp1: base, fp2: changed, expectedSameDevice: true };
  }

  changed.userAgent = 'Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/126.0';
  changed.appVersion = '5.0 (X11) Gecko/20100101 Firefox/126.0';
  changed.vendor = '';
  changed.product = 'Gecko';
  changed.productSub = '20100101';
  return { label: 'adversarial-perturbation:ua-rotation', fp1: base, fp2: changed, expectedSameDevice: true };
}

export function generateTravelNetworkChange(
  seed: number,
  type: 'timezone-travel' | 'vpn-activation'
): ScenarioPair {
  const base = createBaseFingerprint(seed);
  const changed = cloneFingerprint(base);

  if (type === 'timezone-travel') {
    changed.timezone = base.timezone === 'Europe/London' ? 'Asia/Tokyo' : 'Europe/London';
    return { label: 'travel-network-change:timezone-travel', fp1: base, fp2: changed, expectedSameDevice: true };
  }

  return { label: 'travel-network-change:vpn-activation', fp1: base, fp2: changed, expectedSameDevice: true };
}

export function generateCommodityCollision(
  seed: number,
  type: 'corporate-fleet' | 'iphone-defaults' | 'public-terminal'
): ScenarioPair {
  if (type === 'corporate-fleet') {
    const left = createAttractorFingerprint(seed);
    const right = createAttractorFingerprint(seed + 1);
    left.canvas = 'fleet-canvas';
    left.webgl = 'fleet-webgl';
    left.audio = 'fleet-audio';
    right.canvas = 'fleet-canvas';
    right.webgl = 'fleet-webgl';
    right.audio = 'fleet-audio';
    return { label: 'commodity-collision:corporate-fleet', fp1: left, fp2: right, expectedSameDevice: false };
  }

  if (type === 'iphone-defaults') {
    const left = createBaseFingerprint(seed);
    const right = createBaseFingerprint(seed + 1);
    left.platform = 'iPhone';
    right.platform = 'iPhone';
    left.userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    right.userAgent = left.userAgent;
    left.language = 'en-US';
    right.language = 'en-US';
    left.languages = ['en-US', 'en'];
    right.languages = ['en-US', 'en'];
    left.screen = {
      width: 390,
      height: 844,
      colorDepth: 24,
      pixelDepth: 24,
      orientation: { type: 'portrait-primary', angle: 0 },
    };
    right.screen = left.screen!;
    left.canvas = 'iphone-default-canvas';
    left.webgl = 'iphone-default-webgl';
    left.audio = 'iphone-default-audio';
    right.canvas = left.canvas;
    right.webgl = left.webgl;
    right.audio = left.audio;
    return { label: 'commodity-collision:iphone-defaults', fp1: left, fp2: right, expectedSameDevice: false };
  }

  const left = createPrivacyResistantFingerprint(seed);
  const right = createPrivacyResistantFingerprint(seed + 1);
  left.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PublicTerminal/1.0';
  left.platform = 'Win32';
  right.userAgent = left.userAgent;
  right.platform = left.platform;
  return { label: 'commodity-collision:public-terminal', fp1: left, fp2: right, expectedSameDevice: false };
}