# NEXT Data Model

NEXT keeps collection, comparison, calibration, and identity assignment
separate. The core records observations and evidence; it does not infer an
identity from a similarity score or abstention.

## Observation

An `Observation` has a stable observation ID, domain and schema versions,
observation time, extractor versions, typed features, optional quality scores,
missingness reasons, and provenance. Raw sensitive artifacts remain external
unless a retention policy explicitly includes them.

## Evidence And Results

Adapters produce `Evidence` for a declared relationship. Evidence records the
comparator version, similarity, availability, quality, dependency group, and an
optional explanation. `matchFingerprint` selects the best comparable candidate
but returns `insufficient_evidence` when none is available. It never creates an
entity ID.

## Configuration Identity

The core computes a SHA-256 digest over a stable representation of schema,
extractors, comparators, fusion, normalization, and runtime conventions. A
configuration digest is distinct from a feature-availability mask and must be
stored with evidence and results.

The initial implementation is available from `src/next/index.ts`. Its public
functions are `createFingerprint`, `compareFingerprints`, `matchFingerprint`,
and `updateFingerprintHistory`. `createExactContentId` produces a typed,
domain-scoped SHA-256 content ID; it is an exact duplicate key, not an identity
claim.

P5 adds `createCalibrationArtifact`, `calibrateComparison`, and
`evaluateCalibration`. Calibration artifacts bind empirical probabilities and
split-conformal prediction sets to one configuration digest, a calibration data
manifest, evidence masks, label provenance, and optional expiry. Held-out
evaluation reports Brier score, log loss, coverage, and prediction-set size;
unsupported or stale artifacts return explicit statuses and no probability.

P6 adds `assessCalibrationReuse` and `allocateCalibrationLabels`. A changed
configuration digest requires validation rather than silent artifact reuse.
Uncertain cases and random audits are separate request reasons; audit requests
record their inclusion probability and never turn predictions into labels.

P8 adds `ExactRetrievalIndex` and `exhaustiveCandidates`. The index stores
typed exact content IDs by observation, supports idempotent replacement,
removal, replayable rebuilds, and a versioned manifest. Exact retrieval remains
candidate discovery only; it does not create identities or replace an
exhaustive evaluation oracle.
`ExactRetrievalIndex.snapshot` and `restore` provide a validated persistence
boundary; restoration checks scope, index version, observation IDs, and exact
content digests before replacing in-memory state.
`page` and the bounded `findExact` form provide deterministic bounded access;
`all` and `exhaustiveCandidates` remain explicit evaluation paths rather than
implicit production queries.
`evaluateExactRecall` reports recall-at-k against exact matches independently
of pairwise comparison accuracy.

## Persistence Boundary

`NextObservationStore` is the backend-neutral persistence contract for versioned
NEXT observations. The current implementation provides an in-memory store and
an injected snapshot store with:

- domain and schema scope validation;
- idempotent writes and conflicting-ID rejection;
- deterministic versioned snapshots and validated restore;
- reopen through a caller-provided durable read/write boundary; and
- transaction rollback when an operation or snapshot write fails.

The injected boundary deliberately does not reuse the legacy `StorageAdapter`
schema. Real SQLite, PostgreSQL, and Redis implementations must preserve NEXT
IDs and metadata, support transactional updates and rollback, and provide live
reopen evidence before those backends become RC-supported storage claims.

The current package exposes these implementations as `devicer.js/next/sqlite`,
`devicer.js/next/postgres`, and `devicer.js/next/redis`. They share the same
snapshot contract; availability of a backend and its live acceptance evidence
remain deployment-specific.
