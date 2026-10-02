export function createCalibrationArtifact(samples, options) {
    if (samples.length === 0)
        throw new Error("Calibration requires at least one labeled sample");
    const configurationDigest = requireSingleConfiguration(samples);
    const alpha = options.alpha ?? 0.1;
    const binCount = options.bins ?? 10;
    if (!(alpha > 0 && alpha < 1))
        throw new Error("alpha must be between 0 and 1");
    if (!Number.isInteger(binCount) || binCount < 1)
        throw new Error("bins must be a positive integer");
    if (options.manifest.split !== "calibration")
        throw new Error("Calibration data must use the calibration split");
    if (new Set(samples.map(sample => sample.pairId)).size !== samples.length)
        throw new Error("Calibration pair IDs must be unique");
    const valid = samples.filter(sample => sample.comparison.similarity !== null && Number.isFinite(sample.comparison.similarity));
    if (valid.length === 0)
        throw new Error("Calibration requires comparable labeled samples");
    const bins = Array.from({ length: binCount }, (_, index) => {
        const lower = index / binCount;
        const upper = index === binCount - 1 ? 1 : (index + 1) / binCount;
        const inBin = valid.filter(sample => {
            const score = sample.comparison.similarity;
            return score >= lower && (index === binCount - 1 ? score <= upper : score < upper);
        });
        const positives = inBin.filter(sample => sample.label.label === 1).length;
        return {
            lower, upper, count: inBin.length, positives,
            probability: inBin.length === 0 ? 0.5 : (positives + 1) / (inBin.length + 2),
        };
    });
    const nonconformity = valid.map(sample => {
        const probability = probabilityForScore(bins, sample.comparison.similarity);
        return sample.label.label === 1 ? 1 - probability : probability;
    }).sort((left, right) => left - right);
    const rank = Math.min(nonconformity.length - 1, Math.ceil((nonconformity.length + 1) * (1 - alpha)) - 1);
    const counts = {
        total: valid.length,
        positives: valid.filter(sample => sample.label.label === 1).length,
        negatives: valid.filter(sample => sample.label.label === 0).length,
    };
    const maskSet = new Set(valid.flatMap(sample => evidenceMask(sample.comparison.evidence)));
    return {
        id: options.artifactId,
        method: "empirical-bin.v1",
        configurationDigest,
        data: options.manifest,
        supportedMasks: [...maskSet].sort(),
        createdAt: (options.createdAt ?? new Date()).toISOString(),
        ...(options.expiresAt ? { expiresAt: options.expiresAt.toISOString() } : {}),
        counts,
        bins,
        conformal: { alpha, quantile: nonconformity[rank] },
    };
}
export function evaluateCalibration(samples, artifact, manifest, now = new Date()) {
    if (manifest.split !== "held_out")
        throw new Error("Evaluation data must use the held_out split");
    if (manifest.id === artifact.data.id)
        throw new Error("Held-out evaluation manifest must differ from calibration manifest");
    if (samples.length === 0) {
        return { total: 0, supported: 0, unsupported: 0, brierScore: null, logLoss: null, coverage: null, meanPredictionSetSize: null };
    }
    const predictions = samples.map(sample => ({ sample, prediction: calibrateComparison(sample.comparison, artifact, now) }));
    const supported = predictions.filter(item => item.prediction.status === "supported");
    if (supported.length === 0) {
        return { total: samples.length, supported: 0, unsupported: samples.length, brierScore: null, logLoss: null, coverage: null, meanPredictionSetSize: null };
    }
    const brierScore = supported.reduce((sum, item) => sum + (item.prediction.probability - item.sample.label.label) ** 2, 0) / supported.length;
    const logLoss = supported.reduce((sum, item) => {
        const probability = Math.max(1e-15, Math.min(1 - 1e-15, item.prediction.probability));
        return sum - (item.sample.label.label === 1 ? Math.log(probability) : Math.log(1 - probability));
    }, 0) / supported.length;
    const covered = supported.filter(item => item.prediction.predictionSet.includes(item.sample.label.label)).length;
    const meanPredictionSetSize = supported.reduce((sum, item) => sum + item.prediction.predictionSet.length, 0) / supported.length;
    return {
        total: samples.length,
        supported: supported.length,
        unsupported: samples.length - supported.length,
        brierScore, logLoss,
        coverage: covered / supported.length,
        meanPredictionSetSize,
    };
}
export function evaluateCalibrationByMask(samples, artifact, manifest, now = new Date()) {
    const masks = [...new Set(samples.map(sample => evidenceMask(sample.comparison.evidence)))].sort();
    return masks.map(mask => ({
        mask,
        evaluation: evaluateCalibration(samples.filter(sample => evidenceMask(sample.comparison.evidence) === mask), artifact, manifest, now),
    }));
}
export function calibrateComparison(comparison, artifact, now = new Date()) {
    if (comparison.configuration.digest !== artifact.configurationDigest) {
        return unsupported(["configuration_not_supported"]);
    }
    if (artifact.expiresAt && now > new Date(artifact.expiresAt)) {
        return unsupported(["calibration_artifact_stale"], "stale");
    }
    if (comparison.similarity === null || !Number.isFinite(comparison.similarity)) {
        return unsupported(["no_comparable_evidence"], "insufficient_data");
    }
    const mask = evidenceMask(comparison.evidence);
    if (!artifact.supportedMasks.includes(mask))
        return unsupported(["evidence_mask_not_supported"], "unsupported_configuration");
    const probability = probabilityForScore(artifact.bins, comparison.similarity);
    const predictionSet = [0, 1].filter(label => {
        const nonconformity = label === 1 ? 1 - probability : probability;
        return nonconformity <= artifact.conformal.quantile;
    });
    return {
        probability,
        predictionSet,
        status: "supported",
        reasonCodes: predictionSet.length === 1 ? ["calibrated"] : ["calibrated_ambiguous"],
        artifactId: artifact.id,
    };
}
function requireSingleConfiguration(samples) {
    const digests = new Set(samples.map(sample => sample.comparison.configuration.digest));
    if (digests.size !== 1)
        throw new Error("Calibration samples must share one configuration digest");
    return [...digests][0];
}
function probabilityForScore(bins, score) {
    const bounded = Math.max(0, Math.min(1, score));
    return bins.find((bin, index) => bounded >= bin.lower && (index === bins.length - 1 ? bounded <= bin.upper : bounded < bin.upper))?.probability ?? 0.5;
}
function evidenceMask(evidence) {
    return evidence.filter(item => item.available).map(item => item.dependencyGroup ?? item.relation).sort().join(",") || "none";
}
function unsupported(reasonCodes, status = "unsupported_configuration") {
    return { probability: null, predictionSet: [], status, reasonCodes };
}
