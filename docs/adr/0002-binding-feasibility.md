# ADR 0002: Gate The Host Bridge Before Porting Algorithms

Status: accepted for the P1 synchronous/async bridge implementation, 2026-09-30.
Cross-target portable build evidence remains unverified. See the
[architecture and measured scope](../next/architecture.md). The bounded value
transport is specified separately in [ADR 0003](0003-js-value-encoding.md).

## Context

Existing callers expect immediate numeric scores and arbitrary JS comparators,
while storage and post-processors may return Promises. JSON cannot preserve all
accepted JS values or callback object identity. The bounded asynchronous
transport is specified separately. The new engine must eventually
run without an end-user Rust compiler or mandatory remote service.

## Decision And P1 Checks

Prototype napi-rs/Node-API with a minimal Rust scoring operation and synchronous
JS comparator first. Pin the binding/toolchain versions when the spike begins.
Execute synchronous callbacks on the JS thread; do not block that thread while
waiting for a worker to call back into it. Preserve original JS callback values
and specify a tagged representation for undefined/null, special numbers,
UTF-16 strings, dates, arrays and objects. Characterize unsupported values before
making a compatibility claim.

The `awaitHostNumber`, `awaitHostValue`, `runHostSequence`, storage bridge and
post-processor bridge now confirm that JS-created
numeric or bounded tagged-value Promises can be awaited by async napi exports,
with reentrant native use, ordered execution and clean completion. Their rejection result is an
napi error conversion, not arbitrary JS rejection identity. Next prototype
awaited custom storage and ordered post-processors without holding core locks
during host calls. The remaining lifecycle checks are transactional semantics,
cancellation, teardown callbacks and shutdown. The portable loader validates a
module contract by injection; CI is configured to compile the core for
`wasm32-unknown-unknown`, but that target is unavailable in the local toolchain.
The P0 consumer provides a starting contract but does not validate Rust thread
or lifetime safety.

Use the same Rust algorithms for a portable WASM candidate. Synchronous Node
loading and callback parity are gates, not assumptions. Browser DOM collection
remains outside the core; portable algorithms do not imply browser SQL/socket
support. Package and target matrices must prove loading and offline install.

## Alternatives And Consequences

A Rust crate alone cannot execute existing JS plugins. Converting all scoring
to async would violate existing callers. Keeping algorithmic JS fallbacks could
help a preview, but each fallback must be disclosed and blocks the full-Rust-core
milestone. A stable Rust dynamic-library plugin ABI is not proposed; future
external plugins can use versioned process/WASM protocols.

Do not scaffold all proposed crates merely to imply progress. Start with the
smallest core/binding pair needed to prove these checks, then split ownership
as algorithms and domain contracts become concrete.