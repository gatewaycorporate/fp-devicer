import { writeFileSync } from 'fs';
import { bench, describe } from 'vitest';
import { calculateConfidence } from '../libs/confidence.js';
import { generateDataset } from './data-generator.js';
import { calculateMetrics, dbscanMetrics } from './metrics.js';
const dataset = generateDataset(2000, 5);
const groups = new Map();
for (const item of dataset) {
    if (!groups.has(item.deviceLabel))
        groups.set(item.deviceLabel, []);
    groups.get(item.deviceLabel).push(item);
}
function formatTable(data) {
    if (data.length === 0)
        return '(empty)\n';
    const keys = Object.keys(data[0]);
    const rows = data.map(row => keys.map(k => {
        const val = row[k];
        return typeof val === 'number' ? val.toFixed(3) : String(val);
    }));
    const colWidths = keys.map((k, i) => Math.max(k.length, ...rows.map(r => r[i].length)));
    const sep = colWidths.map(w => '-'.repeat(w)).join('-+-');
    const header = keys.map((k, i) => k.padEnd(colWidths[i])).join(' | ');
    const body = rows.map(r => r.map((v, i) => v.padEnd(colWidths[i])).join(' | ')).join('\n');
    return `${header}\n${sep}\n${body}\n`;
}
const devices = Array.from(groups.keys());
const scoredPairs = [];
function generatePairs() {
    scoredPairs.length = 0;
    for (let i = 0; i < 2500; i++) {
        const dev = devices[i % devices.length];
        const samples = groups.get(dev);
        if (samples.length < 2)
            continue;
        const idx1 = i % samples.length;
        const idx2 = (idx1 + 1 + i) % samples.length;
        const a = samples[idx1];
        const b = samples[idx2];
        scoredPairs.push({
            score: calculateConfidence(a.data, b.data),
            sameDevice: true,
            isAttractor: a.isAttractor || b.isAttractor,
        });
        const dev2 = devices[(i + 1) % devices.length];
        const c = groups.get(dev2)[i % groups.get(dev2).length];
        const d = groups.get(dev)[(idx1 + 3) % samples.length];
        const useCrossBrowser = (i % 10) < 3;
        if (useCrossBrowser && samples.length >= 2) {
            const idx3 = (idx1 + Math.floor(samples.length / 2)) % samples.length;
            const crossA = samples[idx3];
            const sortedBySize = [...devices].sort((x, y) => groups.get(y).length - groups.get(x).length);
            const attractorDev = sortedBySize[i % Math.max(1, Math.ceil(sortedBySize.length * 0.1))];
            const attractorSamples = groups.get(attractorDev);
            const attractorSample = attractorSamples[i % attractorSamples.length];
            const crossB = attractorDev !== dev
                ? attractorSample
                : groups.get(dev2)[i % groups.get(dev2).length];
            scoredPairs.push({
                score: calculateConfidence(crossA.data, crossB.data),
                sameDevice: false,
                isAttractor: crossA.isAttractor || crossB.isAttractor,
            });
        }
        scoredPairs.push({
            score: calculateConfidence(c.data, d.data),
            sameDevice: false,
            isAttractor: c.isAttractor || d.isAttractor,
        });
    }
}
// Generate pairs synchronously at module load — beforeAll is not reliable in bench workers
generatePairs();
// Compute metrics and write file once at module load — outside the bench hot loop
// so DBSCAN (O(n²)) doesn't run on every warmup/iteration
{
    const results = calculateMetrics(scoredPairs);
    const best = results.reduce((a, b) => (a.f1 > b.f1 ? a : b));
    const dbscan = dbscanMetrics(scoredPairs, 0.05, 3);
    const dbscanSummary = [
        {
            totalPairs: scoredPairs.length,
            clusters: dbscan.clusters.length,
            noisePoints: dbscan.noise.length,
            clusteredPoints: dbscan.clusters.reduce((sum, c) => sum + c.length, 0),
            largestCluster: dbscan.clusters.reduce((max, c) => Math.max(max, c.length), 0),
        },
    ];
    const outPath = new URL('./benchmark.out', import.meta.url).pathname;
    const output = [
        `--- Accuracy Metrics (${new Date().toISOString()}) ---`,
        formatTable(results),
        `Best threshold: ${best.threshold} | F1: ${best.f1.toFixed(3)} | EER: ${best.eer.toFixed(3)}`,
        '',
        '--- DBSCAN Summary ---',
        formatTable(dbscanSummary),
    ].join('\n');
    writeFileSync(outPath, output);
}
describe('Accuracy & Robustness', () => {
    bench('full accuracy evaluation (2000 devices, 5000 pairs)', () => {
        const results = calculateMetrics(scoredPairs);
        const best = results.reduce((a, b) => (a.f1 > b.f1 ? a : b));
        if (best.eer > 0.08) {
            throw new Error(`EER too high: ${best.eer.toFixed(3)} (threshold 0.08)`);
        }
    });
});
