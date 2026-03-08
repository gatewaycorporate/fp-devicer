import type { FPDataSet } from '../types/data.js'; // adjust path
import { randomUUID } from 'crypto';

export interface LabeledFingerprint {
  id: string;
  data: FPDataSet;
  deviceLabel: string; // same device = same label
}

export function createBaseFingerprint(seed: number): FPDataSet {
  // deterministic base using seed (for reproducibility)
	const seedMod3 = seed % 3;
	const seedMod5 = seed % 5;
	const seedMod8 = seed % 8;
	
	return {
		userAgent: `Mozilla/5.0 (${seedMod3 === 0 ? 'Windows NT 10.0; Win64; x64' : seedMod3 === 1 ? 'Macintosh; Intel Mac OS X 10_15_7' : 'X11; Linux x86_64'}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${120 + seedMod5}.0.0.0 Safari/537.36`,
		platform: seedMod3 === 0 ? 'Win32' : seedMod3 === 1 ? 'MacIntel' : 'Linux x86_64',
		timezone: ['America/New_York', 'America/Los_Angeles', 'Europe/London'][seedMod3],
		language: ['en-US', 'en-GB', 'fr-FR'][seedMod3],
		languages: seedMod3 === 0 ? ['en-US', 'en'] : seedMod3 === 1 ? ['en-GB', 'en'] : ['fr-FR', 'fr'],
		cookieEnabled: true,
		doNotTrack: false,
		product: 'Gecko',
		productSub: '20100101',
		vendor: 'Google Inc.',
		vendorSub: '',
		appName: 'Netscape',
		appVersion: `5.0 (${seedMod3 === 0 ? 'Windows' : seedMod3 === 1 ? 'Macintosh' : 'X11'}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${120 + seedMod5}.0.0.0 Safari/537.36`,
		appCodeName: 'Mozilla',
		appMinorVersion: '0',
		buildID: '20240101',
		hardwareConcurrency: 4 + seedMod8,
		deviceMemory: 4 + seedMod8,
		screen: {
			width: 1920 + (seed % 100),
			height: seedMod8 < 4 ? 1080 : 1440,
			colorDepth: 24,
			pixelDepth: 24,
			orientation: {
				type: 'landscape-primary',
				angle: 0
			}
		},
		fonts: ['Arial', 'Helvetica', 'Verdana'],
		plugins: [
			{ name: "Chrome PDF Viewer", description: "Portable Document Format" }
		],
		mimeTypes: [
			{ type: "application/pdf", description: "Portable Document Format", suffixes: "pdf" }
		],
		highEntropyValues: {}
	};
}

export function mutate(fp: FPDataSet, mutationLevel: 'none' | 'low' | 'medium' | 'high' | 'extreme'): FPDataSet {
  const mutated = structuredClone(fp);
  switch (mutationLevel) {
    case 'low': // 1px change (common)
      mutated.screen!.width! += 1;
      break;
    case 'medium': // Added fonts, minor UA change
      mutated.fonts!.push('NewFont-' + Math.random());
      mutated.userAgent = mutated.userAgent!.replace('Chrome/120', 'Chrome/121');
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
export function generateDataset(numDevices = 1000, sessionsPerDevice = 5): LabeledFingerprint[] {
  const dataset: LabeledFingerprint[] = [];
  for (let d = 0; d < numDevices; d++) {
    const deviceId = `dev_${randomUUID()}`;
    const base = createBaseFingerprint(d);
    for (let s = 0; s < sessionsPerDevice; s++) {
      const mutation = s === 0 ? 'none' : ['low', 'medium', 'high'][s % 3] as any;
      dataset.push({
        id: deviceId,
        data: mutate(base, mutation),
        deviceLabel: deviceId
      });
    }
  }
  return dataset;
}