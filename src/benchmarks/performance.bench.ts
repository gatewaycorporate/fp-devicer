import { bench, describe, beforeAll } from 'vitest';
import { calculateConfidence } from '../libs/confidence.js';
import { DeviceManager } from '../core/DeviceManager.js';
import { createInMemoryAdapter } from '../libs/adapters/inmemory.js';
import { createSqliteAdapter } from '../libs/adapters/sqlite.js';

import { generateDataset } from './data-generator.js';
import type { FPDataSet } from '../types/data.js';

const dataset = generateDataset(50);
const base: FPDataSet = dataset[0].data;
const mutated: FPDataSet = dataset[5].data;

const inMemoryAdapter = createInMemoryAdapter();
const sqliteInMemoryAdapter = createSqliteAdapter(':memory:');
const sqliteFileAdapter = createSqliteAdapter('./src/benchmarks/benchmark-sqlite.db');
const inMemoryManager = new DeviceManager(inMemoryAdapter);
const sqliteInMemoryManager = new DeviceManager(sqliteInMemoryAdapter);
const sqliteFileManager = new DeviceManager(sqliteFileAdapter);

await (sqliteInMemoryAdapter as any).init();
await (sqliteFileAdapter as any).init();

describe('Performance', () => {
  // ── Pure scorer (always works) ──
  bench('calculateConfidence (hybrid scorer)', () => {
    calculateConfidence(base, mutated);
  });

  // ── In-Memory ──
  describe('DeviceManager.identify (In-Memory)', () => {
    beforeAll(async () => {
      await inMemoryAdapter.deleteOldSnapshots(0);
      for (let i = 0; i < 5; i++) {
        await inMemoryManager.identify(base, { userId: 'warmup' });
      }
    });

    bench('DeviceManager.identify (In-Memory)', async () => {
      await inMemoryManager.identify(base, { userId: 'bench' });
    }, { time: 6000, iterations: 50 });
  });

  // ── SQLite in-memory ──
  describe('DeviceManager.identify (SQLite in-memory)', () => {
    beforeAll(async () => {
      await sqliteInMemoryAdapter.deleteOldSnapshots(0);
      for (let i = 0; i < 5; i++) {
        await sqliteInMemoryManager.identify(base, { userId: 'warmup' });
      }
    });

    bench('DeviceManager.identify (SQLite in-memory)', async () => {
      await sqliteInMemoryManager.identify(base, { userId: 'bench' });
    }, { time: 6000, iterations: 50 });
  });

  // ── SQLite file-based (realistic) ──
  describe('DeviceManager.identify (SQLite file-based)', () => {
    beforeAll(async () => {
      await sqliteFileAdapter.deleteOldSnapshots(0);
      for (let i = 0; i < 5; i++) {
        await sqliteFileManager.identify(base, { userId: 'warmup' });
      }
    });

    bench('DeviceManager.identify (SQLite file-based)', async () => {
      await sqliteFileManager.identify(base, { userId: 'bench' });
    }, { time: 6000, iterations: 50 });
  });
});