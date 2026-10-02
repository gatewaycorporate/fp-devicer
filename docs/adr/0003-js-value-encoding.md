# ADR 0003: Versioned Tagged Values For Host Payloads

Status: accepted for the development bridge subset, 2026-09-30. This is not
the complete Devicer 2 arbitrary-value contract.

## Context

Synchronous comparators must retain original JS references, but awaited storage
and post-processor results need a transport representation. Plain JSON loses
`undefined`, non-finite numbers, negative zero, BigInt, dates, array holes and
object-key distinctions. It also silently accepts fewer values than the legacy
interfaces expose.

## Decision

The bridge uses a versioned JSON envelope for the narrow asynchronous payload
probe:

```json
{"v":1,"value":{"t":"object","v":[["ready",{"t":"boolean","v":true}]]}}
```

Supported tags are `undefined`, `null`, `boolean`, `string`, `number`, `bigint`,
`date`, `array` and plain `object`. Numbers encode `NaN`, positive/negative
infinity and negative zero explicitly. Object values use ordered key/value
pairs, so undefined properties and keys such as `__proto__` do not rely on JSON
object assignment semantics. Dates require a valid ISO representation.

The codec is implemented in the development-only bridge facade. Rust receives
and awaits the encoded string through napi; it does not parse or reinterpret the
payload yet. `awaitHostValue` therefore preserves values across an awaited host
operation but does not preserve object identity, prototypes, accessors, symbols,
functions or cycles.

## Rejections And Limits

Symbols, functions, invalid dates, cyclic values and non-plain object prototypes
are rejected before transport. Promise rejection reasons still pass through
napi's error conversion and do not promise arbitrary JS rejection identity.
Array extra properties, accessors and descriptors are not part of version 1.

`runHostSequence` uses this protocol to prove ordered awaited operations and
stop-on-rejection behavior. This is suitable for a subsequent
storage/post-processor sequencing spike only after its result schemas are
constrained to this subset. It is not a license to serialize arbitrary legacy
inputs, and it does not define persistence schemas, cancellation, transactional
behavior, teardown callbacks or plugin lifecycle ordering. Those remain separate
compatibility gates.
