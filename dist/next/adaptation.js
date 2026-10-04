export function assessCalibrationReuse(artifact, transition) {
    if (transition.fromDigest !== artifact.configurationDigest) {
        return { reusable: false, status: "requires_new_labels", reasonCodes: ["source_artifact_configuration_mismatch"] };
    }
    if (transition.fromDigest !== transition.toDigest) {
        return {
            reusable: false,
            status: "requires_new_labels",
            reasonCodes: ["configuration_digest_changed", `${transition.change}_change_requires_validation`],
        };
    }
    return { reusable: true, status: "compatible", reasonCodes: ["configuration_unchanged"] };
}
export function allocateCalibrationLabels(candidates, options) {
    if (!(options.auditRate >= 0 && options.auditRate <= 1))
        throw new Error("auditRate must be between 0 and 1");
    if (!Number.isInteger(options.uncertaintyLimit) || options.uncertaintyLimit < 0)
        throw new Error("uncertaintyLimit must be a non-negative integer");
    const requests = [];
    const uncertain = candidates
        .filter(candidate => candidate.prediction.status === "supported" && candidate.prediction.predictionSet.length !== 1)
        .slice(0, options.uncertaintyLimit);
    const uncertaintyIds = new Set(uncertain.map(candidate => candidate.sample.pairId));
    for (const candidate of uncertain) {
        requests.push({
            pairId: candidate.sample.pairId,
            reason: "uncertainty_review",
            inclusionProbability: 1,
            predictedSet: candidate.prediction.predictionSet,
        });
    }
    const randomValues = options.randomValues ?? [];
    let randomIndex = 0;
    for (const candidate of candidates) {
        if (uncertaintyIds.has(candidate.sample.pairId))
            continue;
        const randomValue = randomValues[randomIndex++] ?? 0;
        if (randomValue < options.auditRate) {
            requests.push({
                pairId: candidate.sample.pairId,
                reason: "random_audit",
                inclusionProbability: options.auditRate,
                predictedSet: candidate.prediction.predictionSet,
            });
        }
    }
    return {
        requests,
        uncertaintyCount: uncertain.length,
        auditCount: requests.filter(request => request.reason === "random_audit").length,
        auditRate: options.auditRate,
    };
}
