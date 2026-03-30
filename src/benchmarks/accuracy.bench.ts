import { writeFileSync } from 'fs';
import { fileURLToPath } from 'node:url';
import { bench, describe } from 'vitest';
import { calculateConfidence } from '../libs/confidence.js';
import {
  generateAdversarialPerturbation,
  generateBrowserDrift,
  generateCommodityCollision,
  generateEnvironmentChange,
  generatePrivacyResistance,
  generateTravelNetworkChange,
} from './data-generator.js';
import { calculateMetrics } from './metrics.js';

interface ScoredPair {
  score: number;
  sameDevice: boolean;
  isAttractor: boolean;
  scenario: string;
}

interface ScenarioSummary {
  scenario: string;
  sameDevice: string;
  count: number;
  avgScore: number;
  minScore: number;
  maxScore: number;
}

function formatTable(data: Record<string, unknown>[]): string {
  if (data.length === 0) return '(empty)\n';
  const keys = Object.keys(data[0]);
  const rows = data.map(row =>
    keys.map(k => {
      const val = row[k];
      return typeof val === 'number' ? (val as number).toFixed(3) : String(val);
    })
  );
  const colWidths = keys.map((k, i) =>
    Math.max(k.length, ...rows.map(r => r[i].length))
  );
  const sep = colWidths.map(w => '-'.repeat(w)).join('-+-');
  const header = keys.map((k, i) => k.padEnd(colWidths[i])).join(' | ');
  const body = rows.map(r => r.map((v, i) => v.padEnd(colWidths[i])).join(' | ')).join('\n');
  return `${header}\n${sep}\n${body}\n`;
}

const scoredPairs: ScoredPair[] = [];

const scenarioSeeds = Array.from({ length: 50 }, (_, index) => 1000 + index * 17);

function isAttractorScenario(label: string): boolean {
  return label.startsWith('privacy-resistance:') || label.startsWith('commodity-collision:');
}

function buildScenarioBatch(seed: number) {
  return [
    generateBrowserDrift(seed + 1, 'minor'),
    generateBrowserDrift(seed + 2, 'major'),
    generateBrowserDrift(seed + 3, 'cross-browser'),
    generateEnvironmentChange(seed + 4, 'home-office'),
    generateEnvironmentChange(seed + 5, 'external-dock'),
    generateEnvironmentChange(seed + 6, 'mobile-desktop'),
    generatePrivacyResistance(seed + 7, 'tor'),
    generatePrivacyResistance(seed + 8, 'resistant-browser'),
    generatePrivacyResistance(seed + 9, 'canvas-defender'),
    generateAdversarialPerturbation(seed + 10, 'canvas-noise'),
    generateAdversarialPerturbation(seed + 11, 'font-randomization'),
    generateAdversarialPerturbation(seed + 12, 'ua-rotation'),
    generateTravelNetworkChange(seed + 13, 'timezone-travel'),
    generateTravelNetworkChange(seed + 14, 'vpn-activation'),
    generateCommodityCollision(seed + 15, 'corporate-fleet'),
    generateCommodityCollision(seed + 16, 'iphone-defaults'),
    generateCommodityCollision(seed + 17, 'public-terminal'),
  ];
}

function generatePairs() {
  scoredPairs.length = 0;
  for (const seed of scenarioSeeds) {
    for (const pair of buildScenarioBatch(seed)) {
      scoredPairs.push({
        score: calculateConfidence(pair.fp1, pair.fp2),
        sameDevice: pair.expectedSameDevice,
        isAttractor: isAttractorScenario(pair.label),
        scenario: pair.label,
      });
    }
  }
}

function buildScenarioSummary(): ScenarioSummary[] {
  return Array.from(
    scoredPairs.reduce((acc, pair) => {
      const current = acc.get(pair.scenario) ?? {
        scenario: pair.scenario,
        sameDevice: pair.sameDevice ? 'same-device' : 'different-device',
        count: 0,
        avgScore: 0,
        minScore: Number.POSITIVE_INFINITY,
        maxScore: Number.NEGATIVE_INFINITY,
      };

      current.count += 1;
      current.avgScore += pair.score;
      current.minScore = Math.min(current.minScore, pair.score);
      current.maxScore = Math.max(current.maxScore, pair.score);
      acc.set(pair.scenario, current);
      return acc;
    }, new Map<string, ScenarioSummary>()).values()
  )
    .map((row) => ({
      ...row,
      avgScore: row.avgScore / row.count,
    }))
    .sort((a, b) => a.avgScore - b.avgScore);
}

// Generate pairs synchronously at module load — beforeAll is not reliable in bench workers
generatePairs();

// Compute metrics and write file once at module load — outside the bench hot loop
{
  const results = calculateMetrics(scoredPairs);
  const best = results.reduce((a, b) => (a.f1 > b.f1 ? a : b));
  const scenarioSummary = buildScenarioSummary();
  const scenarioCentroids = scenarioSummary.map((row) => ({
    score: row.avgScore,
    sameDevice: row.sameDevice === 'same-device',
    isAttractor: isAttractorScenario(row.scenario),
  }));

  const outPath = fileURLToPath(new URL('./accuracy.bench.out', import.meta.url));
  const output = [
    `--- Accuracy Metrics (${new Date().toISOString()}) ---`,
    formatTable(results as unknown as Record<string, unknown>[]),
    `Best threshold: ${best.threshold} | F1: ${best.f1.toFixed(3)} | EER: ${best.eer.toFixed(3)}`,
    '',
    '--- Scenario Summary ---',
    formatTable(scenarioSummary as unknown as Record<string, unknown>[]),
  ].join('\n');
  writeFileSync(outPath, output);
}

describe('Accuracy & Robustness', () => {
  bench('scenario-driven accuracy evaluation', () => {
    const results = calculateMetrics(scoredPairs);
    const best = results.reduce((a, b) => (a.f1 > b.f1 ? a : b));
    if (best.eer > 0.08) {
      throw new Error(`EER too high: ${best.eer.toFixed(3)} (threshold 0.08)`);
    }
  });
});
