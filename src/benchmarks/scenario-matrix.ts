import { calculateConfidence, calculateScoreBreakdown } from '../libs/confidence.js';
import {
	ScenarioPair,
	generateAdversarialPerturbation,
	generateBrowserDrift,
	generateCommodityCollision,
	generateEnvironmentChange,
	generatePrivacyResistance,
	generateTravelNetworkChange,
} from './data-generator.js';

export interface ScenarioBenchRow {
	scenario: string;
	expectedSameDevice: boolean;
	score: number;
	deviceSimilarity: number;
	fieldAgreement: number;
	attractorRisk: number;
	missingOneSide: number;
}

function formatBoolean(value: boolean): string {
	return value ? 'same-device' : 'different-device';
}

export function buildScenarioPairsForSeed(seed: number): ScenarioPair[] {
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

export function buildScenarioPairs(): ScenarioPair[] {
	return buildScenarioPairsForSeed(100);
}

export function buildScenarioBenchRows(pairs: ScenarioPair[] = buildScenarioPairs()): ScenarioBenchRow[] {
	return pairs.map((pair) => {
		const breakdown = calculateScoreBreakdown(pair.fp1, pair.fp2);
		return {
			scenario: pair.label,
			expectedSameDevice: pair.expectedSameDevice,
			score: calculateConfidence(pair.fp1, pair.fp2),
			deviceSimilarity: breakdown.deviceSimilarity,
			fieldAgreement: breakdown.fieldAgreement,
			attractorRisk: breakdown.attractorRisk,
			missingOneSide: breakdown.missingOneSide,
		};
	});
}

export function formatScenarioTable(rows: ScenarioBenchRow[]): string {
	if (!rows.length) return '(empty)\n';
	const serializable = rows.map((row) => ({
		Scenario: row.scenario,
		Expected: formatBoolean(row.expectedSameDevice),
		Score: row.score,
		DeviceSimilarity: row.deviceSimilarity,
		FieldAgreement: row.fieldAgreement,
		AttractorRisk: row.attractorRisk,
		MissingOneSide: row.missingOneSide,
	}));
	const keys = Object.keys(serializable[0]);
	const tableRows = serializable.map((row) =>
		keys.map((key) => {
			const value = row[key as keyof typeof row];
			return typeof value === 'number' ? value.toFixed(2) : String(value);
		})
	);
	const widths = keys.map((key, index) => Math.max(key.length, ...tableRows.map((row) => row[index].length)));
	const header = keys.map((key, index) => key.padEnd(widths[index])).join(' | ');
	const separator = widths.map((width) => '-'.repeat(width)).join('-+-');
	const body = tableRows
		.map((row) => row.map((value, index) => value.padEnd(widths[index])).join(' | '))
		.join('\n');
	return `${header}\n${separator}\n${body}\n`;
}