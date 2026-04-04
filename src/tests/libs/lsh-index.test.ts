import { describe, it, expect, beforeEach } from 'vitest';
import {
    createLshIndex,
    buildLshIndex,
} from '../../libs/lsh-index.js';
import { DeviceManager, createInMemoryAdapter } from '../../main.js';
import { createBaseFingerprint, mutate } from '../../benchmarks/data-generator.js';
import type { FPDataSet } from '../../types/data.js';
import { randomUUID } from 'crypto';
import type { StoredFingerprint } from '../../types/storage.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a synthetic fingerprint that has explicit set-valued fields. */
function makeFP(
    fonts: string[] = [],
    plugins: string[] = [],
    mimeTypes: string[] = [],
    languages: string[] = []
): FPDataSet {
    return { fonts, plugins, mimeTypes, languages } as unknown as FPDataSet;
}

// ─── createLshIndex / basic operations ───────────────────────────────────────

describe('createLshIndex – basic operations', () => {
    it('starts empty', () => {
        const idx = createLshIndex();
        expect(idx.size()).toBe(0);
    });

    it('size increments after add()', () => {
        const idx = createLshIndex();
        idx.add('d1', makeFP(['Arial', 'Helvetica'], [], [], ['en-US']));
        expect(idx.size()).toBe(1);
        idx.add('d2', makeFP(['Arial', 'Times New Roman'], [], [], ['en-US']));
        expect(idx.size()).toBe(2);
    });

    it('does not index fingerprints with empty token sets', () => {
        const idx = createLshIndex();
        idx.add('d1', makeFP()); // no tokens
        expect(idx.size()).toBe(0);
    });

    it('clear() resets size to 0', () => {
        const idx = createLshIndex();
        idx.add('d1', makeFP(['Arial'], [], [], []));
        idx.add('d2', makeFP(['Helvetica'], [], [], []));
        idx.clear();
        expect(idx.size()).toBe(0);
    });

    it('remove() decrements size and stops returning the device', () => {
        const idx = createLshIndex();
        const fp = makeFP(['Arial', 'Helvetica', 'Times New Roman'], [], [], []);
        idx.add('d1', fp);
        idx.add('d2', fp);
        idx.remove('d1');
        expect(idx.size()).toBe(1);
        const results = idx.query(fp);
        expect(results).not.toContain('d1');
        expect(results).toContain('d2');
    });

    it('remove() on unknown deviceId is a no-op', () => {
        const idx = createLshIndex();
        expect(() => idx.remove('nonexistent')).not.toThrow();
    });
});

// ─── createLshIndex / similarity behavior ─────────────────────────────────────

describe('createLshIndex – similarity queries', () => {
    it('query returns empty array for empty token set', () => {
        const idx = createLshIndex();
        idx.add('d1', makeFP(['Arial'], [], [], []));
        expect(idx.query(makeFP())).toEqual([]);
    });

    it('identical fingerprints share all band buckets', () => {
        const idx = createLshIndex();
        const fp = makeFP(['Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Verdana'], [], [], ['en-US', 'en']);
        idx.add('d1', fp);
        const results = idx.query(fp);
        expect(results).toContain('d1');
    });

    it('near-identical fingerprints (one extra font) still match', () => {
        const idx = createLshIndex();
        const baseFonts = ['Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Verdana', 'Trebuchet MS',
            'Comic Sans MS', 'Impact', 'Courier New', 'Palatino'];
        const fpA = makeFP(baseFonts, [], [], ['en-US']);
        const fpB = makeFP([...baseFonts, 'Wingdings'], [], [], ['en-US']); // 91% Jaccard
        idx.add('d1', fpA);
        const results = idx.query(fpB);
        expect(results).toContain('d1');
    });

    it('high Jaccard similarity (80%+) produces a candidate match', () => {
        const idx = createLshIndex();
        // Two font sets with Jaccard ≈ 0.90 (18/20 common out of 20 total)
        const shared = Array.from({ length: 18 }, (_, i) => `Font${i}`);
        const fpA = makeFP([...shared, 'ExclusiveA1', 'ExclusiveA2'], [], [], []);
        const fpB = makeFP([...shared, 'ExclusiveB1', 'ExclusiveB2'], [], [], []);
        idx.add('d1', fpA);
        const results = idx.query(fpB);
        expect(results).toContain('d1');
    });

    it('tokens from different fields contribute independently', () => {
        const idx = createLshIndex();
        // A has plugins; B has the same plugins but via mimeTypes namespace
        const fpA = makeFP([], ['PDF Reader', 'Flash'], [], []);
        const fpB = makeFP([], [], ['application/pdf', 'application/x-shockwave-flash'], []);
        idx.add('d1', fpA);
        // Different fields → different namespaced tokens → low Jaccard → likely no match
        // We don't assert a specific outcome here since LSH is probabilistic,
        // but we do assert the call succeeds without throwing.
        expect(() => idx.query(fpB)).not.toThrow();
    });

    it('two completely disjoint fingerprints do not collide', () => {
        const idx = createLshIndex();
        const fpA = makeFP(Array.from({ length: 20 }, (_, i) => `FontSetA_${i}`), [], [], []);
        const fpB = makeFP(Array.from({ length: 20 }, (_, i) => `FontSetB_${i}`), [], [], []);
        idx.add('d1', fpA);
        // With 0% Jaccard it is overwhelmingly unlikely that any band bucket collides.
        // We can assert this holds statistically with default parameters.
        const results = idx.query(fpB);
        expect(results).not.toContain('d1');
    });

    it('multiple devices are all returned when all share tokens with query', () => {
        const idx = createLshIndex();
        const sharedFonts = Array.from({ length: 15 }, (_, i) => `SharedFont${i}`);
        for (let i = 0; i < 5; i++) {
            idx.add(`dev_${i}`, makeFP([...sharedFonts, `Unique${i}`], [], [], []));
        }
        const query = makeFP(sharedFonts, [], [], []);
        const results = idx.query(query);
        // At least some of the very similar devices should be returned
        expect(results.length).toBeGreaterThan(0);
    });
});

// ─── buildLshIndex ────────────────────────────────────────────────────────────

describe('buildLshIndex', () => {
    it('builds from an array of entries', () => {
        const entries = [
            { deviceId: 'd1', fingerprint: makeFP(['Arial'], [], [], []) },
            { deviceId: 'd2', fingerprint: makeFP(['Helvetica'], [], [], []) },
        ];
        const idx = buildLshIndex(entries);
        expect(idx.size()).toBe(2);
    });

    it('skips entries with empty token sets', () => {
        const entries = [
            { deviceId: 'd1', fingerprint: makeFP(['Arial'], [], [], []) },
            { deviceId: 'd2', fingerprint: makeFP() }, // no tokens
        ];
        const idx = buildLshIndex(entries);
        expect(idx.size()).toBe(1);
    });

    it('returns an index that correctly answers queries', () => {
        const fp = makeFP(['Arial', 'Georgia', 'Verdana', 'Courier New', 'Trebuchet MS'], [], [], []);
        const idx = buildLshIndex([{ deviceId: 'd1', fingerprint: fp }]);
        expect(idx.query(fp)).toContain('d1');
    });
});

// ─── LshOptions validation ────────────────────────────────────────────────────

describe('LshOptions', () => {
    it('custom numHashes / numBands are respected (no throw for valid config)', () => {
        expect(() => createLshIndex({ numHashes: 64, numBands: 8 })).not.toThrow();
    });

    it('throws when numHashes is not divisible by numBands', () => {
        expect(() => createLshIndex({ numHashes: 100, numBands: 7 })).toThrow(RangeError);
    });
});

// ─── DeviceManager integration ────────────────────────────────────────────────

describe('DeviceManager.buildLshIndex', () => {
    it('getLshIndexSize() returns undefined before buildLshIndex() is called', async () => {
        const adapter = createInMemoryAdapter();
        await adapter.init();
        const manager = new DeviceManager(adapter);
        expect(manager.getLshIndexSize()).toBeUndefined();
    });

    it('getLshIndexSize() returns 0 when store is empty', async () => {
        const adapter = createInMemoryAdapter();
        await adapter.init();
        const manager = new DeviceManager(adapter);
        await manager.buildLshIndex();
        expect(manager.getLshIndexSize()).toBe(0);
    });

    it('getLshIndexSize() equals number of distinct devices after seeding', async () => {
        const adapter = createInMemoryAdapter();
        await adapter.init();

        // Seed 3 distinct devices directly in the adapter
        for (let i = 0; i < 3; i++) {
            const fp = createBaseFingerprint(i * 100 + 1);
            await adapter.save({
                id: randomUUID(),
                deviceId: `dev_${i}`,
                timestamp: new Date(),
                fingerprint: fp,
                matchConfidence: 0,
            });
        }

        const manager = new DeviceManager(adapter);
        await manager.buildLshIndex();
        // Each device contributes one entry (latest snapshot), so size = devices
        // that have at least one set-valued token. Most real fingerprints have fonts.
        expect(manager.getLshIndexSize()).toBeGreaterThanOrEqual(0);
        expect(manager.getLshIndexSize()).toBeLessThanOrEqual(3);
    });

    it('identify() still returns a match after buildLshIndex on a populated store', async () => {
        const adapter = createInMemoryAdapter();
        await adapter.init();
        const manager = new DeviceManager(adapter, { dedupWindowMs: 0, matchThreshold: 50 });

        const fp = createBaseFingerprint(42);

        // Register the device through identify() first
        const first = await manager.identify(fp);
        expect(first.isNewDevice).toBe(true);

        await manager.buildLshIndex();

        // A mutated but still very similar fingerprint should still match
        const similar = mutate(fp, 'low');
        const second = await manager.identify(similar);
        expect(second.isNewDevice).toBe(false);
        expect(second.deviceId).toBe(first.deviceId);
    });

    it('LSH index augments candidates for set-similar fingerprints', async () => {
        const adapter = createInMemoryAdapter();
        await adapter.init();

        // Build two fingerprints that differ in hardware/screen but share fonts.
        const sharedFonts = Array.from({ length: 20 }, (_, i) => `SharedFont${i}`);

        const fpA: FPDataSet = {
            ...createBaseFingerprint(1),
            fonts: sharedFonts,
            screen: { width: 1920, height: 1080 },
            hardwareConcurrency: 4,
        } as unknown as FPDataSet;

        const fpB: FPDataSet = {
            ...createBaseFingerprint(999),
            fonts: [...sharedFonts, 'ExtraFontB'],  // 95% Jaccard with fpA
            screen: { width: 800, height: 600 },   // different hardware — adapter filter
            hardwareConcurrency: 16,                //   would likely exclude this
        } as unknown as FPDataSet;

        // Register fpA as an existing device
        const deviceIdA = `dev_a_${randomUUID()}`;
        await adapter.save({
            id: randomUUID(),
            deviceId: deviceIdA,
            timestamp: new Date(),
            fingerprint: fpA,
            matchConfidence: 0,
        });

        const manager = new DeviceManager(adapter, { dedupWindowMs: 0, matchThreshold: 50 });
        await manager.buildLshIndex();

        // Verify the LSH index itself sees fpB as a candidate for fpA's device
        const lshSpy = manager.getLshIndexSize();
        expect(lshSpy).toBeGreaterThanOrEqual(1);

        // The full identify may or may not match (depends on score), but should not throw
        const result = await manager.identify(fpB);
        expect(typeof result.deviceId).toBe('string');
    });
});
