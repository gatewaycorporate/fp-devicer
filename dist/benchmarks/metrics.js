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
        // attr: FAR computed exclusively over attractor-zone impostor pairs
        const attractorImpostors = scoredPairs.filter(p => !p.sameDevice && p.isAttractor === true);
        const attr = attractorImpostors.length > 0
            ? attractorImpostors.filter(p => p.score >= t).length / attractorImpostors.length
            : 0;
        return { threshold: t, precision, recall, f1: 2 * precision * recall / (precision + recall) || 0, far, frr, eer, attr };
    });
}
export function dbscanMetrics(pairs, eps, minPts) {
    // Simple DBSCAN implementation for clustering scores
    const clusters = [];
    const visited = new Set();
    const noise = [];
    function regionQuery(index) {
        const neighbors = [];
        for (let i = 0; i < pairs.length; i++) {
            if (i !== index && Math.abs(pairs[i].score - pairs[index].score) <= eps) {
                neighbors.push(i);
            }
        }
        return neighbors;
    }
    function expandCluster(index, neighbors, clusterId) {
        clusters[clusterId].push(index);
        for (let i = 0; i < neighbors.length; i++) {
            const nIndex = neighbors[i];
            if (!visited.has(nIndex)) {
                visited.add(nIndex);
                const nNeighbors = regionQuery(nIndex);
                if (nNeighbors.length >= minPts) {
                    neighbors.push(...nNeighbors);
                }
            }
            if (!clusters.some(c => c.includes(nIndex))) {
                clusters[clusterId].push(nIndex);
            }
        }
    }
    for (let i = 0; i < pairs.length; i++) {
        if (!visited.has(i)) {
            visited.add(i);
            const neighbors = regionQuery(i);
            if (neighbors.length >= minPts) {
                clusters.push([]);
                expandCluster(i, neighbors, clusters.length - 1);
            }
            else {
                noise.push(i);
            }
        }
    }
    return { clusters, noise };
}
