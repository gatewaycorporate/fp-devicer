import type { FPUserDataSet } from '../../types/data.js';

export const fpIdentical: FPUserDataSet = {
	userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
	platform: 'Win32',
	timezone: 'America/New_York',
	language: 'en-US',
	languages: ['en-US', 'en'],
	cookieEnabled: true,
	doNotTrack: '1',
	hardwareConcurrency: 8,
	deviceMemory: 8,
	product: 'Gecko',
	productSub: '20030107',
	vendor: 'Google Inc.',
	vendorSub: '',
	appName: 'Netscape',
	appVersion: '5.0 (Windows)',
	appCodeName: 'Mozilla',
	appMinorVersion: '0',
	buildID: '20240101000000',
	plugins: [
		{ name: 'Chrome PDF Viewer', description: 'Portable Document Format' },
	],
	mimeTypes: [
		{ type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
		{ type: 'application/json', suffixes: 'json', description: 'JSON Data' },
	],
	screen: {
		width: 1920,
		height: 1080,
		colorDepth: 24,
		pixelDepth: 24,
		orientation: {
			type: 'landscape-primary',
			angle: 0,
		},
	},
	fonts: ['Arial', 'Segoe UI', 'Times New Roman', 'Courier New'],
	highEntropyValues: {}
};

export const fpVerySimilar: FPUserDataSet = {
  ...fpIdentical,
  screen: { ...fpIdentical.screen, width: 1600, height: 900 },
};

export const fpDifferent: FPUserDataSet = {
  ...fpIdentical,
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/14.0 Safari/605.1.15',
  platform: 'MacIntel',
  timezone: 'Europe/London',
  language: 'en-GB',
  languages: ['en-GB', 'en'],
  vendor: 'Apple Inc.',
  appName: 'Safari',
  appVersion: '14.0 (Macintosh)',
  fonts: ['Helvetica', 'Times', 'Courier', 'Verdana', 'Georgia', 'Palatino', 'Garamond', 'Bookman'],
  screen: { ...fpIdentical.screen, width: 2560, height: 1440 },
  hardwareConcurrency: 16,
};

export const fpVeryDifferent: FPUserDataSet = {
    ...fpDifferent,
    userAgent: 'Mozilla/5.0 (Linux; Android 10; SM-G970F) AppleWebKit/537.36 Chrome/88.0.4324.93 Mobile Safari/537.36',
    platform: 'Linux armv8l',
    timezone: 'Asia/Tokyo',
    language: 'ja-JP',
    languages: ['ja-JP', 'en-US', 'en'],
    cookieEnabled: true,
    doNotTrack: '1',
    hardwareConcurrency: 4,
    deviceMemory: 4,
    product: 'Gecko',
    productSub: '20030107',
    vendor: 'Google Inc.',
    vendorSub: '',
    appName: 'Netscape',
    appVersion: '5.0 (Linux; Android 10)',
    appCodeName: 'Mozilla',
    appMinorVersion: '0',
    buildID: '20200101000000',
    plugins: [
    ],
    mimeTypes: [
    ],
    screen: {
        width: 1080,
        height: 2280,
        colorDepth: 24,
        pixelDepth: 24,
        orientation: {
            type: 'portrait-primary',
            angle: 0,
        },
    },
    fonts: ['Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', 'Meiryo', 'Segoe UI', 'Roboto', 'Arial', 'Verdana'],
    highEntropyValues: {
        architecture: 'arm',
        model: 'SM-G970F',
        platformVersion: '10',
        uaFullVersion: '88.0.4324.93',
        mobile: true,
        platform: 'Android'
    }
};