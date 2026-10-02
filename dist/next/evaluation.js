export function validateEvaluationManifest(manifest) {
    if (!manifest.id.trim())
        throw new Error('Evaluation manifest ID is required');
    if (!manifest.domain.trim() || !manifest.task.trim())
        throw new Error('Evaluation domain and task are required');
    if (!manifest.sourceDigest.trim() || !manifest.labelDigest.trim())
        throw new Error('Evaluation source and label digests are required');
    if (!manifest.preprocessing.trim() || !manifest.modelConfigurationDigest.trim())
        throw new Error('Evaluation preprocessing and configuration are required');
    if (new Set(manifest.observationIds).size !== manifest.observationIds.length)
        throw new Error('Evaluation observation IDs must be unique');
    for (const observationId of manifest.observationIds) {
        if (!manifest.groups[observationId]?.trim())
            throw new Error(`Evaluation group is missing: ${observationId}`);
    }
}
export function validateDisjointEvaluationSplits(left, right) {
    validateEvaluationManifest(left);
    validateEvaluationManifest(right);
    const rightObservations = new Set(right.observationIds);
    const leftGroups = new Set(left.observationIds.map(id => left.groups[id]));
    const rightGroups = new Set(right.observationIds.map(id => right.groups[id]));
    const sharedObservationIds = left.observationIds.filter(id => rightObservations.has(id)).sort();
    const sharedGroups = [...leftGroups].filter(group => rightGroups.has(group)).sort();
    const reasons = [];
    if (left.domain !== right.domain)
        reasons.push('domain_mismatch');
    if (left.task !== right.task)
        reasons.push('task_mismatch');
    if (left.modelConfigurationDigest !== right.modelConfigurationDigest)
        reasons.push('configuration_mismatch');
    if (sharedObservationIds.length > 0)
        reasons.push('observation_overlap');
    if (sharedGroups.length > 0)
        reasons.push('group_overlap');
    return {
        valid: reasons.length === 0,
        sharedObservationIds,
        sharedGroups,
        reasons,
    };
}
export function assertDisjointEvaluationSplits(left, right) {
    const report = validateDisjointEvaluationSplits(left, right);
    if (!report.valid)
        throw new Error(`Evaluation splits are not disjoint: ${report.reasons.join(', ')}`);
}
