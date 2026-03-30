import { describe, expect, it } from 'vitest';
import { buildScenarioBenchRows, buildScenarioPairs, formatScenarioTable } from '../../benchmarks/scenario-matrix';

describe('Scenario benchmark helpers', () => {
	it('buildScenarioPairs returns the full scenario matrix', () => {
		const pairs = buildScenarioPairs();

		expect(pairs).toHaveLength(17);
		expect(new Set(pairs.map((pair) => pair.label)).size).toBe(pairs.length);
	});

	it('buildScenarioBenchRows computes comparable score rows for each pair', () => {
		const rows = buildScenarioBenchRows();

		expect(rows).toHaveLength(17);
		for (const row of rows) {
			expect(row.score).toBeGreaterThanOrEqual(0);
			expect(row.score).toBeLessThanOrEqual(100);
			expect(row.deviceSimilarity).toBeGreaterThanOrEqual(0);
			expect(row.deviceSimilarity).toBeLessThanOrEqual(100);
		}
	});

	it('keeps same-device scenarios at or above 85 and different-device scenarios below 85', () => {
		const rows = buildScenarioBenchRows();
		const sameDeviceFailures = rows.filter((row) => row.expectedSameDevice && row.score < 85);
		const differentDeviceFailures = rows.filter((row) => row.expectedSameDevice === false && row.score >= 85);

		expect(sameDeviceFailures).toEqual([]);
		expect(differentDeviceFailures).toEqual([]);
	});

	it('formatScenarioTable renders a readable table with scenario labels', () => {
		const rows = buildScenarioBenchRows().slice(0, 2);
		const table = formatScenarioTable(rows);

		expect(table).toContain('Scenario');
		expect(table).toContain(rows[0].scenario);
		expect(table).toContain('same-device');
	});
});