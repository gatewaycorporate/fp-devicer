# Baseline Audit

Recorded 2026-09-30. This is a local P0 record, not release certification.

## Pinned Reference

| Item | Value |
| --- | --- |
| npm package | `devicer.js@2.0.3` |
| Source commit | `62572742c9a1d920d9f91dbbb7f5dd3c38bd0fb8` |
| Archive | <https://registry.npmjs.org/devicer.js/-/devicer.js-2.0.3.tgz> |
| Integrity | `sha512-CKpAy7nOw9s9rXaw3VvxGKEPO0hHIB+sRi9qCYRGLCwvFxQ7GTh1HfqWWukcS0rWozqrVm3ZLwbdYDLeVGknGw==` |
| Local runtime | Node `22.23.3`, npm `12.1.0`, Linux |
| Manifest compiler | TypeScript `5.9.3`, directly pinned in the lockfile |

The published tarball is cached under `.compat-cache/devicer.js-2.0.3.tgz`.
Every run verifies its SHA-512 before extraction; a mismatched cached archive
fails closed. Candidate archives live under `.compat-cache/packed/` and never
replace the oracle. These caches are ignored by Git. CI is configured to archive
both tarballs and the frozen fixture as artifacts; long-term release archival
and provenance remain future work.

Dependencies resolve from the locked local installation. This is not an
independent clean-install validation of every published dependency range.

## Reproduction

From the repository root:

```sh
npm ci --ignore-scripts
npm run compat:check
npm run compat:package
```

Both gates compare 42 runtime exports, 76 declaration entries, six isolated
behavior groups, and a compiled/executed root-import TypeScript consumer.
The latter builds from source into an ignored staging directory, uses `npm pack`,
then tests the extracted npm artifact. Neither command regenerates golden data.

Local checks pass against the published reference. A staged rebuild produces
matching JavaScript and `.d.ts` bytes; `.d.ts.map` files differ because the staged
output changes relative paths to source. Whole-tarball byte identity is not
claimed: package metadata and development documentation have changed as well.
The source barrel and public declarations agree on the captured type contract.

Additional local validation:

- `npx tsc --noEmit`: passed.
- Initial `npm test -- --reporter=dot`, before the SQLite native build:
	296 passed, 6 skipped; 20 files passed, 1 skipped.
- All 48 rebuilt JavaScript/declaration files match the published bytes.
- TypeDoc generation preserves handwritten documents with `cleanOutputDir: false`;
	14 existing API-comment warnings remain, with no generation errors.
- The existing suite emitted a Redis connection-refused warning for localhost.
	No live Redis result is inferred from passing mock tests.

The original manifesto records a separate Node 24 inspection. Its test counts
and environment should not be mistaken for this run's environment. No Rust
algorithm, native/WASM parity, accuracy benchmark, or research improvement has
been verified by this increment.

## Release Inventory

`npm view devicer.js versions --json` on 2026-09-30 listed these 2.x versions:

| Version | Current coverage |
| --- | --- |
| 2.0.0 | Enumerated only; archive and representative consumers pending |
| 2.0.1 | Enumerated only; archive and representative consumers pending |
| 2.0.2 | Enumerated only; archive and representative consumers pending |
| 2.0.3 | Pinned archive and initial executable compatibility corpus |

## Live Storage Characterization

The [live runner](../../scripts/compat-storage.mjs) builds and verifies a fresh
npm candidate before each backend run. It compares separate real stores against
the published oracle, checks reads in new processes and bidirectional legacy
database reads, and freezes backend-specific results:

- [SQLite fixture](../../tests/compat/storage-sqlite-v2.0.3.json): real disk file,
	generated UUIDs, metadata loss, global hash deduplication, newest-first history,
	limited queries, repeated device candidates, no-op linking and age pruning.
- [PostgreSQL fixture](../../tests/compat/storage-postgres-v2.0.3.json): stock
	PostgreSQL 16.15. An empty database fails on first save with `42703`, because
	bootstrap creates unquoted `deviceId` while Drizzle reads quoted `"deviceId"`.
	A separate database with an explicitly pre-created quoted schema exercises
	persistence and reproduces `42883` for `json_extract(json, unknown)` in candidate
	lookup. The quoted schema is fixture setup, not an implicit migration or repair.
- [Redis fixture](../../tests/compat/storage-redis-v2.0.3.json): Redis 7.4.11.
	Caller IDs and metadata survive; linking adds a separate hash field without
	rewriting snapshots' `userId`. History/latest keys receive 90-day TTLs, secondary
	indexes do not expire, and age pruning returns zero. Immediate expiry of one
	device's data/latest keys leaves a dangling index member, which retrieval skips.

All three pass locally on Linux/Node 22.23.3. With the SQLite native module built,
`npm test -- --reporter=dot --silent` passes all 302 tests across 21 files, with
no skips. The source typecheck and packaged compatibility gate also pass.
Passing PostgreSQL characterization
means matching observed legacy failures, not a functioning fresh-database adapter.
No production adapter was repaired. Any repair requires explicit opt-in semantics.

### Running The Fixtures

```sh
npm ci --ignore-scripts
npm rebuild better-sqlite3
npm run compat:storage -- sqlite
npm run compat:storage -- postgres
npm run compat:storage -- redis
```

The npm 12 manifest approves only `better-sqlite3@12.6.2` for its required native
build script. Older npm versions can rebuild this dependency directly. No global
script approval is needed. The normal unit-test CI job still installs with scripts
disabled; live-storage CI builds the SQLite dependency in its SQLite job.

PostgreSQL and Redis require a local Linux Docker daemon and Compose with `up
--wait`. Image digests are pinned in the runner. It creates a unique Compose
project, isolated stores and temporary Unix sockets, publishes no TCP ports, and
removes its containers, volumes, network and fixture directories in `finally`.
It does not accept production connection strings or clear existing databases.
Each package gets independent servers; the cross-read checks reuse only these
disposable stores. Redis disk persistence is disabled; reopen means reconnecting
from a fresh Node process, not restarting a Redis server.

Each worker has a 30-second timeout. SQL adapters expose no close method, so
their worker exits after writing its report; Redis explicitly closes its clients.
This is not proof of graceful application shutdown for the SQL adapters.
Exact remaining TTL seconds and UUID bytes are not golden equality targets.
TTL bounds are asserted, and generated-ID shape/relationships are compared.

Appending `--record` intentionally regenerates only that backend's fixture from
the pinned oracle after candidate parity passes. Review the diff; never re-record
to hide a regression. Missing prerequisites fail the command rather than skip it.
CI jobs are configured, but remote CI execution is not claimed by local results.

## Remaining Storage Work

Migration dry-run, backup/export and rollback tooling remain unimplemented.
These initial fixtures do not certify concurrent writes, transactional behavior,
server restart recovery, exhaustive retrieval recall, or other database versions.
Legacy mock tests supplement rather than replace this live evidence. All quirks
remain unchanged; see the [ledger](../compat/v2-contract.md).