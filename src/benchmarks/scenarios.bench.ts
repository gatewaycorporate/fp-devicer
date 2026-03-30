import { writeFileSync } from 'fs';
import { fileURLToPath } from 'node:url';
import { bench, describe } from 'vitest';
import { calculateConfidence } from '../libs/confidence.js';
import { buildScenarioBenchRows, buildScenarioPairs, formatScenarioTable } from './scenario-matrix.js';

const scenarioPairs = buildScenarioPairs();
const scenarioRows = buildScenarioBenchRows(scenarioPairs);

{
	const outPath = fileURLToPath(new URL('./scenarios.bench.out', import.meta.url));
	const header = `--- Scenario Benchmark Metrics (${new Date().toISOString()}) ---`;
	writeFileSync(outPath, `${header}\n${formatScenarioTable(scenarioRows)}`);
}

describe('Scenario Benchmarks', () => {
	for (const pair of scenarioPairs) {
		bench(pair.label, () => {
			calculateConfidence(pair.fp1, pair.fp2);
		});
	}
});