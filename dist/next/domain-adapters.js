const sameWriter = {
    id: "same-writer", direction: "undirected", description: "samples produced by the same writer",
};
const sameTranscription = {
    id: "same-transcription", direction: "undirected", description: "samples carrying the same transcription",
};
const sameEnrolledIdentity = {
    id: "same-enrolled-identity", direction: "undirected", description: "sample verified against one enrolled identity",
};
export function createHandwritingAdapter() {
    return {
        domain: "handwriting",
        schemaVersion: "handwriting.v1",
        extractorVersions: { embedding: "external.v1", transcription: "external.v1" },
        relationships: [sameWriter, sameTranscription],
        configuration: {
            schemaVersion: "handwriting.v1", domain: "handwriting",
            extractors: { embedding: "external.v1", transcription: "external.v1" },
            comparators: { embedding: "cosine.v1", transcription: "exact.v1" },
            fusion: "relation-specific.v1", normalization: "unit", runtime: "next.v1",
        },
        createObservation(input, context) {
            return createObservation("handwriting", "handwriting.v1", input, context, {
                embedding: input.embedding ? 1 : 0, transcription: input.transcription ? 1 : 0,
            });
        },
        compare(left, right, relation) {
            if (relation.id === sameTranscription.id) {
                const available = left.features.transcription !== undefined && right.features.transcription !== undefined;
                return evidence(left, right, relation, available ? (left.features.transcription === right.features.transcription ? 1 : 0) : Number.NaN, available, "transcription");
            }
            const available = Boolean(left.features.embedding && right.features.embedding);
            return evidence(left, right, relation, available ? vectorSimilarity(left.features.embedding, right.features.embedding) : Number.NaN, available, "embedding");
        },
    };
}
export function createEnrolledBiometricAdapter(modality) {
    if (!modality.trim())
        throw new Error("Biometric modality is required");
    return {
        domain: `biometric:${modality}`,
        schemaVersion: "biometric.v1",
        extractorVersions: { template: "external.v1" },
        relationships: [sameEnrolledIdentity],
        configuration: {
            schemaVersion: "biometric.v1", domain: `biometric:${modality}`,
            extractors: { template: "external.v1" },
            comparators: { template: "cosine.v1" },
            fusion: "single-source.v1", normalization: "unit", runtime: "next.v1",
        },
        createObservation(input, context) {
            return createObservation(`biometric:${modality}`, "biometric.v1", input, context, {
                template: input.template ? 1 : 0,
            });
        },
        compare(left, right, relation) {
            const available = left.features.modality === modality && right.features.modality === modality
                && Boolean(left.features.template && right.features.template);
            return evidence(left, right, relation, available ? vectorSimilarity(left.features.template, right.features.template) : Number.NaN, available, "template");
        },
    };
}
function createObservation(domain, schemaVersion, features, context, quality) {
    return {
        id: context?.id ?? `${domain}-${JSON.stringify(features)}`,
        domain, schemaVersion,
        observedAt: (context?.observedAt ?? new Date()).toISOString(),
        extractorVersions: { [`${domain}-extractor`]: "external.v1" },
        features, quality,
        missingness: Object.fromEntries(Object.entries(quality).filter(([, value]) => value === 0).map(([key]) => [key, "not_provided"])),
    };
}
function evidence(left, right, relation, similarity, available, dependencyGroup) {
    return [{
            relation: relation.id, leftObservationId: left.id, rightObservationId: right.id,
            comparatorVersion: `${dependencyGroup}.v1`, similarity, available, dependencyGroup,
        }];
}
function vectorSimilarity(left, right) {
    if (left.length === 0 || left.length !== right.length)
        return Number.NaN;
    let dot = 0;
    let leftMagnitude = 0;
    let rightMagnitude = 0;
    for (let index = 0; index < left.length; index += 1) {
        dot += left[index] * right[index];
        leftMagnitude += left[index] ** 2;
        rightMagnitude += right[index] ** 2;
    }
    if (leftMagnitude === 0 || rightMagnitude === 0)
        return Number.NaN;
    return Math.max(0, Math.min(1, (dot / Math.sqrt(leftMagnitude * rightMagnitude) + 1) / 2));
}
