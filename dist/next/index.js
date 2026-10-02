export * from './node-model-runtime.js';
export class InstanceRegistry {
    adapters = new Map();
    register(adapter) {
        if (this.adapters.has(adapter.domain))
            throw new Error(`Adapter already registered: ${adapter.domain}`);
        this.adapters.set(adapter.domain, adapter);
        return () => {
            if (this.adapters.get(adapter.domain) === adapter)
                this.adapters.delete(adapter.domain);
        };
    }
    get(domain) {
        return this.adapters.get(domain);
    }
    domains() {
        return [...this.adapters.keys()].sort();
    }
}
export async function createExactContentId(domain, schemaVersion, features) {
    const bytes = new TextEncoder().encode(stableJson({ domain, schemaVersion, features }));
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return `obs_${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")}`;
}
export function createBrowserAdapter() {
    return createValueAdapter("browser", "browser.v1", "same-installation", (left, right) => {
        const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
        const comparable = [...keys].filter(key => left[key] !== undefined && right[key] !== undefined);
        if (comparable.length === 0)
            return 0;
        return comparable.filter(key => stableJson(left[key]) === stableJson(right[key])).length / comparable.length;
    });
}
export function createDocumentAdapter() {
    return createValueAdapter("document", "document.v1", "exact-content", (left, right) => left.text === right.text ? 1 : 0);
}
function createValueAdapter(domain, schemaVersion, relationshipId, similarity) {
    const adapter = {
        domain,
        schemaVersion,
        extractorVersions: { [`${domain}-extractor`]: "1" },
        relationships: [{ id: relationshipId, direction: "undirected", description: relationshipId }],
        configuration: {
            schemaVersion, domain,
            extractors: { [`${domain}-extractor`]: "1" },
            comparators: { [`${domain}-comparator`]: "1" },
            fusion: "mean.v1", normalization: "unit", runtime: "next.v1",
        },
        createObservation(input, context) {
            const features = input;
            return {
                id: context?.id ?? `${domain}-${stableJson(features)}`,
                domain, schemaVersion,
                observedAt: (context?.observedAt ?? new Date()).toISOString(),
                extractorVersions: { [`${domain}-extractor`]: "1" }, features,
            };
        },
        compare(left, right, relation) {
            return [{
                    relation: relation.id,
                    leftObservationId: left.id,
                    rightObservationId: right.id,
                    comparatorVersion: `${domain}-comparator.v1`,
                    similarity: similarity(left.features, right.features),
                    available: true,
                    dependencyGroup: domain,
                }];
        },
    };
    return adapter;
}
export async function createFingerprint(adapter, input, context) {
    return adapter.createObservation(input, context);
}
export async function compareFingerprints(adapter, left, right, relation = adapter.relationships[0]?.id) {
    const selected = adapter.relationships.find(item => item.id === relation);
    const configuration = await withDigest(adapter.configuration);
    if (!selected || left.domain !== adapter.domain || right.domain !== adapter.domain) {
        return { evidence: [], similarity: null, status: "unsupported_configuration", configuration };
    }
    const evidence = adapter.compare(left, right, selected);
    const available = evidence.filter(item => item.available && Number.isFinite(item.similarity));
    if (available.length === 0) {
        return { evidence, similarity: null, status: "insufficient_data", configuration };
    }
    const similarity = available.reduce((sum, item) => sum + Math.max(0, Math.min(1, item.similarity)), 0) / available.length;
    return { evidence, similarity, status: "uncalibrated", configuration };
}
export async function matchFingerprint(adapter, incoming, candidates, options) {
    const comparisons = await Promise.all(candidates.map(candidate => compareFingerprints(adapter, incoming, candidate, options.relation)));
    const supported = comparisons
        .map((comparison, index) => ({ comparison, candidate: candidates[index] }))
        .filter(item => item.comparison.similarity !== null && item.comparison.status !== "unsupported_configuration")
        .sort((left, right) => right.comparison.similarity - left.comparison.similarity);
    const best = supported[0];
    const status = options.calibrationStatus ?? "uncalibrated";
    if (!best) {
        return {
            similarity: null,
            decision: "insufficient_evidence",
            calibrationStatus: "insufficient_data",
            reasonCodes: ["no_comparable_evidence"],
            evidence: [],
            configuration: await withDigest(adapter.configuration),
        };
    }
    const similarity = best.comparison.similarity;
    return {
        candidateObservationId: best.candidate.id,
        similarity,
        decision: similarity >= options.minimumSimilarity ? "match" : "non_match",
        calibrationStatus: status,
        reasonCodes: similarity >= options.minimumSimilarity ? ["similarity_threshold_met"] : ["similarity_threshold_not_met"],
        evidence: best.comparison.evidence,
        configuration: best.comparison.configuration,
    };
}
export function updateFingerprintHistory(history, observation) {
    return [...history, observation].sort((left, right) => left.observedAt.localeCompare(right.observedAt));
}
async function withDigest(configuration) {
    const canonical = stableJson(configuration);
    const bytes = new TextEncoder().encode(canonical);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return { ...configuration, digest: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("") };
}
function stableJson(value) {
    if (Array.isArray(value))
        return `[${value.map(stableJson).join(",")}]`;
    if (value && typeof value === "object") {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
}
export * from './calibration.js';
export * from './adaptation.js';
export * from './domain-adapters.js';
export * from './retrieval.js';
export * from './artifacts.js';
export * from './storage.js';
export * from './model-adapters.js';
export * from './evaluation.js';
export * from './governance.js';
export * from './benchmark.js';
