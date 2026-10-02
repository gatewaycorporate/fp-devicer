# Release Scope

The current NEXT work is an isolated preview release surface at `src/next.ts`. It does
not change the legacy root export barrel or claim a replacement for Devicer 2.
The built preview is available additively as the `devicer.js/next` package
subpath; the `next:release:check` command verifies that its runtime and type
artifacts plus the required scope documents are present.

The proposed path from this preview to `3.0.0-rc.1` is documented in the
[RC plan](next/rc-plan.md), including current usage examples and release gates.

Verified locally:

- Node 24 build and TypeScript declarations;
- full Vitest suite and NEXT focused contracts;
- packaged Devicer 2 compatibility: 42 runtime exports, 76 declarations, and
  6 isolated consumer groups;
- P2 Rust/native bridge checks recorded in the NEXT charter.

The NEXT preview includes versioned observations and evidence, browser/document
fixtures, P5 calibration baselines, P6 label-allocation foundations, P7
handwriting/biometric adapter fixtures, exact retrieval with validated
snapshots, and in-memory artifact activation/rollback.

Not yet release claims:

- full earlier-2.x compatibility or complete Rust-core replacement;
- cross-target WASM evidence or a complete runtime/OS package matrix;
- production database-backed NEXT persistence, HNSW retrieval, or graph
  persistence;
- evaluated handwriting or biometric accuracy;
- a P6 empirical improvement, novelty claim, or arbitrary-shift guarantee.

Every release candidate must rerun the packaged compatibility command, full
tests, build, adapter conformance fixtures, and held-out evaluation from frozen
data/code/artifact manifests. Release promotion and rollback select immutable
calibration artifacts; they do not rewrite observations or labels.