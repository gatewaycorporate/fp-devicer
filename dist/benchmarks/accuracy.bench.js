import { bench, describe } from 'vitest';
import { calculateConfidence } from '../libs/confidence.js';
import { generateDataset } from './data-generator.js';
import { calculateMetrics } from './metrics.js';
// Generated once at module load — outside every bench iteration
const dataset = generateDataset(2000, 5);
const groups = new Map();
for (const item of dataset) {
    if (!groups.has(item.deviceLabel))
        groups.set(item.deviceLabel, []);
    groups.get(item.deviceLabel).push(item);
}
const devices = Array.from(groups.keys());
describe('Accuracy & Robustness', () => {
    bench('full accuracy evaluation (2000 devices, 5000 pairs)', () => {
        const scoredPairs = [];
        // 1. Generate balanced genuine + impostor pairs
        for (let i = 0; i < 2500; i++) { // 2500 genuine + 2500 impostor
            // Genuine pair: two different samples from SAME device
            const dev = devices[i % devices.length];
            const samples = groups.get(dev);
            if (samples.length < 2)
                continue; // skip if device has only 1 sample
            const idx1 = i % samples.length;
            const idx2 = (idx1 + 1 + i) % samples.length; // different sample
            const a = samples[idx1];
            const b = samples[idx2];
            scoredPairs.push({
                score: calculateConfidence(a.data, b.data),
                sameDevice: true
            });
            // Impostor pair: samples from two different devices
            const dev2 = devices[(i + 1) % devices.length];
            const c = groups.get(dev2)[i % groups.get(dev2).length];
            const d = groups.get(dev)[(idx1 + 3) % samples.length]; // different from a
            scoredPairs.push({
                score: calculateConfidence(c.data, d.data),
                sameDevice: false
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
