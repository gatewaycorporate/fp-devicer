# NEXT Charter

Status: P8 preview release surface passes locally on top of the verified
P2/P3/P4/P5/P6/P7 gates; production scale and cross-target release gates remain
open, 2026-09-30.
The [manifesto](../../next-manifesto.md)
is the implementation plan, not a statement of shipped capabilities.
The [3.0.0-rc.1 plan](rc-plan.md) turns the remaining gates into an acceptance
checklist and records the workflows currently supported by the preview.

## Purpose

Build a Rust-owned matching engine with two explicitly separate surfaces:

- Devicer 2 compatibility preserves existing imports, synchronous scores,
  asynchronous managers/storage, JavaScript plugins, and persisted formats.
- NEXT introduces domain-neutral, versioned observations and evidence,
  explicit relationships, supported calibration states, and selective decisions.

The research question is whether useful, reliable decisions can recover after
extractor changes or evidence loss with fewer labels than full recalibration,
without hiding failures in aggregate metrics.

Browser and document pair verification are the first planned domains. Writer
verification and enrolled biometric verification follow separately evaluated
adapters. None of these NEXT adapters is implemented by this P0 increment.

## Boundaries

A similarity is not a probability, identity proof, or transitive relationship.
NEXT abstention must not silently create an identity. Existing JS plugins remain
host callbacks; a Rust-only package cannot replace their runtime. Legacy scoring
must not silently gain NEXT behavior or fixes.

Initial non-goals: universal embeddings, graph identity inference, collection
search at scale, automatic trusted labels, unconditional coverage guarantees,
and accuracy or speedup claims without independent measurements.

## Current Increment

Implemented locally:

- Integrity-checked published 2.0.3 oracle, cached separately from candidates.
- Frozen root runtime exports and public TypeScript declarations, including
  class methods, calculator signatures, generic bounds, and index signatures.
- Isolated hash, scoring, callback, registry, and helper characterization groups.
- A root-import consumer compiled and executed against oracle and candidate.
- A clean staged build, npm packing, and artifact-level compatibility command.
- Live SQLite, PostgreSQL and Redis oracle/candidate fixtures, including
  process reopen, bidirectional legacy reads and documented PostgreSQL failures.
- Packaged consumer parity covering manager lifecycle, async storage callbacks,
  plugin registration/teardown, deduplication, enrichment and observability
  ordering.
- A non-destructive `migrate:v2` manifest utility with canonical digest and
  row-count validation, identity/timestamp preservation, and a tested dry run.
- An isolated P4 NEXT core with versioned observations, explicit relationships,
  evidence records, configuration digests, adapter-owned comparison, explicit
  abstention, ordered history updates, instance-scoped adapter registration,
  exact content IDs, browser/document adapters, and a JSON comparison CLI. An
  out-of-tree note adapter fixture passes without a core edit.
- A P5 calibration foundation with immutable calibration manifests, explicit
  label provenance, configuration/mask scope checks, empirical probabilities,
  split-conformal prediction sets, stale/unsupported statuses, and held-out
  Brier/log-loss/coverage evaluation. This is an engineering foundation, not a
  research improvement claim.
- A P6 adaptation foundation that rejects calibration reuse across changed
  configuration digests and allocates uncertain review separately from a
  probability-recorded random audit stream. This does not claim a research
  improvement or automatic label generation.
- P7 domain fixtures for handwriting and enrolled biometric verification with
  relation-specific comparisons, explicit missingness, modality scoping, and
  adapter conformance tests. These are integration fixtures, not evaluated
  writer or biometric models.
- A P8 preview release surface with versioned exact retrieval manifests,
  idempotent updates,
  removal, replayable rebuilds, and an exhaustive candidate oracle. HNSW,
  persistent graph/index storage, HNSW justification, and cross-target
  release-matrix evidence remain production gates.
- A P8 artifact rollout foundation with immutable registration, activation
  history, explicit promotion reasons, defensive reads, and rollback by
  artifact selection. Retention and deployment persistence remain open.
- Local P3 storage gates pass for SQLite, PostgreSQL and Redis, including
  reopen, cross-package reads, pruning, Redis TTL/expiry and rollback-adjacent
  persistence checks.
- CI definition for Linux with Node 20, 22, and 24; CI results are not yet claimed.
- An isolated Rust/napi-rs prototype for field agreement and numeric decay,
  with synchronous loading, original callback values, reentrancy, exception
  identity and worker lifetime tests. See the [architecture](architecture.md).
- Rust legacy scorer, TLSH, graph, LSH and drift ports with exact oracle
  comparisons for the verified bridge corpus. The bridge suite now contains
  26 real-addon tests.

See the [baseline audit](baseline-audit.md) for actual evidence and the
[compatibility contract](../compat/v2-contract.md) for limitations.

The [uncertainty contract](uncertainty.md) and [release scope](../releases.md)
define the current statistical and distribution boundaries. They are narrower
than the full P6-P8 manifesto gates.

## Remaining Gates

P0 remains open: archive earlier 2.x packages and representative consumers;
expand JS edge cases, manager boundaries, storage and observability traces;
complete backend-specific transactional rollback and broader failure scenarios;
review distribution-map reproducibility. Enumeration of releases alone is not
earlier-version parity.

P1's Rust workspace, synchronous callback/loading spike, bounded tagged-value
Promise-awaiting probe, ordered host-sequence probe, storage bridge,
post-processor bridge and portable-loader contract are implemented. Cross-target
WASM execution evidence and production lifecycle integration remain release
gates,
along with broader JS semantics, recursive comparators and numerical parity.
Do not replace the legacy package until these gates and differential tests pass.
See [binding gates](../adr/0002-binding-feasibility.md).

Library success requires tested consumer/package compatibility and extensibility.
Research success independently requires the [evaluation protocol](../research/protocol.md)
and a held-out improvement over strong baselines. A useful port does not prove
research novelty, and a negative research result does not invalidate the port.

The P4 core is currently available through the isolated `src/next.ts` entry
point and is not added to the legacy root export barrel. This prevents NEXT
observation semantics from changing existing Devicer 2 imports.