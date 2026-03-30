export interface BenchmarkResult {
  threshold: number;
  precision: number;
  recall: number;
  f1: number;
  far: number;   // False Accept Rate
  frr: number;   // False Reject Rate
  eer: number;   // Equal Error Rate (interpolated)
	attr: number;   // Far Attractor Rate (proportion of impostor pairs above threshold)
}

export function calculateMetrics(
  scoredPairs: { score: number; sameDevice: boolean, isAttractor: boolean }[],
  thresholds: number[] = Array.from({ length: 21 }, (_, i) => i * 5)
): BenchmarkResult[] {
  return thresholds.map(t => {
    let tp = 0, fp = 0, tn = 0, fn = 0;
    for (const p of scoredPairs) {
      const predictedSame = p.score >= t;
      if (p.sameDevice && predictedSame) tp++;
      else if (!p.sameDevice && predictedSame) fp++;
      else if (!p.sameDevice && !predictedSame) tn++;
      else fn++;
    }
    const precision = tp + fp ? tp / (tp + fp) : 0;
    const recall = tp + fn ? tp / (tp + fn) : 0;
    const far = fp / (fp + tn) || 0;
    const frr = fn / (tp + fn) || 0;
		const eer = Math.abs(far - frr);

		// attr: FAR computed exclusively over attractor-zone impostor pairs
    const attractorImpostors = scoredPairs.filter(p => !p.sameDevice && p.isAttractor === true);
    const attr = attractorImpostors.length > 0
      ? attractorImpostors.filter(p => p.score >= t).length / attractorImpostors.length
      : 0;

		return { threshold: t, precision, recall, f1: 2 * precision * recall / (precision + recall) || 0, far, frr, eer, attr };
  });
}