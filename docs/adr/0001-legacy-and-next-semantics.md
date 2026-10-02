# ADR 0001: Separate Legacy And NEXT Semantics

Status: accepted design constraint, 2026-09-30.

## Context

Devicer 2 exposes synchronous heuristic scoring, mutable global registries,
JS callbacks, backend-specific storage behavior and identity assignment. NEXT
needs domain-specific relationships and calibrated, version-supported evidence.
Changing the meaning of an existing score or silently repairing a backend can
change identity decisions in existing applications.

## Decision

Freeze legacy behavior against the actual published package. Keep the current
JS implementation during characterization; it is an oracle, not a completed
Rust port. Introduce NEXT as an explicit additional surface later. Its conceptual
APIs are `createFingerprint`, `compareFingerprints`, `matchFingerprint`, and
`updateFingerprintHistory`; this ADR does not add these exports yet.

NEXT observations, exact content identifiers, fuzzy retrieval signatures and
entity IDs have distinct meanings. Relationships declare directionality and
semantics. Pair verification is usable without persistence. Insufficient
evidence must not automatically mint an identity. Store NEXT records separately
from legacy records by default, with explicit migration rather than implicit
rewrites or competing authoritative writes.

## Alternatives And Consequences

Replacing the legacy scorer with a calibrated scorer would simplify one code
path but break observable results and misapply domain-specific calibration.
Renaming old methods would break consumers. Treating every legacy defect as a
bug to fix during porting would make parity ambiguous. All three are rejected.

Two behavior surfaces cost maintenance and tests. They may share Rust algorithms
only where semantics permit. Opt-in legacy repairs need their own fixtures and
release notes. No unqualified drop-in claim applies to a deliberately divergent
path. See the [contract ledger](../compat/v2-contract.md).