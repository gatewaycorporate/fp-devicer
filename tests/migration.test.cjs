'use strict';

const assert = require('node:assert/strict');
const { mkdtemp, readFile, rm, writeFile } = require('node:fs/promises');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { resolve } = require('node:path');
const test = require('node:test');

const run = promisify(execFile);
const root = resolve(__dirname, '..');

test('migration manifest exports, validates, and preserves row identity', async () => {
  const directory = await mkdtemp(resolve(root, '.compat-cache/migration-test-'));
  try {
    const input = resolve(directory, 'legacy.json');
    const output = resolve(directory, 'migration.json');
    const rows = [{
      id: 'snapshot-1',
      deviceId: 'device-1',
      timestamp: '2026-09-30T00:00:00.000Z',
      fingerprint: { platform: 'Linux', nested: { b: 2, a: 1 } },
    }];
    await writeFile(input, JSON.stringify(rows));
    const exported = await run(process.execPath, [resolve(root, 'scripts/migrate-v2.mjs'), 'export', input, output]);
    assert.match(exported.stdout, /"rowCount":1/);
    const manifest = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(manifest.format, 'devicer-v2-migration');
    assert.equal(manifest.snapshots[0].id, 'snapshot-1');
    const validated = await run(process.execPath, [resolve(root, 'scripts/migrate-v2.mjs'), 'dry-run', output]);
    assert.match(validated.stdout, /"writes":0/);
    assert.match(validated.stdout, /"destructive":false/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
