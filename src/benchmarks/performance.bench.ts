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

describe('Performance', () => {
  // ── Pure scorer (always works) ──
  bench('calculateConfidence (hybrid scorer)', () => {
    calculateConfidence(base, mutated);
  });

  // ── In-Memory (creation moved inside for debug) ──
  bench('DeviceManager.identify (In-Memory)', async () => {
    try {
      inMemoryAdapter.deleteOldSnapshots(0); // Clear all entries before bench

			// Warmup
      for (let i = 0; i < 10; i++) {
        await inMemoryManager.identify(base, { userId: 'warmup' });
      }

			// Bench
      for (let i = 0; i < 20; i++) {
        await inMemoryManager.identify(base, { userId: `bench-${i}` });
      }
    } catch (err: any) {
      console.error('❌ In-Memory FAILED:', err.message || err);
      console.error(err.stack);
      throw err;
    }
  }, { time: 6000, iterations: 50 });

  // ── SQLite in-memory ──
  bench('DeviceManager.identify (SQLite in-memory)', async () => {
    try {
			sqliteInMemoryAdapter.deleteOldSnapshots(0); // Clear all entries before bench

      // Call init if your adapter has it
      if (typeof (sqliteInMemoryAdapter as any).init === 'function') {
        await (sqliteInMemoryAdapter as any).init();
      }

      // Warmup
      for (let i = 0; i < 10; i++) {
        await sqliteInMemoryManager.identify(base, { userId: 'warmup' });
      }

			// Bench
      for (let i = 0; i < 20; i++) {
        await sqliteInMemoryManager.identify(base, { userId: `bench-${i}` });
      }
    } catch (err: any) {
      console.error('❌ SQLite FAILED:', err.message || err);
      console.error(err.stack);
      throw err;
    }
  }, { time: 6000, iterations: 50 });

	// ── SQLite file-based (realistic) ──
	bench('DeviceManager.identify (SQLite file-based)', async () => {
		try {
			sqliteFileAdapter.deleteOldSnapshots(0); // Clear all entries before bench
			
			// Call init if your adapter has it
			if (typeof (sqliteFileAdapter as any).init === 'function') {
				await (sqliteFileAdapter as any).init();
			}

			// Warmup
			for (let i = 0; i < 10; i++) {
				await sqliteFileManager.identify(base, { userId: 'warmup' });
			}
			
			// Bench
			for (let i = 0; i < 20; i++) {
				await sqliteFileManager.identify(base, { userId: `bench-${i}` });
			}
		} catch (err: any) {
			console.error('❌ SQLite FAILED:', err.message || err);
			console.error(err.stack);
			throw err;
		}
	}, { time: 6000, iterations: 50 });
});