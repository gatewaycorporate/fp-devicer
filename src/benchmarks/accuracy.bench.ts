import { bench, describe } from 'vitest';
import type { LabeledFingerprint } from './data-generator.js';
import { calculateConfidence } from '../libs/confidence.js';
import { generateDataset } from './data-generator.js';
import { calculateMetrics } from './metrics.js';

describe('Accuracy & Robustness', () => {
  // ←←← PUT THE bench() FUNCTION HERE ←←←
  bench('full accuracy evaluation (2000 devices, 5000 pairs)', () => {
    // This is the exact spot — everything heavy goes inside this bench callback
    const dataset: LabeledFingerprint[] = generateDataset(2000, 5);

    // Pre-compute scored pairs (this is what we want Vitest to time)
    const scoredPairs: { score: number; sameDevice: boolean }[] = [];
    for (let i = 0; i < 5000; i++) {
      const a = dataset[i % dataset.length];
      const b = dataset[(i + 500) % dataset.length];
      const score = calculateConfidence(a.data, b.data);
      scoredPairs.push({
        score,
        sameDevice: a.deviceLabel === b.deviceLabel,
      });
    }

    const results = calculateMetrics(scoredPairs);

    // Optional: still do assertions (Vitest allows this inside bench)
    const best = results.reduce((a, b) => (a.f1 > b.f1 ? a : b));
    if (best.eer > 0.08) {
      throw new Error(`EER too high: ${best.eer.toFixed(3)} (threshold 0.08)`);
    }

    // Nice output in terminal + JSON reporter
    console.table(results);
  });
});