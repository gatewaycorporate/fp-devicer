import { bench, describe, beforeAll, afterAll } from 'vitest';
import { calculateConfidence } from '../libs/confidence.js';
import { DeviceManager } from '../core/DeviceManager.js';
import { createInMemoryAdapter } from '../libs/adapters/inmemory.js';
import { createSqliteAdapter } from '../libs/adapters/sqlite.js';
import { generateDataset } from './data-generator.js';
const dataset = generateDataset(100); // small set for fast benchmarks
const base = dataset[0].data;
const mutated = dataset[5].data; // same device, low mutation
describe('Performance', () => {
    // ── Pure scoring baseline (always runs fine) ──
    bench('calculateConfidence (hybrid scorer)', () => {
        calculateConfidence(base, mutated);
    });
    // ── In-Memory (for reference) ──
    let memoryManager;
    beforeAll(() => {
        memoryManager = new DeviceManager(createInMemoryAdapter());
    });
    bench('DeviceManager.identify (In-Memory)', async () => {
        await memoryManager.identify(base);
    });
    // ── SQLite (the one that was failing) ──
    let sqliteManager;
    beforeAll(async () => {
        // Use :memory: for benchmarks (fast & isolated)
        const adapter = createSqliteAdapter('./src/benchmarks/benchmark-sqlite.db');
        // If your adapter has an init() method to create tables, call it here
        if (typeof adapter.init === 'function') {
            await adapter.init();
        }
        sqliteManager = new DeviceManager(adapter);
        // Warmup (critical to avoid cold-start NaN / skewed numbers)
        for (let i = 0; i < 10; i++) {
            await sqliteManager.identify(base, { userId: 'warmup' });
        }
        console.log('✅ SQLite warmup completed');
    });
    bench('DeviceManager.identify (SQLite)', async () => {
        try {
            await sqliteManager.identify(base);
        }
        catch (err) {
            console.error('❌ SQLite identify failed inside benchmark:', err);
            throw err; // let Vitest see the real error
        }
    });
    afterAll(async () => {
        // Optional: close connections if your adapter needs it
    });
});
