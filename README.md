# Devicer NEXT

**Versioned fingerprints. Explainable comparisons. Explicit uncertainty.**

Devicer is a TypeScript/Node.js library for turning application-supplied signals
into comparable observations. NEXT extends its browser-fingerprinting roots
with a domain-neutral workflow for document deduplication, custom signal
adapters, calibration, retrieval, persistence, and governance.

Build browser change-detection workflows, find exact document duplicates, or
connect your own feature extractor without treating every similarity score as
proof of identity. Developed by [Gateway Corporate](https://gatewaycorporate.org).

The 3.0.0 codebase keeps the legacy `devicer.js` API and introduces NEXT through
`devicer.js/next`. NEXT remains an engineering preview: browser and document
workflows are the initial advertised domains; biometric adapters are input and
integration contracts, not evaluated biometric products. See the
[release scope and verification record](docs/releases.md).

## What's New

| Capability | What NEXT provides |
| --- | --- |
| Versioned observations | Domain, schema, extractor versions, timestamps, acquisition metadata, and pipeline provenance. |
| Relationship-aware comparison | Compare exact content, browser installations, writers, or enrolled subjects through explicitly declared relationships. |
| Evidence and abstention | Per-comparator evidence, configuration digests, and explicit unavailable or incompatible states instead of fabricated certainty. |
| Calibration and evaluation | Labeled-data calibration artifacts, prediction sets, held-out evaluation, evidence-mask reporting, and configuration-bound reuse checks. |
| Exact retrieval | Content-derived IDs, bounded result sets, deterministic pagination, integrity-checked snapshots, and recall evaluation. |
| Durable observations | In-memory, SQLite, PostgreSQL, and Redis stores with scoped observations, snapshot restore, and transaction rollback. |
| Operational controls | Retention purge, authorization hooks, metadata-only audit events, and calibration-artifact activation and rollback. |
| Extensible runtimes | Typed adapters and injected inference, including a bounded Node process runtime with cancellation and teardown. |

## Install

Use Node.js with ESM imports. The current source has been checked on Node
20.20.2, 22.23.3, and 24.21.0; TypeScript declarations are included.

```sh
npm install devicer.js@^3
```

The examples below target the 3.x NEXT API. If that version is not yet available
from your registry, build this checkout using the development commands below.
Storage drivers are peer dependencies: SQLite uses `better-sqlite3`, PostgreSQL
uses `postgres`, and Redis uses `ioredis`. SQLite may require a native addon
build; normal NEXT JavaScript usage does not require Rust.

| Import | Purpose |
| --- | --- |
| `devicer.js/next` | Observations, adapters, comparison, calibration, retrieval, and governance. |
| `devicer.js/next/sqlite` | SQLite observation store. |
| `devicer.js/next/postgres` | PostgreSQL observation store. |
| `devicer.js/next/redis` | Redis observation store. |
| `devicer.js/next/node-runtime` | Application-owned process inference runtime. |
| `devicer.js` | Legacy scoring, `DeviceManager`, registries, plugins, and storage adapters. |

## Compare Observations

The built-in browser adapter compares jointly available fields for exact
agreement. It is a transparent baseline, not the legacy weighted scorer or an
automatic identity detector. Your application supplies the signals; NEXT does
not collect them from a browser or device.

```javascript
import {
  createBrowserAdapter,
  createFingerprint,
  compareFingerprints,
} from 'devicer.js/next';

const adapter = createBrowserAdapter();
const earlier = await createFingerprint(adapter, {
  language: 'en-US', timezone: 'UTC', platform: 'Linux',
}, { id: 'browser-earlier' });
const later = await createFingerprint(adapter, {
  language: 'en-US', timezone: 'Europe/Paris', platform: 'Linux',
}, { id: 'browser-later' });

const result = await compareFingerprints(adapter, earlier, later, 'same-installation');
console.log(result.similarity);
console.log(result.status);
console.log(result.evidence, result.configuration.digest);

const missing = await createFingerprint(adapter, {}, { id: 'browser-missing' });
const unavailable = await compareFingerprints(adapter, earlier, missing);
console.log(unavailable.status, unavailable.similarity);
```

The first comparison returns a similarity of approximately `0.667` and status
`uncalibrated`. The empty observation produces `insufficient_data` and `null`,
not a non-match. Mismatched domains, schemas, extractors, or required pipeline
provenance produce `unsupported_configuration`.

`matchFingerprint` can rank a supplied candidate list and apply an application
threshold, returning `match`, `non_match`, or `insufficient_evidence`. It does
not establish a calibrated probability or mint a verified identity.

## Find Exact Duplicates

Document comparison uses exact text; retrieval uses content-derived keys scoped
to a domain and schema. Similarity search, OCR, and semantic embeddings are not
implied by this adapter.

```javascript
import {
  createDocumentAdapter,
  createFingerprint,
  ExactRetrievalIndex,
} from 'devicer.js/next';

const adapter = createDocumentAdapter();
const document = await createFingerprint(adapter, {
  text: 'Invoice 1042: total USD 125.00',
}, { id: 'invoice-1042' });

const index = new ExactRetrievalIndex(adapter.domain, adapter.schemaVersion);
const contentId = await index.add(document);
const candidates = await index.findExact(document.features, 10);

console.log(contentId);
console.log(candidates.map(candidate => candidate.observation.id));
console.log(index.manifest());
```

The index is in memory and supports snapshot export/restore and deterministic
rebuilds. The result limit bounds returned candidates, not search complexity:
this is not a production-scale approximate-nearest-neighbor index. A content
match establishes duplication, not common authorship.

## Persist And Govern

NEXT stores preserve observation IDs, timestamps, features, and provenance.
SQLite, PostgreSQL, and Redis implementations have live reopen and rollback
checks. The following independent example uses temporary in-memory SQLite;
replace `':memory:'` with a file path for durable local storage.

```javascript
import { createDocumentAdapter, createFingerprint } from 'devicer.js/next';
import { createSqliteNextStore } from 'devicer.js/next/sqlite';

const adapter = createDocumentAdapter();
const store = createSqliteNextStore(':memory:', adapter.domain, adapter.schemaVersion);

try {
  await store.init();
  const observation = await createFingerprint(adapter, {
    text: 'Approved purchase order',
  }, { id: 'purchase-order-17' });

  await store.save(observation);
  console.log(await store.get(observation.id));
  console.log((await store.snapshot()).observations.length);
} finally {
  store.close();
}
```

Use `createGovernedNextStore` to add application-defined authorization and audit
callbacks, then schedule `purgeExpired()` for retention enforcement. These hooks
do not replace authentication, encryption, lawful collection, or a deployment
threat model. Storage is snapshot-oriented; high-volume scale and distributed
concurrency guarantees need separate evaluation.

## Calibrate Separately

NEXT separates raw similarity, calibrated predictions, and application decisions:

1. Create labeled comparison samples for a declared population and task.
2. Build an artifact with `createCalibrationArtifact` on a calibration split.
3. Apply `calibrateComparison` and evaluate on independent held-out data with
   `evaluateCalibration` or the pairwise `runEvaluation` runner.
4. Track Brier score, log loss, coverage, prediction-set size, abstentions,
   quality slices, and latency rather than a single universal accuracy number.

Artifacts are bound to configuration digests and supported evidence masks.
Changed configurations or stale artifacts return explicit non-success states;
`assessCalibrationReuse` makes transitions inspectable. The in-memory
`CalibrationArtifactRegistry` supports activation history and rollback by
artifact selection. It does not rewrite historical observations or labels.

See [uncertainty and calibration](docs/next/uncertainty.md) for the contract.
A similarity of `1` is not a 100% probability of shared identity, and changing
an extractor does not make an old calibration valid for the new pipeline.

## Bring Your Own Signals

Implement `FingerprintAdapter` for a new domain, or inject your inference
function or `ModelRuntime` through the model-backed factories. Define the input
profile, feature dimension, extractor versions, supported relationships, and
quality checks explicitly. See the [adapter SDK](docs/next/adapter-sdk.md) and
[signal contracts](docs/next/domain-model-plan.md).

| Adapter | Input contract |
| --- | --- |
| Physical fingerprint | Defaults to `FINGERPRINT_500_DPI`: single-channel gray8, known 500-DPI acquisition, valid dimensions and buffer length. DPI is not an image size or sensor certification. |
| Signature | Defaults to `SIGNATURE_224`: caller-normalized 224x224 gray8, aspect-preserving fit with white padding, and source/normalization provenance. This is a versioned profile, not a universal signature standard. |
| Face | Requires an explicit raster or feature-only profile. Image dimensions, channel count, alignment assumptions, and external extraction must be declared. |
| Handwriting / enrolled biometric | Feature-only vectors with declared dimensions and extractor versions; relationships and modality remain scoped. Transcription comparison is exact text. |

Versioned alternative profiles are supported. Default raster validation rejects
blank or malformed input before inference. Invalid or zero-magnitude vectors
become unavailable evidence; incompatible pipeline provenance is rejected
before scoring. Older observations without required metadata need migration
from known provenance or re-extraction, not guessed defaults.

**No production ML implementations, weights, or model downloads are bundled.**
`ProcessModelRuntime` integrates an application-owned process over JSON lines
with timeouts, cancellation, and teardown. It is an integration boundary, not
a supplied recognition engine or a sandbox for untrusted executables.

The [fingerprint example](src/examples/physical-fingerprint.ts) uses sensor-shaped
synthetic captures. The [Rust signature example](crates/devicer-compat-v2/examples/signature_usb.rs)
decodes PNG/JPEG files, fits and pads them, and reports an uncalibrated pixel
baseline. Neither establishes biometric accuracy, liveness, or identity proof.

## Keep The Legacy API

Existing applications can continue using the root package. The legacy surface
includes weighted confidence scoring, TLSH hashing, drift analysis, identity
graph helpers, LSH candidate lookup, storage adapters, and the `DeviceManager`
identification workflow. Registries customize scoring, while `DeviceManager.use()`
registers enrichment plugins and returns an unregister function.

```javascript
import { DeviceManager, createInMemoryAdapter } from 'devicer.js';

const manager = new DeviceManager(createInMemoryAdapter());
const result = await manager.identify({
  userAgent: 'Example browser', platform: 'Linux', language: 'en-US',
});

console.log(result.deviceId, result.isNewDevice);
```

Legacy confidence uses a `0-100` scale; NEXT similarity uses `0-1` or `null`.
They are different contracts, not interchangeable probabilities. NEXT adds
scoped observations and evidence rather than silently changing the root API.
Packaged differential checks compare the claimed legacy surface against the
integrity-pinned `devicer.js@2.0.3` oracle, not every historical 2.x release.
See the [compatibility contract](docs/compat/v2-contract.md) and
[migration guide](docs/migration/v2-to-next.md).

## TypeScript And Rust

The published API is TypeScript/JavaScript. The Rust workspace and isolated
Node bridge exercise compatibility algorithms, host callbacks, and lifecycle
behavior against the legacy oracle. This is not yet a complete Rust-backed
replacement for the package or its storage layer.

The portable Rust core builds as WASM and its module can be instantiated, but
currently exports only memory. `bridge:portable` tests an injected loader
contract; it does not supply a callable WASM scoring backend. See
[architecture and boundaries](docs/next/architecture.md).

## Develop And Verify

From this checkout:

```sh
npm ci --ignore-scripts
npm rebuild better-sqlite3
npm run build
npm test
npm run test:signal-example
npm run test:release
npm run compat:package
npm run next:release:check
```

With a matching Rust toolchain:

```sh
cargo fmt --all --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --all-targets --locked
npm run bridge:check
npm run bridge:portable
```

`npm run next:storage:check` checks SQLite and configured live services; set
`NEXT_POSTGRES_URL`, `NEXT_REDIS_URL`, and `NEXT_REQUIRE_LIVE_STORAGE=1` to
require all backends. The [operations guide](docs/operations.md) covers storage
and migration workflows. `npm run bench` runs local benchmarks; results depend
on the workload, hardware, data, and calibration, not a universal speed or
accuracy guarantee.

The [verification record](docs/releases.md) reports 346 passing tests across
clean Node 20/22/24 snapshots and 26 native bridge checks per runtime. Release
promotion still requires final-commit CI and review of recorded dependency
advisories; successful tests alone are not production certification.

## Documentation

- [NEXT manifesto](next-manifesto.md): goals and design principles.
- [Data model](docs/next/data-model.md): observations, evidence, and configuration.
- [Adapter SDK](docs/next/adapter-sdk.md): extending NEXT without core edits.
- [Signal profiles and migration](docs/next/domain-model-plan.md): input validation and provenance.
- [Release scope](docs/releases.md) and [RC plan](docs/next/rc-plan.md): evidence, limitations, and promotion gates.
- [Generated API reference](https://gatewaycorporate.github.io/fp-devicer/): legacy and NEXT APIs, including storage and process-runtime entry points. Regenerate with `npm run docs` or use `npm run docs:watch` while developing.
- [Whitepaper](whitepaper.md): theory and research context, separate from release guarantees.

## License

See [license.txt](license.txt) and [terms of service](terms-of-service.md).
