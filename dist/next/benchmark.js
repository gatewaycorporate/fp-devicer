import { evaluateCalibration } from './calibration.js';
import { assertDisjointEvaluationSplits, validateEvaluationManifest } from './evaluation.js';
import { compareFingerprints } from './index.js';
export async function runEvaluation(adapter, pairs, options) {
    validateEvaluationManifest(options.manifest);
    if (options.manifest.domain !== adapter.domain)
        throw new Error('Evaluation manifest domain does not match adapter');
    if (!(options.threshold >= 0 && options.threshold <= 1))
        throw new Error('Evaluation threshold must be between 0 and 1');
    if (options.calibrationManifest)
        assertDisjointEvaluationSplits(options.calibrationManifest, options.manifest);
    const relation = options.relation ?? adapter.relationships[0]?.id;
    if (!relation || !adapter.relationships.some(item => item.id === relation))
        throw new Error('Evaluation relation is not supported by adapter');
    const now = options.now ?? (() => performance.now());
    const results = [];
    for (const pair of pairs) {
        const started = now();
        const comparison = await compareFingerprints(adapter, pair.left, pair.right, relation);
        results.push({ pair, comparison, latency: Math.max(0, now() - started) });
    }
    const supported = results.filter(item => item.comparison.similarity !== null && item.comparison.status !== 'unsupported_configuration');
    const scores = supported.map(item => item.comparison.similarity);
    const genuine = results.filter(item => item.pair.label === 1);
    const impostor = results.filter(item => item.pair.label === 0);
    const falseMatches = impostor.filter(item => item.comparison.similarity !== null && item.comparison.similarity >= options.threshold).length;
    const falseNonMatches = genuine.filter(item => item.comparison.similarity !== null && item.comparison.similarity < options.threshold).length;
    const slices = [...new Set(pairs.map(pair => pair.quality).filter((value) => Boolean(value)))].sort();
    const calibration = options.calibration
        ? evaluateCalibration(results.map(item => ({ pairId: item.pair.pairId, comparison: item.comparison, label: { pairId: item.pair.pairId, label: item.pair.label, source: 'external' } })), options.calibration.artifact, options.calibration.manifest)
        : undefined;
    return {
        manifestId: options.manifest.id, domain: adapter.domain, relation, threshold: options.threshold,
        total: results.length, genuine: genuine.length, impostor: impostor.length,
        supported: supported.length,
        insufficient: results.filter(item => item.comparison.status === 'insufficient_data').length,
        unsupported: results.filter(item => item.comparison.status === 'unsupported_configuration').length,
        abstentionRate: results.length === 0 ? 0 : (results.length - supported.length) / results.length,
        falseMatchRate: impostor.length === 0 ? null : falseMatches / impostor.length,
        falseNonMatchRate: genuine.length === 0 ? null : falseNonMatches / genuine.length,
        score: summarize(scores), latencyMs: latencySummary(results.map(item => item.latency)),
        qualitySlices: slices.map(name => summarizeSlice(name, results.filter(item => item.pair.quality === name))),
        ...(calibration ? { calibration } : {}),
    };
}
function summarize(values) {
    if (values.length === 0)
        return { min: null, max: null, mean: null };
    return { min: Math.min(...values), max: Math.max(...values), mean: values.reduce((sum, value) => sum + value, 0) / values.length };
}
function latencySummary(values) {
    if (values.length === 0)
        return { p50: null, p95: null, p99: null };
    const sorted = [...values].sort((left, right) => left - right);
    const percentile = (fraction) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
    return { p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99) };
}
function summarizeSlice(name, results) {
    const scores = results.flatMap(item => item.comparison.similarity === null ? [] : [item.comparison.similarity]);
    return { name, total: results.length, supported: scores.length, abstentions: results.length - scores.length, meanSimilarity: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null };
}
