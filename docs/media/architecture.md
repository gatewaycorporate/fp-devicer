# Rust Compatibility Architecture

Status: P3 packaged compatibility gates pass locally on top of the
differentially verified P2 algorithm ports, 2026-09-30. Earlier-release and
migration release gates remain open; this is not yet a replacement claim for
the published npm package.

## First Vertical Slice

`devicer-compat-v2` owns the legacy field-agreement loop, recursive bounded
scorer, TLSH hashing/distance and temporal decay arithmetic; `devicer-node`
exposes a synchronous Node-API bridge.
The Rust core is independent of Node, databases, networking and model runtimes.
It receives per-field comparison results through a fallible callback and owns
the field order, threshold, count, default result and rounding.

The JS host retains original values for synchronous comparators. For each Rust-
requested field it performs JS property access, presence checks and comparator
invocation. Awaited host payloads use the separate version-1 tagged subset in
[ADR 0003](../adr/0003-js-value-encoding.md); this does not serialize comparator
inputs or claim general arbitrary-value compatibility. Local custom comparators
must be usable without rewriting their signatures.
The first facade supports explicit local comparators with global registry use
disabled; it must reject unsupported registry mode rather than silently diverge.

No calls are dispatched to a worker thread in this synchronous slice. No mutex is held while
invoking a host callback. Errors must stop iteration, nested/reentrant calls must
remain possible, and callbacks receive original input references. Tests exercise
the actual loaded addon in both the main Node thread and a Node worker.

## Running The Prototype

```sh
npm ci --ignore-scripts
npm run bridge:check
```

This development command requires Cargo/Rust and a native linker. The local
toolchain is Rust/Cargo 1.98.1 on Linux with Node 22.23.3. CI is configured for
Linux Node 20/22/24 and Rust 1.98.1; remote results are not claimed. Dependencies
are pinned: napi 3.13.0, napi-derive 3.6.9, napi-build 2.5.0 and libm 0.2.16,
with transitive versions fixed by the workspace lockfile.

The [runner](../../scripts/bridge-spike.mjs) verifies the npm oracle, runs Rust
unit tests, builds the release-mode addon with `--locked`, discovers its library
through Cargo's JSON artifact output, and copies it to an ignored `.node` file.
It type-checks the [consumer](../../tests/bridge/consumer.ts) and executes the
[real-addon tests](../../tests/bridge/bridge.test.cjs) under a 30-second parent
process timeout. This can terminate a native synchronous deadlock even if the
Node event loop cannot execute timers.

The [facade](../../packages/bridge-spike/index.cjs) loads synchronously with
`require`; it has no asynchronous initialization or algorithmic fallback. It is
development-only and excluded from the legacy package's `files`/root exports.
Consumers of `devicer.js` continue to receive the original JS implementation.

## Supported Scope And Evidence

- `computeFieldAgreement` requires `useGlobalRegistry: false`. It supports
	primitive comparisons and unchanged local custom comparator signatures.
	Present object pairs without a custom comparator are rejected explicitly;
	the recursive legacy object comparator is not ported yet.
- Original object/array/Date/cyclic values stay in JS and reach callbacks by
	identity. Property access, presence, coercion and comparator clamping are host
	semantics, while Rust controls iteration and score calculation. This is not
	a general object serialization or native feature-storage bridge.
- Comparators are snapshotted at call entry, matching local legacy behavior.
	Mutation/deletion affects later calls, not the current snapshot. Reentrant
	native calls pass without holding locks or sharing invocation state.
- napi-rs converted thrown non-Error values into new errors in the initial probe.
	The facade now retains each original failure in its invocation-local closure,
	sends an Error through Rust to stop iteration, then rethrows the original value.
	Tests cover Error, object, string, null and undefined identity.
- `computeTemporalDecayFactor` accepts numeric arguments only. It preserves the
	legacy e-folding formula, including its historical parameter name. The initial
	system `f64::exp` probe differed from V8 in 1,264 of 10,000 samples. Pinned
	portable `libm::exp` now matches all those samples exactly, plus selected
	zero/infinite/NaN cases, without a tolerance or JS arithmetic fallback.
	- `calculateScoreBreakdown` and `calculateConfidence` use the Rust scorer for
		default/decay-only options. It ports the legacy comparable projection,
		recursive comparison, built-in comparators, all score dimensions, decay
		normalization, non-exact ceilings and exact-match override.
	- `getHash` and `compareHashes` use the Rust TLSH implementation. Its `T1`
		header is normalized to the published npm representation; direct strings and
		canonicalized objects are checked against the 2.0.3 oracle.

	Local verification: nine Rust tests, twenty-six real-addon tests, and the TypeScript
consumer pass. The decay sample uses ages `index * 123456.789` for indices
1 through 10,000 with the legacy default parameter. This is evidence for that
corpus and platform, not proof for every float or every runtime/architecture.

The async probe adds `awaitHostNumber`, `awaitHostValue` and `runHostSequence`.
They accept JS host functions, create Promises on the JS thread, and let Rust
await numeric or versioned tagged-text payloads through napi's async runtime.
Tests verify fulfillment, Promise rejection, reentrant synchronous native use,
invalid operation validation, ordered execution and clean process completion.
`awaitHostValue` preserves
the bounded tag subset but not identity, prototypes, accessors, symbols,
functions or cycles. Rejected values are observed through napi's error
conversion, so arbitrary rejection identity is not preserved. Cancellation,
teardown callbacks beyond the snapshotted operation list, and host shutdown
remain outside its scope.

## Gates And Non-Claims

Continue expanding differential results against the integrity-verified published
package before widening the supported surface. The full legacy composite, TLSH,
graph/LSH helper surface, default comparators/registry, manager and storage are
not yet wired into the published package.
Do not claim a complete Rust scorer or silently wire this prototype into the
root package. Native binary loading for this development experiment may require
a compiler; end-user binary distribution is a later release gate.

The development storage bridge covers all `StorageAdapter` methods through the
tagged payload path, and the post-processor bridge snapshots ordered named
processors, merges successful result fields, and records non-fatal failures.
These are contract probes rather than production persistence or manager wiring;
transactional storage behavior, cancellation, teardown and shutdown remain
open. The portable loader validates an injected module contract, while CI builds
the Rust compatibility core as `wasm32-unknown-unknown`; that target is absent
from the local Rust installation, so the CI result is not claimed here. Broader
JS value compatibility and the full runtime/platform matrix remain open. The
[binding ADR](../adr/0002-binding-feasibility.md) defines their constraints.