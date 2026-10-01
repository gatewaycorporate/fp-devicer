# Devicer 3 / NEXT: compatibility, architecture, and research plan

Status: proposed implementation plan; no Rust implementation or remote repository changes made.

Prepared 2026-09-30 for Samuel Roux. Repository inspected: [gatewaycorporate/fp-devicer](https://github.com/gatewaycorporate/fp-devicer). Baseline: `devicer.js@2.0.3`, commit [`62572742c9a1d920d9f91dbbb7f5dd3c38bd0fb8`](https://github.com/gatewaycorporate/fp-devicer/commit/62572742c9a1d920d9f91dbbb7f5dd3c38bd0fb8), dated 2026-07-13.

## 1. Decision and scope

Build NEXT as a Rust implementation with two explicit behavioral surfaces:

1. **Devicer 2 compatibility:** existing JavaScript/TypeScript applications retain their imports, synchronous scoring, asynchronous manager/storage methods, callbacks, persisted formats, and observable legacy results.
2. **NEXT evidence matching:** typed, domain-neutral observations; explicit relationship semantics; versioned adapters; calibrated uncertainty; selective decisions; and controlled adaptation when evidence sources change.

Both surfaces share implementation where semantics permit. The research scorer must not silently replace the legacy scorer. Rust owns the scoring algorithms and new engine; a small JavaScript/TypeScript facade remains necessary to run existing JavaScript plugins and integrate with the JavaScript runtime. A Rust crate alone cannot be a drop-in npm replacement.

Guiding research question:

> When a matching system gains an extractor, loses evidence, or upgrades a model, can it recover useful, reliable decisions with fewer new labels than full recalibration, without hiding failures in aggregate metrics?

“Everything fingerprinting” means extensible domain support, not one universal embedding, similarity metric, identity definition, or calibration model. Start with browser and document verification, then handwriting and biometric verification. Full collection search and graph identity inference follow verified pair matching.

## 2. Inspection and verification

The inspection covered the package manifest, root export barrel, types, scoring, hashing, registries, manager/plugin orchestration, all four storage adapters, drift, attractor models, graph and LSH implementations, tests, benchmark evaluation, CI, README, and the whitepaper's architecture claims. Generated `dist` and declarations were also examined.

Local checks:

- Node `v24.19.0`; `npm ci --ignore-scripts` completed using the repository lockfile.
- `npm test`: **296 passed, 6 skipped**, across 20 passing files and one skipped file.
- SQLite tests skipped because the native runtime probe failed in this installation; dependency install scripts had been disabled. This is not proof of a SQLite product defect.
- PostgreSQL and Redis adapter tests use mocks. A Redis connection warning appeared during the run. Live database interoperability has not been verified.
- `tsc --noEmit`: passed.
- Downloaded the actual npm `devicer.js@2.0.3` tarball: its `dist` tree matched checked-in `dist` with no differences from recursive comparison. This establishes a useful published compatibility oracle, rather than relying only on repository source.
- npm integrity: `sha512-CKpAy7nOw9s9rXaw3VvxGKEPO0hHIB+sRi9qCYRGLCwvFxQ7GTh1HfqWWukcS0rWozqrVm3ZLwbdYDLeVGknGw==`.
- No accuracy/performance benchmark was rerun; no Rust speedup or empirical research improvement is claimed.

The source checkout remained unchanged. Full source-to-generated-output reproducibility and older 2.x releases remain phase-zero tasks.

### Existing capabilities and implications

| Existing implementation | Finding | NEXT implication |
|---|---|---|
| `src/types/data.ts` | `FPDataSet<T>` already permits record-shaped custom data | Preserve this legacy extension point; introduce a genuinely domain-neutral observation schema alongside it |
| `src/libs/confidence.ts` | Recursive comparison plus TLSH and eight heuristic dimensions; browser field lists and a fixed offset of 15 | Port exactly for compatibility; develop new statistical calibration separately |
| `src/libs/registry.ts`, `default-plugins.ts` | Global mutable path comparators/weights, lazy default initialization | Preserve registry lifecycle in the facade; use explicit instance-scoped registries in NEXT |
| `src/core/DeviceManager.ts` | Candidate retrieval, historical weighting, decision, save, dedup, graph update, then plugin enrichment | Preserve lifecycle/order; separate verification from identity assignment and persistence in NEXT |
| `src/core/PluginRegistrar.ts` | `registerWith(manager)` with optional teardown; ordered sync/async post-processors | Existing JS plugins must continue working; these are not interchangeable with feature-extraction adapters |
| `src/libs/adapters/*` | Memory, SQLite, PostgreSQL, Redis; differing actual persistence and retrieval semantics | Build backend-specific compatibility tests and explicit data migration tools |
| `src/libs/drift.ts` | Browser-field deviation/stability heuristic with categorical flags | Retain legacy outputs; do not describe it as calibrated population-shift inference |
| `src/libs/identity-graph.ts` | In-memory edges from subnet and font overlap; additive weights | Treat association as association, not proof of shared person/device |
| `src/libs/attractor-model.ts` | Heuristic or operator-supplied population frequencies | Reuse the idea of population context; new domains define their own commonness/collision features |
| `src/libs/lsh-index.ts` | Deterministic MinHash over browser sets; manually rebuilt manager index | Preserve old behavior; new retrieval is adapter-driven and incrementally maintained |
| `src/benchmarks/*` | Seeded synthetic scenarios, threshold sweeps, performance harness | Useful regression fixtures; insufficient by themselves for research generalization claims |

### Compatibility-sensitive findings

These require characterization before changes. They are not instructions to silently fix Devicer 2 behavior.

1. **Scoring is not a probability.** `calculateConfidence` returns a rounded heuristic composite, with explicit penalties, ceilings, and an exact-match override. There is no learned probabilistic or conformal calibration in the inspected engine. Earlier discussion of a sigmoid is not a description of this version's final composite.
2. **Generic inputs still encounter browser assumptions.** Evidence richness, missingness, field agreement, stability, entropy, attractor risk, and drift use fixed browser fields. SQL/Redis prefilters and LSH extraction are also browser-specific.
3. **TLSH failure can erase other evidence.** A hash exception is caught by the outer score-breakdown handler, which returns all-zero dimensions. A probe using identical repetitive document text returned zero. NEXT should record unavailable TLSH separately, allowing other valid evidence to contribute.
4. **Canonical serialization is not type-preserving.** For example, `{a:1}` and `{a:"1"}` both produce `{a:1}`. Strings and property names are not unambiguously escaped. Preserve legacy bytes; use a versioned, typed canonical format for NEXT.
5. **Fuzzy hashes are used for deduplication.** Manager cache keys and storage duplicate checks use TLSH. NEXT needs separate exact content identifiers, fuzzy retrieval signatures, observation IDs, and entity IDs.
6. **Behavioral metrics are explicitly removed before comparable scoring/hashing.** They must remain excluded in compatibility mode even if NEXT adds behavioral matching.
7. **The parameter called half-life is an e-folding time.** Actual formula is `exp(-age / parameter)`; at that age it yields approximately 0.367879, not 0.5. Preserve the old formula/name in compatibility; name new decay parameters accurately.
8. **Two Jaccard functions disagree for empty sets.** The root-exported graph helper returns 1 for two empty arrays, while the comparator helper returns 0. Their documentation is not consistently aligned. Do not consolidate them during the compatibility port.
9. **Registry comments and lifecycle differ.** `clearRegistry()` does not reset `defaultsInitialized`; manual initialization writes defaults over matching registrations. Characterize first-call and post-clear behavior in isolated processes.
10. **Threshold boundaries differ.** `DeviceManager` uses strict `score > matchThreshold`; benchmark prediction uses `>=`. Manager defaults are 60/30 for matching/candidate scores, history window 5, and dedup window 5000 ms. Do not normalize boundaries silently.
11. **Storage is not uniform.** SQLite/PostgreSQL tables persist only ID, device ID, fingerprint data, and timestamp; fields such as `userId`, `ip`, metadata, and `matchConfidence` are not retained there. SQL save generates a new snapshot UUID. Memory preserves more fields, returns oldest-to-newest within the retained slice, and has a no-op user-link operation. Redis has separate keys/TTL behavior and user linking. Existing round-trip contract tests cover only memory.
12. **PostgreSQL contains a likely dialect defect.** Its candidate query uses `json_extract`, copied from SQLite. Verify against stock PostgreSQL; mock success does not validate the SQL. Keep a strict legacy reproduction route if observable fault parity is required, and make corrected backend behavior an explicit opt-in until its compatibility impact is settled.
13. **Candidate truncation affects recall.** Memory stops at the requested number of qualifying devices before sorting; SQL can return multiple snapshots for one device; Redis intersects browser indexes and truncates before final scoring. These differences matter to identity decisions.
14. **Manager plugins run after the core decision/save.** They can modify returned fields without revising persisted history. Cached identifies still run request-specific enrichment. Preserve this contract; NEXT plugins must explicitly declare whether they supply evidence or merely enrich output.
15. **The index and graph are process-local.** The manager's LSH is not automatically updated on every save; graph weights accumulate evidence heuristically. Neither is an established probabilistic identity model.
16. **The benchmark's `eer` is mislabeled.** `metrics.ts` computes `abs(FAR - FRR)`, not equal error rate. The benchmark selects its best F1 threshold on the same scored batch. NEXT evaluation must implement an actual EER crossing/interpolation and separate tuning from final evaluation.

## 3. Backward compatibility is a release contract

The initial verified baseline is 2.0.3. Before saying “all Devicer 2 applications,” enumerate published 2.x releases and run their representative consumers. Earlier-version coverage must be demonstrated, not inferred.

| Contract area | Required behavior and test |
|---|---|
| Package/import | Preserve the `devicer.js` root ESM surface and declarations; existing consumer import statements remain unchanged. A separately named fork can be installed through an npm alias. Do not claim CommonJS or browser support merely from the `default` export condition |
| Scoring | Same numeric results, breakdown keys, defaults, clamps, rounding, errors, and special cases for the compatibility corpus |
| JavaScript semantics | Preserve undefined vs null, own-key traversal/order, UTF-16 string behavior, number coercion, Date conversion, identity-sensitive custom callbacks, and observed exceptions |
| Stateful registry | Same lazy seeding, override precedence, mutations after calculator creation, clear/unregister behavior, and module-level scope |
| Plugins | Existing `registerWith`, teardown, callback order, error capture, output merging, arbitrary context, and plugin object identity |
| Manager | Same methods, result shape, strict thresholds, cache behavior, sequential batch ordering, save ordering, ID format, history and graph behavior |
| Storage | Accept existing custom JS `StorageAdapter` implementations; read existing SQLite/PostgreSQL schemas and Redis keys; preserve backend-specific returns and ordering |
| Observability | Preserve logger/metrics interfaces, summary shape, and event ordering; exact elapsed milliseconds are not an equality target |
| Distribution | No new mandatory remote service or end-user Rust compiler; keep legacy inputs and stored hashes usable |

Use exact equality for externally visible integer scores, keys, hashes, decisions, and deterministic order. Floating helpers need exact parity where observable; platform-dependent numerical differences must be examined before claiming parity, especially at decision boundaries. Freeze clock/UUID dependencies in differential tests; otherwise compare UUID format and identity relationships rather than random bytes.

Some arbitrary JS values cannot be losslessly passed through JSON. The compatibility facade must preserve original values for callbacks and use a tagged bridge representation where necessary. Do not claim full compatibility by narrowing `any` inputs to JSON without evidence. A temporary pinned JS oracle/fallback can preserve edge behavior during development, but is not completion of the Rust port; track every fallback and remove algorithmic fallbacks before the full-Rust-core milestone.

Document each legacy quirk as preserved, NEXT-only corrected, or an explicit opt-in repair. An intentional incompatibility prevents an unqualified drop-in claim for that path.

### Complete root surface to freeze

Generate the authoritative manifest from `src/main.ts` and the published `.d.ts` files. At minimum cover:

- Data: `FPUserDataSet`, `FPDataSet`, `FieldStabilityMap`, `ScoreBreakdown`, `AttractorModel`, `MouseBehaviorMetrics`, `KeyboardBehaviorMetrics`, `ScrollBehaviorMetrics`, `SessionTimingMetrics`, `BehavioralMetrics`.
- Hashing: `getHash`, `compareHashes`.
- Scoring: `calculateConfidence`, `createConfidenceCalculator`, `calculateScoreBreakdown`, `computeAdaptiveStabilityWeights`, `computeAttractorRisk`, `computeEntropyContribution`, `computeEvidenceRichness`, `computeFieldAgreement`, `computeMissingBothSides`, `computeMissingOneSide`, `computeStructuralStability`, `computeTemporalDecayFactor`, `DEFAULT_DECAY_HALF_LIFE_MS`, `DEFAULT_WEIGHTS`.
- Registry: `registerComparator`, `registerWeight`, `registerPlugin`, `unregisterComparator`, `unregisterWeight`, `setDefaultWeight`, `clearRegistry`, `initializeDefaultRegistry`.
- Attractors: `DefaultAttractorModel`, `FrequencyTableAttractorModel`, `FrequencyTable`, `createFrequencyTableAttractorModel`.
- Index: `LshIndex`, `LshOptions`, `createLshIndex`, `buildLshIndex`.
- Drift: `DriftReport`, `SuspiciousField`, `DriftPatternFlag`, `DriftAnalysisOptions`, `computeDeviceDrift`.
- Graph: `IdentityEdge`, `RelatedDevice`, `IdentityGraph`, `subnetKey`, `jaccardSimilarity`.
- Storage: `StorageAdapter`, `StoredFingerprint`, `DeviceMatch`, four `create*Adapter` factories, `AdapterFactory`, `AdapterFactoryOptions`.
- Manager/plugins: `DeviceManager`, `DeviceManagerLike`, `IdentifyResult`, `IdentifyContext`, `IdentifyEnrichmentInfo`, `IdentifyPostProcessor`, `IdentifyPostProcessorPayload`, `IdentifyPostProcessorResult`, `PluginRegistrar`, `DeviceManagerPlugin`.
- Observability: `Logger`, `Metrics`, `ObservabilityOptions`, `defaultLogger`, `defaultMetrics`.

Include all public class methods and inferred calculator signatures. `Comparator` and `ComparisonOptions` exist internally but are not explicitly root-exported today; adding them is additive, not restoration of an existing root export. Deep package imports are not exposed by the current export map; characterize consumers before promising them.

## 4. Rust architecture and language bindings

Proposed workspace boundaries (combine crates initially if separate publishing adds overhead):

| Component | Responsibility |
|---|---|
| `devicer-types` | Versioned observations, evidence, relationships, model/configuration identifiers, result schemas |
| `devicer-compat-v2` | Legacy scoring, serialization, TLSH behavior, drift, graph, MinHash semantics |
| `devicer-core` | Instance registry, comparison pipeline, feature validation, evidence fusion, lifecycle |
| `devicer-calibration` | Calibrator artifacts, supported-scope checks, conformal sets, evaluation hooks |
| `devicer-storage` | Persistence traits, pagination, snapshot/history operations, migration boundaries |
| `devicer-index` | Exact reference retrieval, MinHash/LSH, optional vector retrieval later |
| `devicer-adapters` | Browser and document adapters; handwriting and biometric adapters subsequently |
| `devicer-node` | Node-API binding and JS callback bridge |
| `devicer-wasm` | Portable Rust build for supported hosts; no implied SQL/socket support in browsers |
| `devicer-cli` | Import/export, compare, evaluate, calibration lifecycle, compatibility diagnostics |
| `packages/devicer.js` | Legacy facade, TypeScript definitions, package loader, plugin/storage callback integration |

Keep core algorithms independent of Node, databases, network access, and heavy model runtimes. Use feature flags and optional adapters for OCR, image models, embedding inference, and database drivers. Browser collection remains in FP-Snatch; DOM APIs cannot be replaced by a server Rust crate.

### Binding design gates

- Prototype synchronous scoring with synchronous JS comparator callbacks first. No hidden conversion to Promises or user-visible asynchronous initialization.
- Use Node-API/napi-rs as the native binding candidate; respect JS thread affinity. Callbacks used by a synchronous legacy call run on the JS thread. Do not dispatch work to a worker and block that thread waiting for a callback on it.
- Bridge asynchronous custom storage/post-processors through awaited host calls; never hold core locks while invoking user callbacks. Cover reentrancy, unregister during execution, thrown errors, and shutdown.
- Use the same Rust scoring implementation for native and WASM. Confirm synchronous Node loading and callback parity before promising a WASM fallback. If portability is blocked, keep the release in preview rather than quietly reducing the compatibility target.
- Cross-platform release tests must cover the supported Node/runtime and OS/architecture matrix, native binary loading, portable fallback, offline installation behavior, and dependencies actually needed by each adapter. Node 20 is the repository CI baseline; the local check here used Node 24. Do not infer broader runtime support from the README alone.
- Generate modern bindings from schemas, but retain checked legacy TypeScript fixtures; automatic generation must not erase structurally compatible TS types or change inferred signatures.
- Rust-native plugins are traits or registered components, not a stable Rust dynamic-library ABI. Later external plugins may use a versioned process/WASM protocol. No third-party plugin recompilation requirement for existing JS plugins.

## 5. NEXT data and extension contracts

### Explicit relationships

| Adapter | Separate tasks |
|---|---|
| Browser | Same installation; same physical device; related sessions |
| Document | Exact content; equivalent content; shared revision lineage; shared template |
| Handwriting | Same transcription; same writer; signature verification |
| Biometrics | Sample-to-enrolled-identity verification for a named modality/model |

Relationships have identifiers, directionality, and declared semantics. Similarity does not imply authorship. Same physical device does not imply same person. Revision lineage may be directed; a fuzzy similarity threshold is not automatically transitive. Do not merge entities by graph transitive closure without a separately evaluated policy.

### Versioned records

- **Observation:** ID, domain, schema version, observation time, extractor/model versions, source reference, typed features, quality, missingness reasons, and provenance. Preserve raw artifacts externally or by explicit policy, not as mandatory embedded blobs.
- **Evidence:** relation, compared observation IDs, comparator version, raw similarity/distance, units, availability, quality, dependency group, and explanation references.
- **Configuration:** content digest over schema, extractors, comparator settings, fusion artifact, normalization, and compatible runtime conventions. Distinguish this artifact identity from a feature-availability mask.
- **Calibration artifact:** task/population, model/configuration digest, calibration data manifest, label provenance, time interval, sample counts, method, target error/coverage, assumptions, supported masks/groups, and expiry/invalidation rules.
- **Result:** similarities; optional calibrated probability with its own interpretation; prediction set; calibration status; final match/non-match/insufficient-evidence decision; reason codes; evidence and artifact references. Errors and incompatible input are typed outcomes distinct from an ordinary non-match.

Use statuses such as `uncalibrated`, `supported`, `insufficient_data`, `stale`, and `unsupported_configuration`. A drift alarm can mark an artifact suspect; absence of an alarm cannot certify validity.

An extension registers extraction/normalization, comparison, quality/missingness, retrieval features, supported relationships, version rules, and fixtures. The core must not require an edit to add a domain. Implement an out-of-tree adapter in CI to prove this.

Add the previously discussed conceptual APIs to the NEXT namespace: `createFingerprint`, `compareFingerprints`, `matchFingerprint`, and `updateFingerprintHistory`. They complement the old API, not rename it. Verification is available without persistence; identity assignment and action policies are explicit. Default NEXT abstention must not mint a new identity merely because evidence is insufficient.

## 6. Candidate practical method

Working description: **configuration-aware adaptation of calibrated pair matching**. This is a proposed method family, not an established novelty claim.

For a pair, form a feature vector from per-source match scores, quality, availability, source age, commonness, and disagreement. Group evidence by provenance to expose correlated signals. Train a modest fusion model first, such as regularized logistic regression with selected interactions. Compare learned fusion with fixed-weight and likelihood-ratio baselines; do not assume entropy or disagreement weighting automatically improves calibration.

A version change initiates a controlled transition:

1. Identify whether extractor/schema/fusion behavior or only input availability changed.
2. Freeze the old artifact; run the changed configuration in shadow mode.
3. Recompute new evidence on retained labeled observations when raw inputs or sufficient features exist. If they do not, request new labels; never pretend old embeddings are interchangeable with new ones.
4. Train/update fusion on its training split; fit calibration on a separate split. Evaluate proposed reuse/weighting of old calibration evidence only under stated compatibility/shift assumptions.
5. Allocate some labels to uncertain/disagreeing cases and a separately tracked random audit stream. Record sampling probabilities if using weighting. Adaptive review alone does not produce a representative audit.
6. Promote the candidate only after its held-out quality and error criteria pass. Otherwise retain the old supported configuration or abstain. Rollback is artifact selection, not retraining in production.

The experimental contribution is a strategy for deciding what evidence/calibration to reuse and what labels to acquire after configuration changes. Pooling information across configurations is a hypothesis to test, not a guarantee. Sparse groups must visibly fall back or abstain; inventing precise percentages from tiny samples is not useful uncertainty.

### Statistical claims and limits

- Similarity, calibrated probability, conformal coverage, and decision error are different quantities.
- A 95% prediction-set coverage target does not imply 95% correctness for each pair or among accepted matches.
- Marginal coverage can hide failures by community, device class, sensor, mask, and recent time window. Measure these separately.
- Returning every label achieves trivial coverage; report ambiguity/abstention and useful-decision rates alongside it.
- No useful exact conditional guarantee for every input under arbitrary distributions is being promised. State exchangeability, bounded-shift, feedback, or other assumptions for each method.
- No-label arbitrary label/concept change cannot be corrected merely from confidence values. Distinguish covariate, label-prior, conditional/concept, quality, availability, and software-configuration shifts.
- Begin with fixed groups, a bounded set of configuration changes, and available pair labels. Add delayed feedback, adaptive groups, adversarial streams, and sequential error control as separately scoped extensions.
- A narrow theorem could address coverage for a defined configuration group under exchangeability, or an adaptation/error bound under bounded drift. Reproducing an existing theorem is a correctness foundation, not a new contribution.

Do not turn automatic identity assignments into trusted calibration labels. Keep predicted links, externally verified labels, and analyst judgments distinguishable to avoid a self-reinforcing matching loop.

## 7. Evaluation and research acceptance

The library and research study have independent success criteria. Shipping extensibility does not establish statistical novelty; a null research result does not invalidate a useful compatibility port.

### Dataset protocol

Start with browser pair verification and document content/lineage verification. Use controlled identities and known transformations, then independent labeled real data. Include same-template/different-document negatives, similar managed-device negatives, scanner/OCR corruption, feature removal, changed extractors, gradual drift, and abrupt changes. Expand to writer-disjoint handwriting and subject-disjoint enrolled biometric verification after the interface stabilizes.

Separate training, model selection, calibration, and final test data. Split by underlying entity/document family/writer/person, not random pairs that reuse the same entity across sets. Use forward-time evaluation for drift. Keep entire revision families and transformed copies together. Report label disagreement and uncertain ground truth rather than coercing all examples into certain labels.

### Baselines and ablations

- Frozen Devicer 2 browser scoring.
- Fixed-weight fusion; regularized score/quality fusion without adaptation.
- Appropriate probability calibration and static split conformal calibration.
- Rolling/adaptive conformal methods, group/mask-aware methods, and full retraining/recalibration.
- Independent per-configuration calibration versus pooled and proposed transferable calibration.
- Random label acquisition versus the proposed review strategy at equal label budgets.
- Ablate quality, provenance/dependency grouping, disagreement, population features, old-data reuse, and drift-triggered transitions.

Prioritize the strongest task-appropriate baselines after the literature audit; document why a method's assumptions do or do not fit.

### Measurements

| Goal | Required measures |
|---|---|
| Pair discrimination | FAR, FRR, precision/recall, ROC/PR, correctly computed EER |
| Probability quality | Reliability plots, Brier/log loss, stated target population and class prior |
| Set uncertainty | Marginal and supported group/mask/window coverage; set size; empty/multiple-label cases |
| Decision utility | Acceptance/abstention, false merges/splits, error among accepted decisions, cost-sensitive utility |
| Adaptation | Labels to recover, time to recover, worst-window degradation, repeated-change performance |
| Retrieval | Recall@k and end-to-end misses separately from pairwise scoring accuracy |
| Operations | Extraction/scoring/calibration/index/storage latency separately; p50/p95/p99, memory, artifact size, binding overhead |

Use multiple seeds and dataset splits; uncertainty estimates must account for reused entities and temporal dependence. For rare errors, report sample sizes and confidence bounds; zero observed false matches is not a zero population error rate. Choose sample sizes and primary operating points before evaluating the final test set.

Proposed study gate: a reproducible improvement in useful-decision rate or labels-to-recovery at a predeclared error/coverage requirement, against strong baselines on both initial domains, with no hidden subgroup regression. Establish the numerical minimum meaningful improvement after pilot variance estimates and before final testing. Do not choose a favorable operating point after seeing test outcomes.

## 8. Persistence, retrieval, and operational evolution

Keep a `v2` storage mode that reads/writes existing formats without implicit migration. New tables/key namespaces store observations, explicit entity links, evidence, labels, artifacts, and index versions. Preserve IDs and original timestamps during import. Old SQL stores have already discarded some metadata; migration reports missing fields and never manufactures them.

Migration tooling performs inventory, dry-run validation, backup/export, reversible mapping, row/count/digest checks, and rollback. Default to separate NEXT storage for shadow evaluation. Prevent both engines from making competing authoritative identity writes. Add transactional observation/index updates, pagination, idempotency keys, bounded caches, and replayable index rebuilds.

NEXT exact dedup uses typed canonical content bytes plus an exact digest scoped to its domain/configuration as appropriate; exact duplicate content still does not establish shared identity. TLSH and MinHash remain approximate evidence/retrieval tools. Add HNSW only when embedding adapters and measurements justify it. A candidate omitted by retrieval cannot be recovered by a better pair scorer, so maintain an exhaustive evaluation oracle.

Record evidence provenance and revocable typed graph edges, including negative evidence and link review history. Graph/Bayesian identity models are later modules with explicit dependence assumptions, not automatic confidence multipliers. Spoof/consistency detectors supply evidence; anomaly flags alone must not be relabeled proof of malicious intent.

For document and biometric adapters, make retention, deletion, artifact references, and logging redaction explicit technical capabilities. Keep raw sensitive samples out of default logs and example fixtures. Choose datasets/model weights whose permissions allow the intended benchmark and distribution, and preserve upstream attribution and existing repository licensing notices.

## 9. Documentation deliverables

Write specifications before each implementation stage and test their examples in CI.

| Document | Required contents |
|---|---|
| `docs/next/charter.md` | Research question, supported domains, non-goals, success criteria |
| `docs/next/baseline-audit.md` | Pinned commit/npm integrity, inspected surface, verified findings and limitations |
| `docs/compat/v2-contract.md` | Export/type manifest, behavioral fixtures, runtime/package matrix, legacy quirk ledger |
| `docs/next/architecture.md` | Crate boundaries, JS callback lifecycle, feature flags, data flow |
| `docs/next/data-model.md` | Observations, relations, evidence, artifact versions, missingness, schemas |
| `docs/next/adapter-sdk.md` | Minimal external adapter, quality and retrieval contracts, version upgrade guide |
| `docs/next/uncertainty.md` | Similarity/probability/coverage/decision distinctions, assumptions, failure statuses |
| `docs/research/protocol.md` | Questions, datasets, splits, baselines, ablations, primary metrics, claim criteria |
| `docs/research/literature.md` | Prior-art comparison and explicit novelty boundaries |
| `docs/migration/v2-to-next.md` | Zero-code compatibility install, explicit NEXT opt-in, database dry-run and rollback |
| `docs/operations.md` | Artifact rollout, drift monitoring, retention, failure diagnosis, observability |
| `docs/releases.md` | Parity evidence, supported targets, unresolved limitations, reproducible package process |
| Versioned whitepapers | Preserve the Devicer 2 paper; publish NEXT design and later measured research results separately |

ADRs: legacy versus NEXT semantics; native/WASM bridge; JS value encoding; relationship identity; exact versus fuzzy hashes; calibration reuse; persistence migration; plugin lifecycle; evaluation leakage prevention. Explain decisions and alternatives, not just file layout.

Keep historical benchmark claims attached to their actual experiments. Do not carry “99% accurate,” “50×,” “sub-millisecond,” or probabilistic interpretations into NEXT without appropriate reproducible evidence. Correct EER and documentation inconsistencies in the new documentation while retaining historical behavior fixtures.

## 10. Sequenced implementation backlog

Estimates below are planning ranges for one experienced engineer, not commitments. Research and data collection are the least predictable components. Phases may share infrastructure, but their exit gates remain distinct.

| Phase | Implementation and documentation | Exit gate | Rough effort |
|---|---|---|---|
| P0: freeze and specify | Fork from pinned baseline preserving history/notices; archive npm oracle; enumerate earlier 2.x; export/type and behavior manifest; live backend reproduction; charter/ADRs/protocol | Compatibility oracle and explicit unresolved-behavior ledger; source/package relationship recorded | 1–2 weeks |
| P1: bridge feasibility | Rust workspace; synchronous scorer/callback spike; async adapter/plugin bridge; native and portable loader prototypes | Existing sync API and custom JS callbacks run unchanged; no event-loop deadlock or hidden async init | 1–2 weeks |
| P2: legacy algorithm port | Serialization/TLSH, comparators, registries, composite, attractors, decay, drift, graph, LSH; JS semantic edge corpus | Differential tests pass; public hash bytes and integer scores match; documented floating parity resolved | 3–5 weeks |
| P3: full compatibility | Manager lifecycle, plugins, all storage modes, observability, TS consumer fixtures, existing integration examples, migration readers | Old consumers pass against packaged Rust-backed build; live backend results and rollback checks recorded | 3–5 weeks |
| P4: extensible core | Versioned observations/evidence, relationships, instance registry, exact IDs, browser/document adapters, minimal out-of-tree adapter, CLI | New domain requires no core edit; legacy and NEXT operation coexist without cross-contamination | 2–4 weeks |
| P5: calibration foundation | Label/data manifests; probability and conformal baselines; support statuses; independent audit stream; immutable artifacts | Reproducible browser/document evaluation with honest coverage/utility tradeoffs and all baselines | 3–6 weeks |
| P6: new practical method | Configuration-change adaptation, label allocation, evidence reuse; ablations and repeated-change tests | Prespecified research gate passes, or publish a clear negative result and retain best baseline | 6–12+ weeks |
| P7: further domains | Handwriting and enrolled biometric adapters; optional model runtimes; domain-specific evaluation and quality assessments | Writer/subject-disjoint evaluation and adapter conformance; no inherited browser calibration claims | 4–8+ weeks |
| P8: scale and release | Incremental retrieval, optional HNSW, graph persistence, package/runtime matrix, docs/examples, reproducible benchmarks | Release criteria below; package provenance and supported scope published | 2–4 weeks |

P0–P3 deliver a compatibility milestone; P4–P6 deliver the first research platform. Handwriting/biometrics and scale can follow without blocking a correctly scoped preview. Do not advertise full compatibility, all domains, and a new research result as one unverified release claim.

### First concrete implementation tasks

1. Add the charter, baseline audit, compatibility contract, and initial ADRs to a NEXT branch/fork.
2. Check in a manifest of all public functions/types and a reproducible reference runner for the published package.
3. Capture hash/scoring golden fixtures including null/undefined, Unicode, short/low-complexity input, arrays, custom callbacks, registry order, and legacy exceptions.
4. Add unchanged TS consumer examples for `calculateConfidence`, calculators, manager plugins, and custom storage.
5. Add live SQLite/PostgreSQL/Redis fixtures and characterize mismatches before fixing them.
6. Implement the smallest Rust-backed synchronous scoring path and prove callback/loading compatibility.
7. Only then complete the algorithm port and introduce the separate NEXT contracts.

## 11. Release gates

- Frozen Devicer 2 consumer and behavioral suites pass against the built npm package, not only source modules. Earlier 2.x compatibility claims match tested releases.
- Rust implementation is exercised on the supported targets; any remaining algorithmic JS fallback is disclosed and blocks the “complete Rust core” milestone.
- No unexplained changes to legacy scores, hashes, thresholds, callback order, storage formats, or default behavior.
- Native and WASM outputs agree on their supported surface; consumers do not need a Rust compiler for supported installs.
- Each real database backend passes its contract, persistence, and migration/rollback checks; mocks supplement rather than replace them.
- NEXT calibration artifacts declare their supported task/configuration/population; unsupported evidence produces an explicit state rather than misleading certainty.
- Every advertised domain has an evaluated adapter; a plugin interface alone is not a handwriting or biometric implementation.
- Research claims reference frozen data/code/artifact manifests, independent tests, baselines, and uncertainty estimates.
- Documented examples compile/run; operational and migration guides match actual package behavior.

## 12. Connections to the broader portfolio

Devicer supplies pair evidence and uncertainty. QBot4k can consume it for identity inference and relationship analysis while keeping alert-level sequential false-discovery control separate. Its reviewed cases can motivate later selective/delayed-feedback work. Nashtwin can use explicit observation versions, history, and calibration state for system alignment. Neither a graph edge nor a high fingerprint score should silently become an authoritative real-world identity.

The wider open-problem discussion remains relevant: partial graph matching informs later identity recovery; planted dense-subgraph detection informs coordination analytics; sequential detection informs alert reliability. They are later consumers/research modules, not requirements to solve before this practical method ships.

Compared with prior projects, implementing adapters and the Rust core is primarily an engineering challenge. Demonstrating a generalizable improvement requires a stronger evaluation discipline than a working product or a tuned benchmark. A substantial theorem remains optional for this practical-method objective; independent reproducibility and a clearly established empirical advantage are not optional for the research claim.

## 13. Sources and prior-art checkpoints

Repository source links below are pinned to the inspected commit:

- [Package manifest](https://github.com/gatewaycorporate/fp-devicer/blob/62572742c9a1d920d9f91dbbb7f5dd3c38bd0fb8/package.json), [public API](https://github.com/gatewaycorporate/fp-devicer/blob/62572742c9a1d920d9f91dbbb7f5dd3c38bd0fb8/src/main.ts), [published tarball](https://registry.npmjs.org/devicer.js/-/devicer.js-2.0.3.tgz).
- [Scoring](https://github.com/gatewaycorporate/fp-devicer/blob/62572742c9a1d920d9f91dbbb7f5dd3c38bd0fb8/src/libs/confidence.ts), [hashing](https://github.com/gatewaycorporate/fp-devicer/blob/62572742c9a1d920d9f91dbbb7f5dd3c38bd0fb8/src/libs/tlsh.ts), [manager](https://github.com/gatewaycorporate/fp-devicer/blob/62572742c9a1d920d9f91dbbb7f5dd3c38bd0fb8/src/core/DeviceManager.ts).
- [Adapters](https://github.com/gatewaycorporate/fp-devicer/tree/62572742c9a1d920d9f91dbbb7f5dd3c38bd0fb8/src/libs/adapters), [metrics](https://github.com/gatewaycorporate/fp-devicer/blob/62572742c9a1d920d9f91dbbb7f5dd3c38bd0fb8/src/benchmarks/metrics.ts), [accuracy benchmark](https://github.com/gatewaycorporate/fp-devicer/blob/62572742c9a1d920d9f91dbbb7f5dd3c38bd0fb8/src/benchmarks/accuracy.bench.ts).
- [The limits of distribution-free conditional predictive inference](https://arxiv.org/abs/1903.04684): distinguishes achievable marginal inference from unrestricted conditional targets.
- [Conformal Prediction With Conditional Guarantees](https://arxiv.org/abs/2305.12616): group/shift classes already have substantial solutions.
- [Conformal Inference for Online Prediction with Arbitrary Distribution Shifts](https://www.jmlr.org/papers/v25/22-1218.html): adaptive online inference is an existing baseline family.
- [Likelihood ratio-based biometric score fusion](https://pubmed.ncbi.nlm.nih.gov/18084063/): heterogeneous scores, correlation, and quality are established fusion topics.
- [Any2Any: Incomplete Multimodal Retrieval with Conformal Prediction](https://arxiv.org/abs/2411.10513): multimodal retrieval plus conformal methods is prior art, not a novelty claim by itself.
- [Mask-Conditional Conformal Prediction](https://proceedings.mlr.press/v300/fan26a.html): missingness-conditional uncertainty has existing methods with specific assumptions.
- [Conformal Calibration for Multi-Modal Regression with Missing Modalities](https://proceedings.mlr.press/v329/azizi26a.html): disagreement and missing sources are already studied; compare task and assumptions carefully.
- [napi-rs callback/thread guidance](https://napi.rs/docs/concepts/threadsafe-function), [wasm-bindgen naming/binding guidance](https://rustwasm.github.io/docs/wasm-bindgen/reference/attributes/on-rust-exports/js_name.html): implementation candidates whose exact release versions should be pinned during the binding spike.

This is a focused prior-art starting set, not an exhaustive novelty review. Before naming or publishing the proposed method, examine configuration/model replacement, transfer calibration, selective labels, active inference, and cross-domain verification literature in full.
