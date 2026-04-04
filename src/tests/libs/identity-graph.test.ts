import { describe, it, expect, beforeEach } from 'vitest';
import { DeviceManager, createInMemoryAdapter } from '../../main.js';
import { IdentityGraph, subnetKey, jaccardSimilarity } from '../../libs/identity-graph.js';
import { fpIdentical, fpVerySimilar, fpVeryDifferent } from '../fixtures/fingerprints.js';
import { createBaseFingerprint } from '../../benchmarks/data-generator.js';

// ─── IdentityGraph unit tests ─────────────────────────────────────────────────

describe('IdentityGraph', () => {
  let graph: IdentityGraph;

  beforeEach(() => {
    graph = new IdentityGraph();
  });

  it('starts empty', () => {
    expect(graph.size()).toBe(0);
    expect(graph.allEdges()).toHaveLength(0);
  });

  it('addEdge creates a new edge', () => {
    graph.addEdge('A', 'B', 'shared-ip-subnet');
    expect(graph.size()).toBe(1);
  });

  it('addEdge is idempotent for the same pair — increments occurrences', () => {
    graph.addEdge('A', 'B', 'shared-ip-subnet');
    graph.addEdge('A', 'B', 'shared-ip-subnet');
    expect(graph.size()).toBe(1);
    expect(graph.getEdge('A', 'B')!.occurrences).toBe(2);
  });

  it('addEdge is symmetric — getEdge(A,B) === getEdge(B,A)', () => {
    graph.addEdge('X', 'Y', 'font-overlap');
    expect(graph.getEdge('X', 'Y')).toBeDefined();
    expect(graph.getEdge('Y', 'X')).toBeDefined();
    expect(graph.getEdge('X', 'Y')).toBe(graph.getEdge('Y', 'X'));
  });

  it('self-edges are silently ignored', () => {
    graph.addEdge('A', 'A', 'shared-ip-subnet');
    expect(graph.size()).toBe(0);
  });

  it('weight is blended upward on repeated observations, capped at 0.97', () => {
    graph.addEdge('A', 'B', 'shared-ip-subnet', 0.9);
    graph.addEdge('A', 'B', 'shared-ip-subnet', 0.9);
    graph.addEdge('A', 'B', 'shared-ip-subnet', 0.9);
    expect(graph.getEdge('A', 'B')!.weight).toBeLessThanOrEqual(0.97);
  });

  it('new reasons are merged without duplication', () => {
    graph.addEdge('A', 'B', 'shared-ip-subnet');
    graph.addEdge('A', 'B', 'font-overlap');
    graph.addEdge('A', 'B', 'shared-ip-subnet'); // duplicate reason
    const edge = graph.getEdge('A', 'B')!;
    expect(edge.reasons).toEqual(['shared-ip-subnet', 'font-overlap']);
  });

  it('getRelated returns correct related devices sorted by weight', () => {
    graph.addEdge('device1', 'device2', 'shared-ip-subnet', 0.6);
    graph.addEdge('device1', 'device3', 'font-overlap', 0.3);

    const related = graph.getRelated('device1');
    expect(related).toHaveLength(2);
    expect(related[0].deviceId).toBe('device2');
    expect(related[1].deviceId).toBe('device3');
    // Sorted descending by edgeWeight
    expect(related[0].edgeWeight).toBeGreaterThanOrEqual(related[1].edgeWeight);
  });

  it('getRelated returns empty array for unknown device', () => {
    graph.addEdge('A', 'B', 'shared-ip-subnet');
    expect(graph.getRelated('unknown')).toHaveLength(0);
  });

  it('prune removes edges older than maxAgeMs', () => {
    graph.addEdge('A', 'B', 'shared-ip-subnet');
    graph.addEdge('C', 'D', 'font-overlap');
    // Both edges were just created; prune with 0ms (age > 0 → all stale)
    const removed = graph.prune(0);
    expect(removed).toBe(2);
    expect(graph.size()).toBe(0);
  });

  it('prune does not remove fresh edges', () => {
    graph.addEdge('A', 'B', 'shared-ip-subnet');
    const removed = graph.prune(60_000); // 60 second window — edge is fresh
    expect(removed).toBe(0);
    expect(graph.size()).toBe(1);
  });

  it('allEdges returns all stored edges', () => {
    graph.addEdge('P', 'Q', 'shared-ip-subnet');
    graph.addEdge('Q', 'R', 'font-overlap');
    expect(graph.allEdges()).toHaveLength(2);
  });
});

// ─── subnetKey helper ─────────────────────────────────────────────────────────

describe('subnetKey', () => {
  it('extracts /24 prefix from a valid IPv4 address', () => {
    expect(subnetKey('192.168.1.123')).toBe('192.168.1');
    expect(subnetKey('10.0.0.1')).toBe('10.0.0');
    expect(subnetKey('255.255.255.0')).toBe('255.255.255');
  });

  it('returns null for IPv6 addresses', () => {
    expect(subnetKey('::1')).toBeNull();
    expect(subnetKey('2001:db8::1')).toBeNull();
  });

  it('returns null for malformed addresses', () => {
    expect(subnetKey('not-an-ip')).toBeNull();
    expect(subnetKey('1.2.3')).toBeNull();
    expect(subnetKey('')).toBeNull();
  });
});

// ─── jaccardSimilarity helper ─────────────────────────────────────────────────

describe('jaccardSimilarity', () => {
  it('returns 1 for identical arrays', () => {
    expect(jaccardSimilarity(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(1);
  });

  it('returns 0 for completely disjoint arrays', () => {
    expect(jaccardSimilarity(['a', 'b'], ['c', 'd'])).toBe(0);
  });

  it('returns 1 for two empty arrays', () => {
    expect(jaccardSimilarity([], [])).toBe(1);
  });

  it('computes partial overlap correctly', () => {
    // |{a,b} ∩ {b,c}| = 1,  |{a,b} ∪ {b,c}| = 3  → 1/3
    expect(jaccardSimilarity(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3);
  });
});

// ─── DeviceManager identity graph integration ─────────────────────────────────

describe('DeviceManager – identity graph', () => {
  let manager: DeviceManager;
  let adapter: ReturnType<typeof createInMemoryAdapter>;

  beforeEach(() => {
    adapter = createInMemoryAdapter();
    manager = new DeviceManager(adapter, { dedupWindowMs: 0 });
  });

  it('getIdentityGraph returns the graph instance', () => {
    const graph = manager.getIdentityGraph();
    expect(graph).toBeInstanceOf(IdentityGraph);
  });

  it('findRelatedDevices returns empty array for unknown device', () => {
    const related = manager.findRelatedDevices('nonexistent');
    expect(related).toHaveLength(0);
  });

  it('adds shared-ip-subnet edge when two devices are seen from the same /24', async () => {
    // fpIdentical and fpVeryDifferent are fixed fixtures guaranteed to produce
    // distinct devices (fpVeryDifferent scores < 50 against fpIdentical).
    const result1 = await manager.identify(fpIdentical, { ip: '10.0.0.1' });
    const result2 = await manager.identify(fpVeryDifferent, { ip: '10.0.0.2' });

    // The two requests should map to different device IDs.
    expect(result1.deviceId).not.toBe(result2.deviceId);

    // An edge should exist between them
    const related1 = manager.findRelatedDevices(result1.deviceId);
    const related2 = manager.findRelatedDevices(result2.deviceId);
    expect(related1.some((r) => r.deviceId === result2.deviceId)).toBe(true);
    expect(related2.some((r) => r.deviceId === result1.deviceId)).toBe(true);
  });

  it('shared-ip-subnet edge has reason "shared-ip-subnet"', async () => {
    // Use fpIdentical and fpVeryDifferent — these are guaranteed to be
    // distinct devices (fpVeryDifferent scores < 50 against fpIdentical).
    const r1 = await manager.identify(fpIdentical, { ip: '172.16.5.10' });
    const r2 = await manager.identify(fpVeryDifferent, { ip: '172.16.5.11' });

    // Confirm they are distinct devices (prerequisite for this test to be meaningful)
    expect(r1.deviceId).not.toBe(r2.deviceId);

    const related = manager.findRelatedDevices(r1.deviceId);
    const edge = related.find((r) => r.deviceId === r2.deviceId);
    expect(edge).toBeDefined();
    expect(edge!.reasons).toContain('shared-ip-subnet');
  });

  it('does not add cross-device edges for devices from different /24 subnets', async () => {
    const r1 = await manager.identify(fpIdentical, { ip: '192.168.1.1' });
    const r2 = await manager.identify(fpVeryDifferent, { ip: '10.20.30.40' }); // different /24

    const related1 = manager.findRelatedDevices(r1.deviceId);
    expect(related1.some((r) => r.deviceId === r2.deviceId)).toBe(false);
  });

  it('does not add edges when no IP is provided in context', async () => {
    await manager.identify(fpIdentical); // no ip
    await manager.identify(fpVeryDifferent); // no ip

    expect(manager.getIdentityGraph().size()).toBe(0);
  });

  it('RelatedDevice contains edgeWeight, reasons, lastSeen, occurrences', async () => {
    const r1 = await manager.identify(fpIdentical, { ip: '172.20.0.1' });
    await manager.identify(fpVeryDifferent, { ip: '172.20.0.2' });

    const related = manager.findRelatedDevices(r1.deviceId);
    expect(related.length).toBeGreaterThan(0);
    const entry = related[0];
    expect(typeof entry.edgeWeight).toBe('number');
    expect(entry.edgeWeight).toBeGreaterThan(0);
    expect(entry.edgeWeight).toBeLessThanOrEqual(1);
    expect(Array.isArray(entry.reasons)).toBe(true);
    expect(entry.lastSeen).toBeInstanceOf(Date);
    expect(typeof entry.occurrences).toBe('number');
  });

  it('edge weight is reinforced when the same two devices are seen together again', async () => {
    const r1 = await manager.identify(fpIdentical, { ip: '10.1.1.1' });
    const r2 = await manager.identify(fpVeryDifferent, { ip: '10.1.1.2' });
    expect(r1.deviceId).not.toBe(r2.deviceId);

    const weightAfterFirst = manager.getIdentityGraph().getEdge(r1.deviceId, r2.deviceId)!.weight;

    // Re-identify the first fingerprint from a different host in the same subnet
    await manager.identify(fpIdentical, { ip: '10.1.1.3' });

    const weightAfterSecond = manager.getIdentityGraph().getEdge(r1.deviceId, r2.deviceId)!.weight;
    expect(weightAfterSecond).toBeGreaterThanOrEqual(weightAfterFirst);
  });
});
