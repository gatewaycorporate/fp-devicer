import { createExactContentId } from './index.js';
export class ExactRetrievalIndex {
    domain;
    schemaVersion;
    indexVersion;
    entries = new Map();
    constructor(domain, schemaVersion, indexVersion = "exact.v1") {
        this.domain = domain;
        this.schemaVersion = schemaVersion;
        this.indexVersion = indexVersion;
    }
    async add(observation) {
        this.assertObservation(observation);
        const contentId = await createExactContentId(this.domain, this.schemaVersion, observation.features);
        this.entries.set(observation.id, { contentId, observation });
        return contentId;
    }
    remove(observationId) {
        return this.entries.delete(observationId);
    }
    clear() {
        this.entries.clear();
    }
    async rebuild(observations) {
        this.clear();
        for (const observation of observations)
            await this.add(observation);
        return this.manifest();
    }
    async findExact(features, limit = Number.MAX_SAFE_INTEGER) {
        assertPageLimit(limit);
        const contentId = await createExactContentId(this.domain, this.schemaVersion, features);
        return [...this.entries.values()]
            .filter(entry => entry.contentId === contentId)
            .sort((left, right) => left.observation.id.localeCompare(right.observation.id))
            .slice(0, limit);
    }
    all() {
        return [...this.entries.values()].sort((left, right) => left.observation.id.localeCompare(right.observation.id));
    }
    page(offset, limit) {
        if (!Number.isInteger(offset) || offset < 0)
            throw new Error("Retrieval page offset must be a non-negative integer");
        assertPageLimit(limit);
        return this.all().slice(offset, offset + limit);
    }
    manifest() {
        return {
            indexVersion: this.indexVersion,
            domain: this.domain,
            schemaVersion: this.schemaVersion,
            observationCount: this.entries.size,
            contentIds: [...this.entries.values()].map(entry => entry.contentId).sort(),
        };
    }
    snapshot() {
        return {
            indexVersion: this.indexVersion,
            domain: this.domain,
            schemaVersion: this.schemaVersion,
            entries: this.all().map(entry => ({ contentId: entry.contentId, observation: structuredClone(entry.observation) })),
        };
    }
    async restore(snapshot) {
        if (snapshot.indexVersion !== this.indexVersion || snapshot.domain !== this.domain || snapshot.schemaVersion !== this.schemaVersion) {
            throw new Error("Retrieval snapshot is outside the index scope");
        }
        const restored = new Map();
        for (const entry of snapshot.entries) {
            this.assertObservation(entry.observation);
            const contentId = await createExactContentId(this.domain, this.schemaVersion, entry.observation.features);
            if (contentId !== entry.contentId || restored.has(entry.observation.id))
                throw new Error("Retrieval snapshot integrity check failed");
            restored.set(entry.observation.id, { contentId, observation: structuredClone(entry.observation) });
        }
        this.entries.clear();
        for (const [id, entry] of restored)
            this.entries.set(id, entry);
    }
    assertObservation(observation) {
        if (observation.domain !== this.domain || observation.schemaVersion !== this.schemaVersion) {
            throw new Error("Observation is outside the retrieval index scope");
        }
    }
}
function assertPageLimit(limit) {
    if (!Number.isInteger(limit) || limit < 0)
        throw new Error("Retrieval page limit must be a non-negative integer");
}
export function exhaustiveCandidates(observations) {
    return [...observations].sort((left, right) => left.id.localeCompare(right.id));
}
export async function evaluateExactRecall(index, queries, k) {
    assertPageLimit(k);
    let queriesWithExactMatches = 0;
    let hitsAtK = 0;
    for (const query of queries) {
        const exhaustive = await index.findExact(query);
        if (exhaustive.length === 0)
            continue;
        queriesWithExactMatches += 1;
        if ((await index.findExact(query, k)).length > 0)
            hitsAtK += 1;
    }
    return {
        k, queries: queries.length, queriesWithExactMatches, hitsAtK,
        recallAtK: queriesWithExactMatches === 0 ? null : hitsAtK / queriesWithExactMatches,
    };
}
