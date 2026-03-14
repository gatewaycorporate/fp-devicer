import { vi, describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import type { StoredFingerprint } from '../../types/storage';
import { fpIdentical, fpVerySimilar, fpDifferent } from '../fixtures/fingerprints';
import { createPostgresAdapter } from '../../libs/adapters/postgres';

// ─── In-memory store ──────────────────────────────────────────────────────────
type Row = { id: string; deviceId: string; data: any; timestamp: string };
let _rows: Row[] = [];
function clearRows() { _rows = []; }

// ─── Column stub ─────────────────────────────────────────────────────────────
// Returned by the mocked column helpers so that `eq` / `lt` calls that receive
// a column can read `.name` back to know which field to filter on.
function makeCol(name: string) {
	const col: any = { name };
	col.primaryKey = () => col;
	col.notNull     = () => col;
	col.$type       = () => col;
	return col;
}

// ─── Chainable select builder ─────────────────────────────────────────────────
function makeSelectBuilder(source: () => Row[]) {
	let filtered: Row[] = [];
	const b: any = {
		from: (_t: any) => { filtered = source(); return b; },
		where: (cond: any) => {
			if (!cond) return b;
			if (cond._type === 'eq') {
				filtered = filtered.filter(r => (r as any)[cond.field] === cond.value);
			} else if (cond._type === 'lt') {
				filtered = filtered.filter(r => (r as any)[cond.field] < cond.value);
			} else if (cond._type === 'sql_prelim') {
				// Mirrors the JSON extraction WHERE clause in postgres.ts findCandidates
				filtered = filtered.filter(r => {
					const fp = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
					return fp?.deviceMemory === cond.dm
						|| fp?.hardwareConcurrency === cond.hc
						|| fp?.platform === cond.platform;
				});
			}
			return b;
		},
		orderBy: (col: any) => {
			if (col?._desc) {
				filtered = [...filtered].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
			}
			return b;
		},
		limit: (n: number) => Promise.resolve(filtered.slice(0, n)),
		// Make the builder itself thenable so `await db.select().from(t).where(c)` works
		// without a trailing `.limit()` call (used in findCandidates / getAllFingerprints)
		then: (resolve: any, reject: any) => Promise.resolve(filtered).then(resolve, reject),
	};
	return b;
}

// ─── Chainable delete builder ─────────────────────────────────────────────────
function makeDeleteBuilder() {
	return {
		where: (cond: any) => ({
			returning: () => {
				const before = _rows.length;
				if (cond?._type === 'lt') {
					_rows = _rows.filter(r => !((r as any)[cond.field] < cond.value));
				}
				const deleted = before - _rows.length;
				return Promise.resolve(Array(deleted).fill({}));
			},
		}),
	};
}

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('drizzle-orm/postgres-js', () => ({
	drizzle: () => ({
		execute: vi.fn().mockResolvedValue(undefined),
		insert: (_t: any) => ({
			values: (record: any) => {
				_rows.push(record);
				return Promise.resolve();
			},
		}),
		select: () => makeSelectBuilder(() => [..._rows]),
		delete: (_t: any) => makeDeleteBuilder(),
	}),
}));

vi.mock('drizzle-orm/pg-core', () => ({
	pgTable: (_name: string, cols: any) => cols,
	text: (name: string) => makeCol(name),
	json: (name: string) => makeCol(name),
}));

// The `sql` tag is used both for the CREATE TABLE in `init()` (via `db.execute`)
// and for the prelim WHERE clause in `findCandidates`.  Only the latter passes
// interpolated values (deviceMemory, hardwareConcurrency, platform in that order).
vi.mock('drizzle-orm/sql', () => ({
	sql: (strings: TemplateStringsArray, ...values: any[]) => ({
		_type: 'sql_prelim',
		dm: values[0],
		hc: values[1],
		platform: values[2],
	}),
}));

vi.mock('drizzle-orm/sql/expressions/conditions', () => ({
	eq: (col: any, val: any) => ({ _type: 'eq', field: col?.name ?? col, value: val }),
	lt: (col: any, val: any) => ({ _type: 'lt', field: col?.name ?? col, value: val }),
}));

vi.mock('drizzle-orm/sql/expressions/select', () => ({
	desc: (col: any) => ({ ...(col ?? {}), _desc: true }),
}));

// ─── Adapter under test ───────────────────────────────────────────────────────

describe('PostgresAdapter', () => {
	let adapter: ReturnType<typeof createPostgresAdapter>;

	beforeEach(async () => {
		clearRows();
		adapter = createPostgresAdapter('postgresql://localhost/test');
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
			timestamp: expect.any(Date),
		});
	});

	it('findCandidates returns sorted high-confidence matches', async () => {
		const devA = 'dev_a';
		const devB = 'dev_b';

		await adapter.save({ id: randomUUID(), deviceId: devA, timestamp: new Date(), fingerprint: fpIdentical });
		await adapter.save({ id: randomUUID(), deviceId: devB, timestamp: new Date(), fingerprint: fpVerySimilar });

		const candidates = await adapter.findCandidates(fpIdentical, 70, 5);

		expect(candidates.length).toBeGreaterThan(0);
		expect(candidates[0].deviceId).toBe(devA);
		expect(candidates[0].confidence).toBeGreaterThanOrEqual(90); // identical fingerprint
		for (let i = 1; i < candidates.length; i++) {
			expect(candidates[i].confidence).toBeLessThanOrEqual(candidates[i - 1].confidence);
		}
	});

	it('findCandidates uses quick pre-filtering', async () => {
		const devA = 'dev_a';
		const devB = 'dev_b';

		await adapter.save({ id: randomUUID(), deviceId: devA, timestamp: new Date(), fingerprint: fpIdentical });
		// devB differs on ALL three pre-filter fields → excluded by the SQL WHERE clause
		await adapter.save({
			id: randomUUID(), deviceId: devB, timestamp: new Date(),
			fingerprint: { ...fpIdentical, deviceMemory: 4, hardwareConcurrency: 2, platform: 'Linux x86_64' },
		});

		const candidates = await adapter.findCandidates(fpIdentical, 70, 5);

		expect(candidates).toHaveLength(1);
		expect(candidates[0].deviceId).toBe(devA);
	});

	it('deleteOldSnapshots removes old entries', async () => {
		const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000); // 31 days ago
		await adapter.save({ id: randomUUID(), deviceId: 'old_dev', timestamp: oldDate, fingerprint: fpIdentical });

		const count = await adapter.deleteOldSnapshots(30);
		expect(count).toBe(1);

		const history = await adapter.getHistory('old_dev');
		expect(history).toHaveLength(0);
	});

	it('getAllFingerprints retrieves all stored entries', async () => {
		const deviceId1 = 'dev_1';
		const deviceId2 = 'dev_2';

		await adapter.save({ id: randomUUID(), deviceId: deviceId1, timestamp: new Date(), fingerprint: fpIdentical });
		await adapter.save({ id: randomUUID(), deviceId: deviceId2, timestamp: new Date(), fingerprint: fpDifferent });

		const allFingerprints = await adapter.getAllFingerprints();
		expect(allFingerprints).toHaveLength(2);
		expect(allFingerprints.map(fp => fp.deviceId)).toEqual(
			expect.arrayContaining([deviceId1, deviceId2])
		);
	});

	it('skips inserting a duplicate fingerprint hash', async () => {
		const firstId = await adapter.save({ id: randomUUID(), deviceId: 'dev_a', timestamp: new Date(), fingerprint: fpIdentical });
		const secondId = await adapter.save({ id: randomUUID(), deviceId: 'dev_b', timestamp: new Date(), fingerprint: fpIdentical });

		const allFingerprints = await adapter.getAllFingerprints();
		expect(allFingerprints).toHaveLength(1);
		expect(secondId).toBe(firstId);
	});
});
