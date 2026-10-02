#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

function usage() {
  throw new Error('Usage: migrate-v2.mjs <export|validate|dry-run> <input.json> [output.json]');
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(rows) {
  return createHash('sha256').update(canonical(rows)).digest('hex');
}

function normalizeRows(value) {
  const rows = Array.isArray(value) ? value : value?.snapshots;
  if (!Array.isArray(rows)) throw new Error('Input must be an array or an object with a snapshots array');
  return rows.map((row, index) => {
    if (!row || typeof row !== 'object') throw new Error(`Snapshot ${index} is not an object`);
    for (const key of ['id', 'deviceId', 'timestamp', 'fingerprint']) {
      if (!(key in row)) throw new Error(`Snapshot ${index} is missing ${key}`);
    }
    const timestamp = new Date(row.timestamp);
    if (Number.isNaN(timestamp.getTime())) throw new Error(`Snapshot ${index} has an invalid timestamp`);
    return {
      ...row,
      timestamp: timestamp.toISOString(),
    };
  });
}

function bundle(rows) {
  return {
    format: 'devicer-v2-migration',
    version: 1,
    createdAt: new Date().toISOString(),
    rowCount: rows.length,
    digest: digest(rows),
    snapshots: rows,
  };
}

function validate(value) {
  if (!value || value.format !== 'devicer-v2-migration' || value.version !== 1) {
    throw new Error('Unsupported migration manifest format');
  }
  const rows = normalizeRows(value.snapshots);
  const actualDigest = digest(rows);
  if (value.rowCount !== rows.length) throw new Error(`Row count mismatch: manifest=${value.rowCount} actual=${rows.length}`);
  if (value.digest !== actualDigest) throw new Error(`Digest mismatch: manifest=${value.digest} actual=${actualDigest}`);
  return { format: value.format, version: value.version, rowCount: rows.length, digest: actualDigest };
}

const [command, input, output] = process.argv.slice(2);
if (!command || !input || !['export', 'validate', 'dry-run'].includes(command)) usage();
const parsed = JSON.parse(await readFile(input, 'utf8'));
if (command === 'export') {
  if (!output) usage();
  const result = bundle(normalizeRows(parsed));
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ mode: 'export', rowCount: result.rowCount, digest: result.digest }));
} else {
  const result = validate(parsed);
  console.log(JSON.stringify({ mode: command, ...result, writes: 0, destructive: false }));
}
