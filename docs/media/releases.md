# Release Scope

## Model-Free Signal Preview

The branch excludes production ML implementations, vendored model repositories,
checkpoints and model-specific tooling. Generic inference interfaces remain.
Fingerprint ingress defaults to known 500-DPI gray8; signatures use an explicit
224x224 fit-and-pad profile. Alternative profiles are versioned. Domain factories
now require declared feature dimensions, and feature-only factories require an
extractor version. Old observations without matching provenance must be migrated
from known metadata or re-extracted; they are not silently upgraded.

These are input and comparison contracts, not biometric accuracy claims. See
[domain signal contracts](next/domain-model-plan.md) for migration and validation.
The release check also rejects model artifacts in source and package inventories.

## Existing Preview Scope

### Implementation Checkpoint: 2026-10-04

Verified on Linux with Node 20.20.2, 22.23.3 and 24.21.0 and Rust 1.98.1,
using the uncommitted working tree based on
`b6b2c819341e6853f6377000dee98ba7fbda85e3`. Clean source snapshots were tested
with fresh locked dependency installs and no prebuilt dist. The current package
version is 3.0.0. These results are not approval to release without final-commit
CI and dependency-advisory review.

- [x] Remove model implementations, model gitlinks, Candle dependencies and
  model-specific tooling; preserve the existing checkpoint deletion. Local
  ignored model checkout files are not release inputs.
- [x] Validate versioned raster profiles before inference; persist acquisition
  and pipeline provenance; reject incompatible observations and invalid vectors.
- [x] Run signature fit/pad and blank-input regressions, realistic synthetic
  fingerprint example, and durable SQLite signal-provenance tests.
- [x] TypeScript build, focused adapter tests, 3 release-policy tests, Rust
  workspace tests (9 core and 2 example tests), formatting, native bridge
  (26 checks), and portable injected-loader contract pass.
- [x] Packaged legacy compatibility passes: 42 runtime exports, 76 declarations,
  6 isolated consumer groups. SQLite/PostgreSQL/Redis live parity passes.
- [x] NEXT SQLite/PostgreSQL/Redis reopen and rollback pass with required live
  services; Docker services were isolated and removed after verification.
- [x] Actual npm archive inspected: 129 entries, no prohibited model paths;
  all 6 declared runtime exports import successfully from extracted contents.
  Archive `devicer.js-3.0.0.tgz` SHA-256:
  `9737ef1dd871425094619bad9206ec0a565bd74495a51835bed07fec1fa75240`.
- [x] Strict Clippy passes without suppressions after replacing the divisibility
  expression in [lsh.rs](../crates/devicer-compat-v2/src/lsh.rs#L15). LSH tests
  and all Rust workspace tests pass; signature-example edits were preserved.
- [x] The [data-generator test](../src/tests/data-generator.test.ts#L34)
  deterministically exercises random draws immediately below and at 0.125,
  restoring the random function after each case. All 346 tests pass on each
  supported Node version.
- [x] Clean Node 20/22/24 source snapshots pass locked install, SQLite rebuild,
  build, full unit suite, example typecheck, release-policy tests, packaged
  compatibility and model-free inventory checks. CI now explicitly rebuilds
  SQLite after its script-disabled install. All 26 native bridge checks also
  pass on each of these Node versions.
- [x] A fresh offline `wasm32-unknown-unknown` release build passes with matching
  official Rust 1.98.1 compiler and standard-library components. Components
  were checked against official SHA-256 files and extracted into the ignored
  check cache, without changing system Rust. The distro compiler cannot use the
  official standard library because their metadata is incompatible.
  The 325-byte WASM module validates and instantiates with no imports; it exports
  only `memory`, not scoring functions. This proves build/load compatibility,
  not a functional WASM scoring backend or native/WASM score parity.
  WASM SHA-256: `9cd276b9950396cd81ecbc9426b2f4f54ab91edf41a6adf3c7b42e926f66d183`.
- [ ] Triage dependency advisories before release. `npm audit --omit=dev --json`
  reports 4: high in `drizzle-orm` and `path-to-regexp`, moderate in `qs`, and low
  in `body-parser`. The full install reports 22 advisories including 3 critical;
  exploitability and upgrades were not assessed here. No dependency upgrades or
  compatibility-changing automatic fixes were applied.
- [ ] Rerun CI against the final commit before release. No commit or release
  was created during these checks. Functional WASM scoring remains outside the
  advertised supported surface.

Candidate archives are kept separately under `.compat-cache/release-candidate/`.
The published oracle at `.compat-cache/devicer.js-2.0.3.tgz` was restored and
validated against its pinned integrity after an earlier candidate-cache collision;
compatibility integrity checks were not relaxed. Temporary source snapshots and
test containers were removed. Verified toolchains remain in the ignored cache
for reproducible local checks.

To repeat the isolated WASM build in this workspace with the verified cached
components (CI uses its matching rustup-managed toolchain instead):

```sh
RUSTC="$PWD/.compat-cache/official-rust/bin/rustc" \
CARGO_TARGET_DIR=.compat-cache/official-wasm-build \
CARGO_TARGET_WASM32_UNKNOWN_UNKNOWN_RUSTFLAGS="--sysroot=$PWD/.compat-cache/wasm-sysroot -C linker=/usr/lib/rustlib/x86_64-unknown-linux-gnu/bin/rust-lld" \
cargo build --release --locked --offline -p devicer-compat-v2 --target wasm32-unknown-unknown
```

### Previous Preview Evidence

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