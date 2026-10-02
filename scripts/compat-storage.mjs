import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const script = fileURLToPath(import.meta.url);
const root = resolve(dirname(script), '..');
const identitiesByStore = new Map();
const images = {
  postgres: 'postgres@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea',
  redis: 'redis@sha256:858f009f9709ce576febc734aa78b8f6d624b82571f9ddb6bda4377c833b3499',
};
const now = Date.parse('2026-09-30T12:00:00Z');
const snapshots = ['old', 'new', 'other'].map((label, index) => ({
  id: `caller-${label}`,
  deviceId: index < 2 ? 'device-alpha' : 'device-beta',
  timestamp: new Date(['2026-09-01T00:00:00Z', '2026-09-29T00:00:00Z', '2026-09-30T00:00:00Z'][index]),
  userId: 'original-user',
  ip: '192.0.2.10',
  metadata: { fixture: label },
  matchConfidence: 73,
  fingerprint: {
    label,
    platform: 'Linux x86_64',
    deviceMemory: 8,
    hardwareConcurrency: 8,
    userAgent: 'Compatibility storage fixture',
    canvas: Array.from({ length: 32 }, (_, part) =>
      createHash('sha256').update(`${label}-${part}`).digest('hex')).join(''),
  },
}));

function summarize(rows) {
  return rows.map(row => {
    const input = snapshots.find(snapshot => snapshot.fingerprint.label === row.fingerprint.label);
    assert.ok(input, 'Unexpected stored fingerprint');
    assert.deepStrictEqual(row.fingerprint, input.fingerprint);
    assert.ok(row.timestamp instanceof Date);
    const generatedId = row.id !== input.id;
    if (generatedId) assert.match(row.id, /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
    return {
      label: row.fingerprint.label,
      keys: Object.keys(row).sort(),
      generatedId,
      deviceId: row.deviceId,
      timestamp: row.timestamp.toISOString(),
      userId: row.userId ?? null,
      ip: row.ip ?? null,
      metadata: row.metadata ?? null,
      matchConfidence: row.matchConfidence ?? null,
      signalsHash: row.signalsHash ?? null,
    };
  });
}

async function observe(operation) {
  try {
    return await operation();
  } catch (error) {
    let cause = error;
    while (cause.cause) cause = cause.cause;
    return { error: { name: cause.name, code: cause.code ?? null, message: cause.message } };
  }
}

async function worker(entry, backend, address, phase) {
  console.log = () => {};
  if (backend === 'postgres') {
    process.env.PGHOST = address;
    process.env.PGPORT = '5432';
    process.env.PGUSER = 'devicer';
    address = 'postgresql:///compat?connect_timeout=5&ssl=false';
  }
  if (backend === 'redis') address = resolve(address, 'redis.sock');
  const api = await import(pathToFileURL(entry).href);
  if (backend === 'postgres' && ['bootstrap', 'write'].includes(phase)) {
    const { default: postgres } = await import('postgres');
    const client = postgres(address, { max: 1, connect_timeout: 5 });
    try {
      if (phase === 'bootstrap') {
        await client.unsafe('CREATE DATABASE bootstrap');
        const target = new URL(address);
        target.pathname = '/bootstrap';
        address = target.href;
      } else {
        await client.unsafe('CREATE TABLE fingerprints (id TEXT PRIMARY KEY, "deviceId" TEXT NOT NULL, data JSON NOT NULL, timestamp TEXT NOT NULL)');
      }
    } finally {
      await client.end();
    }
  }
  const factory = { postgres: api.createPostgresAdapter, sqlite: api.createSqliteAdapter, redis: api.createRedisAdapter }[backend];
  const adapter = factory(address);
  Date.now = () => now;
  await adapter.init();
  const report = { backend, exposesClose: typeof adapter.close === 'function' };
  if (phase === 'bootstrap') {
    report.save = await observe(async () => ({ preservesCallerId: await adapter.save(snapshots[0]) === snapshots[0].id }));
    process.stdout.write(JSON.stringify(report), () => process.exit(0));
    return;
  }
  if (phase === 'write') {
    const ids = [];
    for (const snapshot of snapshots) ids.push(await adapter.save(snapshot));
    const duplicate = await adapter.save({ ...snapshots[0], id: 'duplicate', deviceId: 'different-device' });
    report.duplicateReturnsFirstId = duplicate === ids[0];
    report.uniqueSavedIds = new Set(ids).size;
    for (const row of await adapter.getAllFingerprints()) {
      const index = snapshots.findIndex(snapshot => snapshot.fingerprint.label === row.fingerprint.label);
      assert.equal(row.id, ids[index], 'Stored ID differs from save return value');
    }
    await adapter.linkToUser('device-alpha', 'linked-user');
    const query = { ...snapshots[0].fingerprint, canvas: snapshots[0].fingerprint.canvas.split('').reverse().join('') };
    report.candidates = await observe(() => adapter.findCandidates(query, 0, 10));
    report.limitedCandidates = await observe(() => adapter.findCandidates(query, 0, 1));
  }
  report.history = summarize(await adapter.getHistory('device-alpha'));
  report.limitedHistory = summarize(await adapter.getHistory('device-alpha', 1));
  const all = await adapter.getAllFingerprints();
  report.identities = Object.fromEntries(all.map(row => [row.fingerprint.label, row.id]));
  for (const row of await adapter.getHistory('device-alpha')) {
    assert.equal(row.id, report.identities[row.fingerprint.label], 'History ID differs from stored ID');
  }
  report.all = summarize(all).sort((left, right) => left.label.localeCompare(right.label, 'en'));
  if (phase === 'prune') {
    report.deleted = await adapter.deleteOldSnapshots(7);
    report.remaining = summarize(await adapter.getAllFingerprints()).sort((left, right) => left.label.localeCompare(right.label, 'en'));
  }
  if (backend === 'redis') {
    const { default: Redis } = await import('ioredis');
    const client = new Redis(address, { connectTimeout: 5000, maxRetriesPerRequest: 1, retryStrategy: () => null });
    try {
      report.keys = [];
      for (const key of (await client.keys('*')).sort()) {
        const ttl = await client.ttl(key);
        if (key.startsWith('fp:')) assert.ok(ttl > 90 * 86400 - 30 && ttl <= 90 * 86400, `Unexpected TTL: ${key}`);
        else assert.equal(ttl, -1, `Unexpected index TTL: ${key}`);
        report.keys.push({ key, type: await client.type(key), expiry: ttl === -1 ? 'persistent' : '90-days' });
      }
      report.linkedUserField = await client.hget('fp:device:device-alpha', 'userId');
      if (phase === 'expire') {
        await client.expire('fp:device:device-alpha', 0);
        await client.expire('fp:latest:device-alpha', 0);
        report.remaining = summarize(await adapter.getAllFingerprints());
        report.danglingDeviceIndex = await client.sismember('idx:devices', 'device-alpha');
        report.candidatesAfterExpiry = await adapter.findCandidates(snapshots[0].fingerprint, 0, 10);
      }
    } finally {
      await client.quit();
    }
  }
  if (adapter.close) await adapter.close();
  process.stdout.write(JSON.stringify(report), () => process.exit(0));
}

function runWorker(directory, backend, address, phase) {
  const report = JSON.parse(execFileSync(process.execPath, [script, '--worker', resolve(directory, 'dist/main.js'), backend, address, phase], {
    encoding: 'utf8',
    timeout: 30_000,
  }));
  if (phase === 'write') identitiesByStore.set(address, report.identities);
  else if (phase !== 'bootstrap') assert.deepStrictEqual(report.identities, identitiesByStore.get(address), 'Stored IDs changed across processes or packages');
  delete report.identities;
  return report;
}

async function containerConfig(workspace, backend) {
  const service = backend === 'postgres' ? {
    image: images[backend],
    environment: { POSTGRES_USER: 'devicer', POSTGRES_DB: 'compat', POSTGRES_HOST_AUTH_METHOD: 'trust' },
    healthcheck: {
      test: ['CMD', 'pg_isready', '-h', '127.0.0.1', '-U', 'devicer', '-d', 'compat'],
      interval: '1s', timeout: '2s', retries: 30,
    },
  } : {
    image: images[backend],
    command: ['redis-server', '--save', '', '--appendonly', 'no', '--port', '0', '--unixsocket', '/sockets/redis.sock', '--unixsocketperm', '777'],
    healthcheck: { test: ['CMD', 'redis-cli', '-s', '/sockets/redis.sock', 'ping'], interval: '1s', timeout: '2s', retries: 30 },
  };
  const services = {};
  for (const name of ['reference', 'candidate']) {
    const sockets = resolve(workspace, name);
    await mkdir(sockets);
    await chmod(sockets, 0o777);
    services[name] = { ...service, volumes: [`${sockets}:${backend === 'postgres' ? '/var/run/postgresql' : '/sockets'}`] };
  }
  const file = resolve(workspace, 'compose.json');
  await writeFile(file, JSON.stringify({ services }));
  return ['compose', '--project-name', `devicer-compat-${process.pid}`, '--file', file];
}

function containerAddress(workspace, service) {
  return resolve(workspace, service);
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--worker') return worker(...args.slice(1));
  const backend = args[0];
  assert.ok(['sqlite', 'postgres', 'redis'].includes(backend) && (args.length === 1 || (args.length === 2 && args[1] === '--record')),
    'Usage: compat-storage.mjs <sqlite|postgres|redis> [--record]');
  execFileSync(process.execPath, [resolve(root, 'scripts/compat-v2.mjs'), '--pack'], { stdio: 'inherit' });
  const workspace = await mkdtemp(resolve(root, '.compat-cache/storage-'));
  const compose = backend === 'sqlite' ? null : await containerConfig(workspace, backend);
  try {
    if (compose) execFileSync('docker', [...compose, 'up', '--detach', '--wait', '--wait-timeout', '60'], { stdio: 'inherit' });
    const oracle = resolve(root, '.compat-cache/oracle/package');
    const candidate = resolve(root, '.compat-cache/packed/package');
    const referenceAddress = compose ? containerAddress(workspace, 'reference') : resolve(workspace, 'oracle.sqlite');
    const candidateAddress = compose ? containerAddress(workspace, 'candidate') : resolve(workspace, 'candidate.sqlite');
    const reference = {
      ...(backend === 'postgres' ? { bootstrap: runWorker(oracle, backend, referenceAddress, 'bootstrap') } : {}),
      write: runWorker(oracle, backend, referenceAddress, 'write'),
      reopen: runWorker(oracle, backend, referenceAddress, 'read'),
    };
    const actual = {
      ...(backend === 'postgres' ? { bootstrap: runWorker(candidate, backend, candidateAddress, 'bootstrap') } : {}),
      write: runWorker(candidate, backend, candidateAddress, 'write'),
      reopen: runWorker(candidate, backend, candidateAddress, 'read'),
    };
    assert.deepStrictEqual(actual, reference, `${backend} candidate differs from published oracle`);
    assert.deepStrictEqual(runWorker(candidate, backend, referenceAddress, 'read'), reference.reopen,
      'Candidate cannot read oracle database');
    assert.deepStrictEqual(runWorker(oracle, backend, candidateAddress, 'read'), reference.reopen,
      'Oracle cannot read candidate database');
    reference.prune = runWorker(oracle, backend, referenceAddress, 'prune');
    assert.deepStrictEqual(runWorker(candidate, backend, candidateAddress, 'prune'), reference.prune,
      `${backend} pruning differs`);
    if (backend === 'redis') {
      reference.expire = runWorker(oracle, backend, referenceAddress, 'expire');
      assert.deepStrictEqual(runWorker(candidate, backend, candidateAddress, 'expire'), reference.expire,
        'Redis expiry behavior differs');
    }
    const fixture = resolve(root, `tests/compat/storage-${backend}-v2.0.3.json`);
    if (args[1] === '--record') {
      await mkdir(dirname(fixture), { recursive: true });
      await writeFile(fixture, `${JSON.stringify(reference, null, 2)}\n`);
    } else {
      assert.deepStrictEqual(reference, JSON.parse(await readFile(fixture, 'utf8')), `${backend} oracle changed`);
    }
    console.log(`${backend} live behavior parity passed${backend === 'postgres' ? ' (includes expected legacy SQL failures)' : ''}.`);
  } finally {
    if (compose) execFileSync('docker', [...compose, 'down', '--volumes', '--remove-orphans'], { stdio: 'inherit' });
    await rm(workspace, { recursive: true, force: true });
  }
}

await main();