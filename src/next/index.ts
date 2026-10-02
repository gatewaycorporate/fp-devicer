import type { ModelArtifactManifest } from './model-adapters.js';

export * from './node-model-runtime.js';

export type CalibrationStatus =
  | "uncalibrated"
  | "supported"
  | "insufficient_data"
  | "stale"
  | "unsupported_configuration";

export type MatchDecision = "match" | "non_match" | "insufficient_evidence";

export interface Observation<TFeatures extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  domain: string;
  schemaVersion: string;
  observedAt: string;
  extractorVersions: Record<string, string>;
  features: TFeatures;
  quality?: Record<string, number>;
  missingness?: Record<string, string>;
  provenance?: Record<string, string>;
}

export interface Relationship {
  id: string;
  direction: "directed" | "undirected";
  description: string;
}

export interface Evidence {
  relation: string;
  leftObservationId: string;
  rightObservationId: string;
  comparatorVersion: string;
  similarity: number;
  available: boolean;
  quality?: number;
  dependencyGroup?: string;
  explanation?: string;
}

export interface Configuration {
  schemaVersion: string;
  domain: string;
  extractors: Record<string, string>;
  comparators: Record<string, string>;
  fusion: string;
  normalization: string;
  runtime: string;
  model?: ModelArtifactManifest;
  digest: string;
}

export interface ComparisonResult {
  evidence: Evidence[];
  similarity: number | null;
  status: CalibrationStatus;
  configuration: Configuration;
}

export interface MatchResult {
  candidateObservationId?: string;
  similarity: number | null;
  decision: MatchDecision;
  calibrationStatus: CalibrationStatus;
  reasonCodes: string[];
  evidence: Evidence[];
  configuration: Configuration;
}

export interface FingerprintAdapter<TInput, TFeatures extends Record<string, unknown>> {
  readonly domain: string;
  readonly schemaVersion: string;
  readonly extractorVersions: Record<string, string>;
  readonly relationships: readonly Relationship[];
  readonly configuration: Omit<Configuration, "digest">;
  createObservation(input: TInput, context?: { observedAt?: Date; id?: string; signal?: AbortSignal }): Promise<Observation<TFeatures>> | Observation<TFeatures>;
  compare(left: Observation<TFeatures>, right: Observation<TFeatures>, relation: Relationship): Evidence[];
}

export interface MatchOptions {
  relation: string;
  minimumSimilarity: number;
  calibrationStatus?: CalibrationStatus;
}

export class InstanceRegistry {
  private readonly adapters = new Map<string, FingerprintAdapter<unknown, Record<string, unknown>>>();

  register<TInput, TFeatures extends Record<string, unknown>>(
    adapter: FingerprintAdapter<TInput, TFeatures>,
  ): () => void {
    if (this.adapters.has(adapter.domain)) throw new Error(`Adapter already registered: ${adapter.domain}`);
    this.adapters.set(adapter.domain, adapter as FingerprintAdapter<unknown, Record<string, unknown>>);
    return () => {
      if (this.adapters.get(adapter.domain) === adapter) this.adapters.delete(adapter.domain);
    };
  }

  get<TInput, TFeatures extends Record<string, unknown>>(domain: string): FingerprintAdapter<TInput, TFeatures> | undefined {
    return this.adapters.get(domain) as FingerprintAdapter<TInput, TFeatures> | undefined;
  }

  domains(): string[] {
    return [...this.adapters.keys()].sort();
  }
}

export async function createExactContentId(
  domain: string,
  schemaVersion: string,
  features: Record<string, unknown>,
): Promise<string> {
  const bytes = new TextEncoder().encode(stableJson({ domain, schemaVersion, features }));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return `obs_${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function createBrowserAdapter(): FingerprintAdapter<Record<string, unknown>, Record<string, unknown>> {
  return createValueAdapter("browser", "browser.v1", "same-installation", (left, right) => {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    const comparable = [...keys].filter(key => left[key] !== undefined && right[key] !== undefined);
    if (comparable.length === 0) return 0;
    return comparable.filter(key => stableJson(left[key]) === stableJson(right[key])).length / comparable.length;
  });
}

export function createDocumentAdapter(): FingerprintAdapter<{ text: string }, { text: string }> {
  return createValueAdapter("document", "document.v1", "exact-content", (left, right) => left.text === right.text ? 1 : 0) as FingerprintAdapter<{ text: string }, { text: string }>;
}

function createValueAdapter<TInput extends Record<string, unknown>, TFeatures extends Record<string, unknown>>(
  domain: string,
  schemaVersion: string,
  relationshipId: string,
  similarity: (left: TFeatures, right: TFeatures) => number,
): FingerprintAdapter<TInput, TFeatures> {
  const adapter: FingerprintAdapter<TInput, TFeatures> = {
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
      const features = input as unknown as TFeatures;
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

export async function createFingerprint<TInput, TFeatures extends Record<string, unknown>>(
  adapter: FingerprintAdapter<TInput, TFeatures>,
  input: TInput,
  context?: { observedAt?: Date; id?: string; signal?: AbortSignal },
): Promise<Observation<TFeatures>> {
  return adapter.createObservation(input, context);
}

export async function compareFingerprints<TInput, TFeatures extends Record<string, unknown>>(
  adapter: FingerprintAdapter<TInput, TFeatures>,
  left: Observation<TFeatures>,
  right: Observation<TFeatures>,
  relation = adapter.relationships[0]?.id,
): Promise<ComparisonResult> {
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

export async function matchFingerprint<TInput, TFeatures extends Record<string, unknown>>(
  adapter: FingerprintAdapter<TInput, TFeatures>,
  incoming: Observation<TFeatures>,
  candidates: readonly Observation<TFeatures>[],
  options: MatchOptions,
): Promise<MatchResult> {
  const comparisons = await Promise.all(candidates.map(candidate => compareFingerprints(adapter, incoming, candidate, options.relation)));
  const supported = comparisons
    .map((comparison, index) => ({ comparison, candidate: candidates[index] }))
    .filter(item => item.comparison.similarity !== null && item.comparison.status !== "unsupported_configuration")
    .sort((left, right) => right.comparison.similarity! - left.comparison.similarity!);
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
  const similarity = best.comparison.similarity!;
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

export function updateFingerprintHistory<TFeatures extends Record<string, unknown>>(
  history: readonly Observation<TFeatures>[],
  observation: Observation<TFeatures>,
): Observation<TFeatures>[] {
  return [...history, observation].sort((left, right) => left.observedAt.localeCompare(right.observedAt));
}

async function withDigest(configuration: Omit<Configuration, "digest">): Promise<Configuration> {
  const canonical = stableJson(configuration);
  const bytes = new TextEncoder().encode(canonical);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return { ...configuration, digest: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("") };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
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
