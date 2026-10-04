# Devicer 2 Migration Manifest

The `migrate:v2` command creates and validates a portable migration manifest. It
is intentionally non-destructive: it never writes to a database and it never
deletes legacy rows.

## Export

Prepare a JSON array from an existing adapter's `getAllFingerprints()` result,
with each row containing `id`, `deviceId`, `timestamp`, and `fingerprint`.

```sh
npm run migrate:v2 -- export legacy-snapshots.json next-migration.json
```

The manifest preserves snapshot IDs and timestamps and records a canonical
SHA-256 digest and row count.

## Validate Or Dry Run

```sh
npm run migrate:v2 -- validate next-migration.json
npm run migrate:v2 -- dry-run next-migration.json
```

Validation rejects unsupported formats, missing required fields, invalid dates,
row-count changes, and digest changes. Dry-run output always reports zero
writes and `destructive: false`.

Database-specific import, transactional rollback, and per-snapshot deletion are
not implied by this manifest. The legacy `StorageAdapter` contract has no
per-snapshot delete operation, so production migration must retain the source
backup and perform backend-specific writes only after validation.
