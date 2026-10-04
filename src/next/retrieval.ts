import { createExactContentId, type Observation } from './index.js';

export interface RetrievalIndexManifest {
  indexVersion: string;
  domain: string;
  schemaVersion: string;
  observationCount: number;
  contentIds: readonly string[];
}

export interface RetrievalResult<TFeatures extends Record<string, unknown>> {
  contentId: string;
  observation: Observation<TFeatures>;
}

export interface RetrievalSnapshot<TFeatures extends Record<string, unknown>> {
  indexVersion: string;
  domain: string;
  schemaVersion: string;
  entries: readonly RetrievalResult<TFeatures>[];
}

export interface RetrievalRecallReport {
  k: number;
  queries: number;
  queriesWithExactMatches: number;
  hitsAtK: number;
  recallAtK: number | null;
}

export class ExactRetrievalIndex<TFeatures extends Record<string, unknown>> {
  private readonly entries = new Map<string, RetrievalResult<TFeatures>>();

  constructor(
    readonly domain: string,
    readonly schemaVersion: string,
    readonly indexVersion = "exact.v1",
  ) {}

  async add(observation: Observation<TFeatures>): Promise<string> {
    this.assertObservation(observation);
    const contentId = await createExactContentId(this.domain, this.schemaVersion, observation.features);
    this.entries.set(observation.id, { contentId, observation });
    return contentId;
  }

  remove(observationId: string): boolean {
    return this.entries.delete(observationId);
  }

  clear(): void {
    this.entries.clear();
  }

  async rebuild(observations: readonly Observation<TFeatures>[]): Promise<RetrievalIndexManifest> {
    this.clear();
    for (const observation of observations) await this.add(observation);
    return this.manifest();
  }

  async findExact(features: TFeatures, limit = Number.MAX_SAFE_INTEGER): Promise<readonly RetrievalResult<TFeatures>[]> {
    assertPageLimit(limit);
    const contentId = await createExactContentId(this.domain, this.schemaVersion, features);
    return [...this.entries.values()]
      .filter(entry => entry.contentId === contentId)
      .sort((left, right) => left.observation.id.localeCompare(right.observation.id))
      .slice(0, limit);
  }

  all(): readonly RetrievalResult<TFeatures>[] {
    return [...this.entries.values()].sort((left, right) => left.observation.id.localeCompare(right.observation.id));
  }

  page(offset: number, limit: number): readonly RetrievalResult<TFeatures>[] {
    if (!Number.isInteger(offset) || offset < 0) throw new Error("Retrieval page offset must be a non-negative integer");
    assertPageLimit(limit);
    return this.all().slice(offset, offset + limit);
  }

  manifest(): RetrievalIndexManifest {
    return {
      indexVersion: this.indexVersion,
      domain: this.domain,
      schemaVersion: this.schemaVersion,
      observationCount: this.entries.size,
      contentIds: [...this.entries.values()].map(entry => entry.contentId).sort(),
    };
  }

  snapshot(): RetrievalSnapshot<TFeatures> {
    return {
      indexVersion: this.indexVersion,
      domain: this.domain,
      schemaVersion: this.schemaVersion,
      entries: this.all().map(entry => ({ contentId: entry.contentId, observation: structuredClone(entry.observation) })),
    };
  }

  async restore(snapshot: RetrievalSnapshot<TFeatures>): Promise<void> {
    if (snapshot.indexVersion !== this.indexVersion || snapshot.domain !== this.domain || snapshot.schemaVersion !== this.schemaVersion) {
      throw new Error("Retrieval snapshot is outside the index scope");
    }
    const restored = new Map<string, RetrievalResult<TFeatures>>();
    for (const entry of snapshot.entries) {
      this.assertObservation(entry.observation);
      const contentId = await createExactContentId(this.domain, this.schemaVersion, entry.observation.features);
      if (contentId !== entry.contentId || restored.has(entry.observation.id)) throw new Error("Retrieval snapshot integrity check failed");
      restored.set(entry.observation.id, { contentId, observation: structuredClone(entry.observation) });
    }
    this.entries.clear();
    for (const [id, entry] of restored) this.entries.set(id, entry);
  }

  private assertObservation(observation: Observation<TFeatures>): void {
    if (observation.domain !== this.domain || observation.schemaVersion !== this.schemaVersion) {
      throw new Error("Observation is outside the retrieval index scope");
    }
  }
}

function assertPageLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 0) throw new Error("Retrieval page limit must be a non-negative integer");
}

export function exhaustiveCandidates<TFeatures extends Record<string, unknown>>(
  observations: readonly Observation<TFeatures>[],
): readonly Observation<TFeatures>[] {
  return [...observations].sort((left, right) => left.id.localeCompare(right.id));
}

export async function evaluateExactRecall<TFeatures extends Record<string, unknown>>(
  index: ExactRetrievalIndex<TFeatures>,
  queries: readonly TFeatures[],
  k: number,
): Promise<RetrievalRecallReport> {
  assertPageLimit(k);
  let queriesWithExactMatches = 0;
  let hitsAtK = 0;
  for (const query of queries) {
    const exhaustive = await index.findExact(query);
    if (exhaustive.length === 0) continue;
    queriesWithExactMatches += 1;
    if ((await index.findExact(query, k)).length > 0) hitsAtK += 1;
  }
  return {
    k, queries: queries.length, queriesWithExactMatches, hitsAtK,
    recallAtK: queriesWithExactMatches === 0 ? null : hitsAtK / queriesWithExactMatches,
  };
}