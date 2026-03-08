export function calculateMetrics(scoredPairs, thresholds = Array.from({ length: 21 }, (_, i) => i * 5)) {
    return thresholds.map(t => {
        let tp = 0, fp = 0, tn = 0, fn = 0;
        for (const p of scoredPairs) {
            const predictedSame = p.score >= t;
            if (p.sameDevice && predictedSame)
                tp++;
            else if (!p.sameDevice && predictedSame)
                fp++;
            else if (!p.sameDevice && !predictedSame)
                tn++;
            else
                fn++;
        }
        const precision = tp + fp ? tp / (tp + fp) : 0;
        const recall = tp + fn ? tp / (tp + fn) : 0;
        const far = fp / (fp + tn) || 0;
        const frr = fn / (tp + fn) || 0;
        const eer = Math.abs(far - frr);
        return { threshold: t, precision, recall, f1: 2 * precision * recall / (precision + recall) || 0, far, frr, eer };
    });
}
