# Devicer 2 Compatibility Contract

Status: initial executable contract for 2.0.3 only. Passing this corpus does not
establish compatibility for all inputs, backends, runtimes, or earlier releases.

## Executable Contract

The authoritative captured surface is [v2.0.3.json](../../tests/compat/v2.0.3.json),
generated from the integrity-verified npm package by
[compat-v2.mjs](../../scripts/compat-v2.mjs). It includes the export map, 42 runtime
exports, and 76 public declaration entries. Declaration entries include public
class members, constructors, generic constraints/defaults, alias definitions,
index signatures, and inferred calculator signatures. Private/protected members
and TypeScript's internal symbol IDs are not a public API contract.

[consumer.ts](../../tests/compat/consumer.ts) retains `devicer.js` root imports
and is compiled unchanged against each package through a temporary consumer
installation. It exercises synchronous scoring, async custom storage, manager
plugin object identity, original request/input identity, save-before-enrichment,
cache-hit enrichment, and teardown. UUID format and identity relationships are
checked, not random bytes. Cache time is fixed; elapsed timings are not compared.

```sh
npm run compat:check
npm run compat:package
node scripts/compat-v2.mjs --candidate /absolute/path/to/extracted/package
```

`compat:check` compares the checked-in distribution and source declaration
surface. `compat:package` also builds and packs a new artifact in `.compat-cache`.
The external-candidate option expects an extracted package directory and uses
that package's available dependencies. These commands require Node, npm, `tar`,
and installed locked dependencies; initial oracle download requires network access.
Once cached, the oracle needs no network fetch, but this is not an offline
end-user installation guarantee.

`npm run compat:record` explicitly overwrites the golden fixture using only the
pinned oracle. Review every fixture diff. Never re-record to conceal a candidate
regression. Changing the oracle version or integrity is a contract-review event.

Each behavior group runs in a fresh process. Input values, including undefined,
Unicode and Dates, are constructed in JS rather than round-tripped through JSON.
Captured results currently use JSON and do not establish lossless handling of
arbitrary callback return values, non-finite numbers, or cycles. The future
binding needs its own tagged-value and reentrancy conformance suite.

## Behavior Ledger

All rows specify intended legacy preservation, not fixes shipped by this work.
"Captured" means the named examples are frozen, not exhaustive coverage.

| Quirk | Initial evidence | NEXT or follow-up policy |
| --- | --- | --- |
| Heuristic score, not probability | Normal, changed, exact and empty pairs captured | Separate calibrated results |
| Fixed browser field assumptions | Browser and sparse document cases captured | Domain adapters |
| TLSH error zeroes entire breakdown | Repetitive-text and missing-input cases captured | Source-specific unavailable evidence |
| Untyped canonical serialization | Numeric/string collision, ordering, arrays and Unicode hashes captured | Versioned typed canonical format |
| Fuzzy hashes used for dedup | Consumer covers cache reuse; collision behavior pending | Separate exact content, observation and entity IDs |
| Behavioral metrics excluded | Differing behavioral metrics yield unchanged score | Explicit NEXT behavioral adapter |
| Misnamed decay half-life | Zero age and e-folding age captured exactly | Accurately named new parameter |
| Empty Jaccard disagreement | Root helper captured; comparator helper covered only by legacy tests | Do not consolidate legacy helpers |
| Registry lazy initialization and clear | Before/after first use, override, clear and explicit initialization captured | Instance-scoped NEXT registry |
| Strict manager threshold | Public signature frozen; equality-boundary corpus pending | Explicit decision policy |
| Backend-specific fields/order | Live SQL metadata loss/generated IDs and Redis metadata/IDs captured; cross-reads pass | Explicit migration and rollback |
| PostgreSQL bootstrap and dialect defects | Live `42703` column mismatch and `42883` missing `json_extract` captured | Any repair requires explicit compatibility decision |
| Candidate truncation/duplicate devices | SQLite duplicate-device results and Redis latest-only results captured; larger retrieval corpus pending | Retrieval recall measured separately |
| Plugins run after save, also on cache hits | Async consumer captures order, identity and teardown | Separate evidence and enrichment roles |
| Process-local index/graph | Public API captured; lifecycle corpus pending | Versioned incremental retrieval and typed edges |
| Mislabeled EER and same-batch tuning | Historical implementation unchanged | Correct crossing/interpolation and held-out evaluation |

## Runtime Scope And Remaining Tests

Local execution: Linux, Node 22.23.3, npm 12.1.0. CI is configured for Linux
Node 20/22/24 but must actually run before claiming those results. No macOS,
Windows, CommonJS, browser, WASM or native binding compatibility is established.
The package's `default` condition alone proves none of these capabilities.

Remaining P0 fixtures include threshold equality, nested and inherited JS values,
non-finite numbers, cyclic inputs, reentrant callbacks, unregister-during-call,
full manager batch/history ordering, observability traces, and broader backend
failure/migration scenarios. See [live storage evidence](../next/baseline-audit.md#live-storage-characterization)
for the initial SQLite/PostgreSQL/Redis scope and reproducible commands.
Existing unit tests supplement rather than replace packaged differential tests.
Internal `Comparator` and `ComparisonOptions` are not legacy root exports.

No production algorithms, storage formats, default behaviors, or plugin APIs
were changed in this increment. Any future intentional divergence must be
listed as NEXT-only or an explicit opt-in repair before a release claim.