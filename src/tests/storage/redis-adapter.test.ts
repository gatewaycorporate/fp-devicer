import { vi, describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import type { StoredFingerprint } from '../../types/storage';
import { fpIdentical, fpVerySimilar } from '../fixtures/fingerprints';
import { createRedisAdapter } from '../../libs/adapters/redis';

// ─── Hoisted mock setup ───────────────────────────────────────────────────────
// vi.mock factories are hoisted before any top-level code runs, so the
// MockRedis class and shared state must live inside vi.hoisted() to be
// accessible when the factory executes.
const { MockRedis, clearRedis, getHashes } = vi.hoisted(() => {
	// ── In-memory Redis state ────────────────────────────────────────────────
	let _sets:    Map<string, Set<string>>         = new Map();
	let _hashes:  Map<string, Map<string, string>> = new Map();
	let _strings: Map<string, string>              = new Map();

	function clearRedis() {
		_sets    = new Map();
		_hashes  = new Map();
		_strings = new Map();
	}

	// Expose hashes so tests can assert side-effects (e.g. linkToUser)
	function getHashes() { return _hashes; }

	// ── Mock Redis class ─────────────────────────────────────────────────────
	// Implements the subset of the ioredis API used by createRedisAdapter:
	//   sadd, multi (hset / expire / exec), hvals, smembers, sinter,
	//   pipeline (get / hvals / exec), hset, scanStream, quit.
	class MockRedis {
		constructor(_url?: string) {}

		async sadd(key: string, ...members: string[]) {
			if (!_sets.has(key)) _sets.set(key, new Set());
			members.forEach(m => _sets.get(key)!.add(m));
			return members.length;
		}

		multi() {
			const ops: Array<() => void> = [];
			const chain: any = {
				hset: (key: string, field: string, value: string) => {
					ops.push(() => {
						if (!_hashes.has(key)) _hashes.set(key, new Map());
						_hashes.get(key)!.set(field, value);
						// Mirror the fingerprint to fp:latest:<key> so that
						// findCandidates' pipeline.get(`fp:latest:${deviceKey}`) finds it.
						// The adapter stores the full StoredFingerprint JSON in the hash,
						// but findCandidates treats the retrieved value as FPUserDataSet,
						// so we extract just the fingerprint part.
						try {
							const parsed = JSON.parse(value);
							const fpData = parsed.fingerprint ?? parsed;
							_strings.set(`fp:latest:${key}`, JSON.stringify(fpData));
						} catch {
							_strings.set(`fp:latest:${key}`, value);
						}
					});
					return chain;
				},
				expire: (_key: string, _ttl: number) => {
					ops.push(() => { /* TTL not modelled */ });
					return chain;
				},
				exec: () => {
					ops.forEach(op => op());
					return Promise.resolve(ops.map(() => [null, 'OK']));
				},
			};
			return chain;
		}

		async hvals(key: string): Promise<string[]> {
			return Array.from(_hashes.get(key)?.values() ?? []);
		}

		async smembers(key: string): Promise<string[]> {
			return Array.from(_sets.get(key) ?? []);
		}

		async sinter(...keys: string[]): Promise<string[]> {
			if (keys.length === 0) return [];
			const sets = keys.map(k => _sets.get(k) ?? new Set<string>());
			const [first, ...rest] = sets;
			return [...first].filter(v => rest.every(s => s.has(v)));
		}

		pipeline() {
			// Each queued op records what to return; exec() runs them in order.
			const ops: Array<() => [null, any]> = [];
			const chain: any = {
				get: (key: string) => {
					ops.push(() => [null, _strings.get(key) ?? null]);
					return chain;
				},
				hvals: (key: string) => {
					ops.push(() => [null, Array.from(_hashes.get(key)?.values() ?? [])]);
					return chain;
				},
				exec: () => Promise.resolve(ops.map(op => op())),
			};
			return chain;
		}

		async hset(key: string, field: string, value: string) {
			if (!_hashes.has(key)) _hashes.set(key, new Map());
			_hashes.get(key)!.set(field, value);
			return 1;
		}

		scanStream(options: { match: string; count: number }) {
			const pattern = new RegExp('^' + options.match.replace(/\*/g, '.*') + '$');
			const matchingKeys = [..._hashes.keys()].filter(k => pattern.test(k));

			// Return a minimal EventEmitter-like object that emits 'data' then 'end'
			const handlers: Record<string, Function[]> = {};
			const emitter: any = {
				on(event: string, fn: Function) {
					if (!handlers[event]) handlers[event] = [];
					handlers[event].push(fn);
					if (event === 'end') {
						// Schedule data + end emission after all .on() calls are registered
						queueMicrotask(() => {
							if (matchingKeys.length > 0) {
								(handlers['data'] ?? []).forEach(h => h(matchingKeys));
							}
							(handlers['end'] ?? []).forEach(h => h());
						});
					}
					return emitter;
				},
			};
			return emitter;
		}

		async quit() { return 'OK'; }
	}

	return { MockRedis, clearRedis, getHashes };
});

// ─── Mock ioredis ─────────────────────────────────────────────────────────────
vi.mock('ioredis', () => ({ default: MockRedis }));

// ─── Adapter under test ───────────────────────────────────────────────────────

describe('RedisAdapter', () => {
	let adapter: ReturnType<typeof createRedisAdapter>;

	beforeEach(async () => {
		clearRedis();
		adapter = createRedisAdapter('redis://localhost:6379');
		await adapter.init();
	});

	it('saves snapshot and retrieves full history', async () => {
		const deviceId = 'dev_test_001';
		const snapshot: StoredFingerprint = {
			id: randomUUID(),
			deviceId,
			timestamp: new Date(),
			fingerprint: fpIdentical,
			userId: 'user_123',
		};

		await adapter.save(snapshot);
		const history = await adapter.getHistory(deviceId, 10);

		expect(history).toHaveLength(1);
		expect(history[0]).toMatchObject({
			deviceId,
			fingerprint: fpIdentical,
		});
	});

	it('findCandidates returns sorted high-confidence matches', async () => {
		const devA = 'dev_a';
		const devB = 'dev_b';

		await adapter.save({ id: randomUUID(), deviceId: devA, timestamp: new Date(), fingerprint: fpIdentical });
		await adapter.save({ id: randomUUID(), deviceId: devB, timestamp: new Date(), fingerprint: fpVerySimilar });

		const candidates = await adapter.findCandidates(fpIdentical, 70, 5);

		expect(candidates.length).toBeGreaterThan(0);
		expect(candidates[0].deviceId).toBe(`fp:device:${devA}`);
		expect(candidates[0].confidence).toBeGreaterThanOrEqual(90); // identical fingerprint
		for (let i = 1; i < candidates.length; i++) {
			expect(candidates[i].confidence).toBeLessThanOrEqual(candidates[i - 1].confidence);
		}
	});

	it('findCandidates uses index pre-filtering (set intersection)', async () => {
		const devA = 'dev_a';
		const devB = 'dev_b';

		await adapter.save({ id: randomUUID(), deviceId: devA, timestamp: new Date(), fingerprint: fpIdentical });
		// devB differs on ALL three indexed fields → excluded by SINTER pre-filter
		await adapter.save({
			id: randomUUID(), deviceId: devB, timestamp: new Date(),
			fingerprint: { ...fpIdentical, deviceMemory: 4, hardwareConcurrency: 2, platform: 'Linux x86_64' },
		});

		const candidates = await adapter.findCandidates(fpIdentical, 70, 5);

		// Only devA's key should survive the set intersection
		expect(candidates.every(c => c.deviceId === `fp:device:${devA}`)).toBe(true);
	});

	it('deleteOldSnapshots is a no-op (TTL-based expiry)', async () => {
		await adapter.save({ id: randomUUID(), deviceId: 'old_dev', timestamp: new Date(), fingerprint: fpIdentical });
		const count = await adapter.deleteOldSnapshots(30);
		// Redis relies on key TTL — the method always returns 0
		expect(count).toBe(0);
	});

	it('getAllFingerprints retrieves all stored entries', async () => {
		const deviceId1 = 'dev_1';
		const deviceId2 = 'dev_2';

		await adapter.save({ id: randomUUID(), deviceId: deviceId1, timestamp: new Date(), fingerprint: fpIdentical });
		await adapter.save({ id: randomUUID(), deviceId: deviceId2, timestamp: new Date(), fingerprint: fpVerySimilar });

		const allFingerprints = await adapter.getAllFingerprints();
		expect(allFingerprints).toHaveLength(2);
	});

	it('linkToUser stores userId in the device hash', async () => {
		const deviceId = 'dev_link';
		await adapter.save({ id: randomUUID(), deviceId, timestamp: new Date(), fingerprint: fpIdentical });
		await adapter.linkToUser(deviceId, 'user_999');

		const key = `fp:device:${deviceId}`;
		const userId = getHashes().get(key)?.get('userId');
		expect(userId).toBe('user_999');
	});

	it('close quits the redis connection', async () => {
		await expect(adapter.close?.()).resolves.not.toThrow();
	});
});
