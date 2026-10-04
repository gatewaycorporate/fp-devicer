# Devicer 3.0.0-rc.1 Plan

Status: planning document; the RC is not yet release-qualified.

This plan targets an engineering-only `3.0.0-rc.1`: a packaged, additive NEXT
surface with frozen legacy root behavior and durable operational contracts. The
current P8 implementation is a validated preview, not an RC. The recommended
package strategy is to keep the legacy `.` export frozen and ship NEXT through
`devicer.js/next`.

The RC must advertise only capabilities with reproducible evidence. Browser and
document workflows are the initial advertised domains. Handwriting and enrolled
biometric adapters remain relation-scoped integration fixtures and are not RC
supported domains unless separately evaluated with domain-specific data.

Model-free input contracts for facial, physical fingerprint and signature
adapters are described in the [NEXT domain signal contracts](domain-model-plan.md).
Production model implementations, vendored sources and weights are excluded.
Input-contract support does not promote these domains to evaluated RC support.

## Current NEXT Workflows

These examples describe the preview API as it exists today. They are useful for
local, in-memory workflows and evaluation harnesses; they do not imply durable
database storage, production-scale retrieval, or identity inference.

### Compare browser observations

```ts
import {
  compareFingerprints,
  createBrowserAdapter,
  createFingerprint,
} from "devicer.js/next";

const adapter = createBrowserAdapter();
const first = await createFingerprint(adapter, {
  userAgent: "example-browser",
  language: "en-US",
  timezone: "UTC",
});
const later = await createFingerprint(adapter, {
  userAgent: "example-browser",
  language: "en-US",
  timezone: "UTC",
});
const comparison = await compareFingerprints(adapter, first, later);

if (comparison.status === "uncalibrated") {
  console.log(comparison.similarity, comparison.evidence);
}
```

This can drive a change-detection step, such as requesting another
verification signal. The raw similarity is not a calibrated probability or an
identity assertion.

### Detect exact document duplicates

```ts
import {
  compareFingerprints,
  createDocumentAdapter,
  createExactContentId,
  createFingerprint,
} from "devicer.js/next";

const adapter = createDocumentAdapter();
const observation = await createFingerprint(adapter, {
  text: "approved purchase order",
});
const contentId = await createExactContentId(
  observation.domain,
  observation.schemaVersion,
  observation.features,
);
const comparison = await compareFingerprints(adapter, observation, observation);

console.log({ contentId, isDuplicate: comparison.similarity === 1 });
```

The `obs_...` value is a duplicate/content key, not proof that two documents
came from the same person or organization.

### Find exact candidates with a bounded index

```ts
import {
  ExactRetrievalIndex,
  createDocumentAdapter,
  createFingerprint,
} from "devicer.js/next";

const adapter = createDocumentAdapter();
const index = new ExactRetrievalIndex(adapter.domain, adapter.schemaVersion);
const observation = await createFingerprint(adapter, { text: "invoice-42" });

await index.add(observation);
const candidates = await index.findExact(observation.features, 10);
const page = index.page(0, 25);

console.log({ candidates, page, manifest: index.manifest() });
```

Use `exhaustiveCandidates` and `evaluateExactRecall` in an evaluation harness
to measure retrieval recall separately from pairwise score quality. The current
index is in memory; production persistence is an RC gate, not a preview claim.

### Abstain when evidence is unavailable

```ts
import {
  createBrowserAdapter,
  createFingerprint,
  matchFingerprint,
} from "devicer.js/next";

const adapter = createBrowserAdapter();
const incoming = await createFingerprint(adapter, { language: "en-US" });
const candidates = [
  await createFingerprint(adapter, { language: "en-US" }, { id: "installation-a" }),
  await createFingerprint(adapter, { timezone: "UTC" }, { id: "installation-b" }),
];
const result = await matchFingerprint(adapter, incoming, candidates, {
  relation: "same-installation",
  minimumSimilarity: 0.8,
});

if (result.decision === "insufficient_evidence") {
  console.log("request another signal");
} else {
  console.log(result.decision, result.candidateObservationId, result.similarity);
}
```

The threshold is an application decision until a compatible calibration artifact
is available. Missing evidence must lead to an explicit state, not a new identity.

### Calibrate a comparison before probabilistic use

A labeled calibration split can produce an immutable artifact; a held-out split
then measures calibration and prediction-set behavior.

```ts
import {
  calibrateComparison,
  createCalibrationArtifact,
  evaluateCalibration,
} from "devicer.js/next";

const artifact = createCalibrationArtifact(calibrationSamples, {
  artifactId: "browser-calibration-v1",
  manifest: calibrationManifest,
});
const prediction = calibrateComparison(comparison, artifact);
const evaluation = evaluateCalibration(heldOutSamples, artifact, heldOutManifest);

console.log(prediction.status, prediction.predictionSet, evaluation.brierScore);
```

Applications should treat `stale`, `unsupported_configuration`, and
`insufficient_data` as explicit non-success states. A changed extractor,
comparator, schema, or runtime configuration requires adaptation and relabeling
checks rather than silent artifact reuse.

## RC Phases And Acceptance Gates

### 1. Freeze the RC contract

- Record the supported package surface, Node/OS/architecture/runtime matrix,
  versioning policy, and release vocabulary.
- Treat `devicer.js/next` as additive and opt-in; do not alter legacy root
  semantics.
- Maintain claims and unresolved-behavior ledgers. Every claim maps to a
  reproducible artifact, test command, data manifest, or documented exception.

### 2. Complete P0-P3 compatibility and bridge evidence

- Archive integrity-checked npm packages and representative consumers for every
  earlier 2.x release claimed by the RC. Pin package digests, consumer sources,
  runtime versions, and the oracle runner.
- Run packaged differential suites for exports, declarations, hashes, integer
  scores, thresholds, errors, callback/plugin order, manager lifecycle, storage
  formats, observability order, and legacy quirks.
- Complete P1 lifecycle evidence for native and async bridges: cancellation,
  teardown, shutdown, event-loop safety, reentrancy, callback exceptions and
  identity, unregister-during-execution, ordered host calls, Promise/tagged-value
  behavior, and lock/deadlock safety. Exercise callbacks inside and outside core
  locks.
- Resolve or document observable P2 floating-point and numerical-boundary parity,
  in addition to byte/hash and integer-score parity. Disclose each remaining
  JavaScript fallback; do not call the implementation a complete Rust core
  while one remains in a claimed surface.
- Require real SQLite, PostgreSQL, and Redis executions for P3 persistence,
  reopen, migration, transactionality, rollback, TTL/expiry, failure, and
  cross-package read/write checks. Mocks are supplementary only.

The repository command `npm run next:storage:check` exercises SQLite locally and
accepts live PostgreSQL and Redis URLs through `NEXT_POSTGRES_URL` and
`NEXT_REDIS_URL`. Set `NEXT_REQUIRE_LIVE_STORAGE=1` to make missing live URLs a
failure rather than a documented skip.

For a reproducible container run, start
`docker-compose.next-storage.yml`, wait for both health checks, and run the
acceptance command from a Node container on the Compose network with
`NEXT_POSTGRES_URL=postgres://devicer:devicer_test@postgres:5432/devicer_next`,
`NEXT_REDIS_URL=redis://redis:6379`, and `NEXT_REQUIRE_LIVE_STORAGE=1`.

### 3. Complete Rust and distribution gates

- Complete the production crate/facade boundaries: shared types/core,
  calibration, storage, index, adapters, native binding, WASM/portable loader,
  and CLI/facade as applicable.
- Prove native/WASM parity on the declared supported surface, including actual
  WASM execution rather than only the injected portable-loader contract.
- Run clean-install and offline-install checks. No supported install may require
  a user Rust compiler.
- Publish target support, binary provenance, dependency requirements, fallback
  behavior, and unsupported combinations. Cross-target evidence is required for
  targets claimed by the RC.

### 4. Complete durable NEXT persistence and retrieval

- Persist versioned observations, evidence, relationships, configuration and
  calibration artifacts, labels, provenance, timestamps, statuses, and index
  manifests without inventing missing metadata. Preserve IDs and timestamps on
  import.
- Verify durable reopen, deterministic pagination, idempotent replacement and
  removal, transactional updates, migration dry-runs, digest/count validation,
  backup/export, restore, rollback, and non-competing legacy/NEXT writes across
  real backends.
- Validate versioned retrieval manifests, rebuild/restore replayability, bounded
  lookup, and recall@k against an exhaustive candidate oracle. Report retrieval
  misses separately from pairwise scoring misses.
- Explicitly exclude HNSW, production-scale retrieval claims, persistent
  graph/index storage, and graph identity inference from this RC. They require
  separate measured gates and are not implied by the P8 preview.

### 5. Complete adapter scope and calibration evaluation

- Require browser/document and out-of-tree adapter conformance, with schema,
  extractor, model, configuration, relationship, quality, provenance,
  retention/deletion, and artifact references declared without core edits.
- Keep handwriting/biometric fixtures outside the advertised supported-domain
  matrix. To advertise either domain later, add an evaluated adapter with
  writer/subject-disjoint data and no inherited browser/document calibration
  claims.
- Build a frozen-data, frozen-code, and frozen-artifact evaluation runner.
  Enforce entity/document-family-disjoint splits, independent calibration and
  test data, leakage controls, time/group/mask reporting, and complete label
  provenance.
- Reproduce Brier score, log loss, coverage, prediction-set size, calibration
  status, decision utility, and calibration/conformal baselines. Unsupported or
  stale configurations must return explicit status or abstain.
- Treat P6 as an engineering foundation for the RC. Do not claim empirical
  improvement, novelty, arbitrary-shift guarantees, or domain accuracy without
  the separate research protocol and evidence.

### 6. Complete operations and release promotion

- Test immutable artifact registration, activation history, promotion reason,
  defensive reads, rollback by artifact selection, retention/deletion, redacted
  sensitive logging, bounded caches, failure/retry behavior, and access
  boundaries. Rollback must not rewrite observations or labels.
- Measure extraction, scoring, calibration, retrieval, storage, and binding
  overhead separately, including p50/p95/p99 where available, plus resource
  limits and failure behavior.
- From a clean checkout with locked dependencies, run build, full tests, focused
  NEXT tests, native bridge checks, actual portable/WASM checks, adapter
  conformance, `npm run next:storage:check` with live services, packaged compatibility, `npm pack`, and
  `npm run next:release:check`.
- Verify examples and operational/migration guides against packaged behavior.
  Produce a release manifest containing source commit, artifact digests, target
  matrix, test/evaluation results, known limitations, licenses/attributions,
  and reproducible build instructions.

## Explicit Exclusions

The RC must not claim universal or all-2.x compatibility, a complete Rust-core
replacement, production-scale search, HNSW, persistent graph/index storage,
graph identity inference, cross-target support without execution evidence,
evaluated handwriting/biometric accuracy, empirical research superiority, or
probability/identity guarantees beyond the declared calibration scope.

This document plans the RC and its acceptance evidence. It does not implement
production storage, WASM execution, evaluated domain models, HNSW, or research
experiments; those are follow-on engineering or research work items tracked by
the gates above.