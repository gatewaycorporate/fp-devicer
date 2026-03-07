import { describe, expect, it } from 'vitest';
import { calculateConfidence } from '../src/libs/confidence';
import type { FPUserDataSet } from '../src/types/data';

const sampleData1: FPUserDataSet = {
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
		{ name: 'Widevine Content Decryption Module', description: 'Content Protection' },
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

const sampleData2: FPUserDataSet = {
	userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
	platform: 'Linux x86_64',
	timezone: 'Asia/Tokyo',
	language: 'ja-JP',
	languages: ['ja-JP', 'ja', 'en-US'],
	cookieEnabled: false,
	doNotTrack: '0',
	hardwareConcurrency: 2,
	deviceMemory: 2,
	product: 'Gecko',
	productSub: '20100101',
	vendor: 'Chromium',
	vendorSub: 'beta',
	appName: 'Netscape',
	appVersion: '5.0 (X11)',
	appCodeName: 'Mozilla',
	appMinorVersion: '1',
	buildID: '20240202000000',
	plugins: [
		{ name: 'VLC Web Plugin', description: 'VLC multimedia plugin' },
		{ name: 'Java Plug-in', description: 'Java Runtime' },
	],
	mimeTypes: [
		{ type: 'video/webm', suffixes: 'webm', description: 'WebM Video' },
		{ type: 'application/xml', suffixes: 'xml', description: 'XML Data' },
	],
	screen: {
		width: 1366,
		height: 768,
		colorDepth: 30,
		pixelDepth: 30,
		orientation: {
			type: 'portrait-primary',
			angle: 90,
		},
	},
	fonts: ['Noto Sans JP', 'Ubuntu', 'Monospace'],
	highEntropyValues: {}
};

describe('Confidence Calculation', () => {
	it('should calculate confidence between two user data objects', () => {
		const confidence = calculateConfidence(sampleData1, sampleData2);
		console.log('Confidence:', confidence);
		expect(typeof confidence).toBe('number');
		expect(confidence).toBeGreaterThanOrEqual(0);
		expect(confidence).toBeLessThanOrEqual(100);
	});

	it('should return 100% confidence for identical user data', () => {
		const confidence = calculateConfidence(sampleData1, sampleData1);
		expect(confidence).toBe(100);
	});

	it('should return high confidence for similar user data', () => {
		const similarData: FPUserDataSet = {
			...sampleData1,
			deviceMemory: 16,
		};
		const confidence = calculateConfidence(sampleData1, similarData);
		console.log('Confidence for similar data:', confidence);
		expect(confidence).toBeGreaterThan(80);
	});

	it('should return lower confidence for different user data', () => {
		const confidence = calculateConfidence(sampleData1, sampleData2);
		console.log('Confidence for different data:', confidence);
		expect(confidence).toBeLessThan(10);
	});

	it('should return middling confidence for partially similar data', () => {
		const partialData: FPUserDataSet = {
			...sampleData1,
			hardwareConcurrency: 4,
			deviceMemory: 4,
			timezone: 'Europe/London',
			language: 'en-GB',
			screen: {
				...sampleData1.screen,
				width: 1600,
				height: 900,
			},
			highEntropyValues: {
				...sampleData1.highEntropyValues,
				architecture: 'arm',
				platformVersion: '14.0.0',
			},
		};
		const confidence = calculateConfidence(sampleData1, partialData);
		console.log('Confidence for partially similar data:', confidence);
		expect(confidence).toBeGreaterThan(10);
		expect(confidence).toBeLessThan(95);
	});

	it('should handle empty datasets and nonetypes gracefully', () => {
		const incompleteData = {
			...sampleData1,
			plugins: [],
			screen: null,
		} as unknown as FPUserDataSet;
		const confidence = calculateConfidence(sampleData1, incompleteData);
		expect(confidence).toBeGreaterThan(0);
		expect(confidence).toBeLessThan(100);
	});
});
