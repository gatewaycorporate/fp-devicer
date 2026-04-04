import type { IdentityEdge, RelatedDevice } from "../types/identity-graph.js";

/**
 * In-memory identity graph that tracks weighted relationships between distinct
 * device identifiers.
 *
 * Edges are un-directed but stored with a canonical ordering
 * (`deviceIdA < deviceIdB` lexicographically) so each pair is represented
 * by exactly one entry.
 *
 * This implementation is suitable for single-process deployments. For
 * horizontally-scaled environments, edges should be persisted via a shared
 * store and loaded on startup.
 */
export class IdentityGraph {
  /** Map of `"${deviceIdA}||${deviceIdB}"` → {@link IdentityEdge}. */
  private readonly edges = new Map<string, IdentityEdge>();

  private static canonicalKey(a: string, b: string): { key: string; a: string; b: string } {
    const [dA, dB] = a < b ? [a, b] : [b, a];
    return { key: `${dA}||${dB}`, a: dA, b: dB };
  }

  /**
   * Add or reinforce a relationship edge between two devices.
   *
   * If an edge already exists for this pair the weight is blended upward
   * (`new = max(0.97, old + increment)`) and the occurrence count is bumped.
   * New reasons are merged into the existing set without duplication.
   *
   * @param deviceIdA  - First device identifier.
   * @param deviceIdB  - Second device identifier (must differ from A).
   * @param reason     - Human-readable signal that produced this observation.
   * @param weight     - Strength of this individual observation in `[0, 1]`.
   *                     Defaults to `0.3`.
   */
  addEdge(deviceIdA: string, deviceIdB: string, reason: string, weight = 0.3): void {
    if (deviceIdA === deviceIdB) return;
    const { key, a, b } = IdentityGraph.canonicalKey(deviceIdA, deviceIdB);

    const now = new Date();
    const existing = this.edges.get(key);
    if (existing) {
      // Blend: additive, capped at 0.97 so no edge ever reaches certainty
      existing.weight = Math.min(0.97, existing.weight + weight * 0.5);
      if (!existing.reasons.includes(reason)) {
        existing.reasons.push(reason);
      }
      existing.lastSeen = now;
      existing.occurrences += 1;
    } else {
      this.edges.set(key, {
        deviceIdA: a,
        deviceIdB: b,
        weight: Math.min(0.97, weight),
        reasons: [reason],
        firstSeen: now,
        lastSeen: now,
        occurrences: 1,
      });
    }
  }

  /**
   * Return all devices that share an identity edge with the given device,
   * sorted by descending edge weight.
   *
   * @param deviceId - The device to look up.
   * @returns        An array of {@link RelatedDevice}, or an empty array if
   *                 no edges are known for this device.
   */
  getRelated(deviceId: string): RelatedDevice[] {
    const results: RelatedDevice[] = [];
    for (const edge of this.edges.values()) {
      let relatedId: string | null = null;
      if (edge.deviceIdA === deviceId) relatedId = edge.deviceIdB;
      else if (edge.deviceIdB === deviceId) relatedId = edge.deviceIdA;

      if (relatedId !== null) {
        results.push({
          deviceId: relatedId,
          edgeWeight: edge.weight,
          reasons: [...edge.reasons],
          lastSeen: edge.lastSeen,
          occurrences: edge.occurrences,
        });
      }
    }
    return results.sort((a, b) => b.edgeWeight - a.edgeWeight);
  }

  /**
   * Return the raw edge between two specific devices, or `undefined` if none
   * exists.
   */
  getEdge(deviceIdA: string, deviceIdB: string): IdentityEdge | undefined {
    const { key } = IdentityGraph.canonicalKey(deviceIdA, deviceIdB);
    return this.edges.get(key);
  }

  /**
   * Remove edges whose `lastSeen` is older than `maxAgeMs` milliseconds.
   *
   * An edge is considered stale when `edge.lastSeen + maxAgeMs <= Date.now()`,
   * so `prune(0)` removes all edges regardless of age.
   *
   * @param maxAgeMs - Maximum allowed edge staleness in milliseconds.
   * @returns        The number of edges pruned.
   */
  prune(maxAgeMs: number): number {
    const now = Date.now();
    let pruned = 0;
    for (const [key, edge] of this.edges) {
      if (edge.lastSeen.getTime() + maxAgeMs <= now) {
        this.edges.delete(key);
        pruned++;
      }
    }
    return pruned;
  }

  /** Total number of edges currently in the graph. */
  size(): number {
    return this.edges.size;
  }

  /** Return a snapshot of all edges (for inspection / serialisation). */
  allEdges(): IdentityEdge[] {
    return [...this.edges.values()];
  }
}

// ─── Utility helpers ─────────────────────────────────────────────────────────

/**
 * Extract the `/24` subnet string from an IPv4 address.
 * Returns `null` for IPv6 or malformed addresses.
 *
 * @example subnetKey("192.168.1.123") // → "192.168.1"
 */
export function subnetKey(ip: string): string | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  if (parts.some((p) => Number.isNaN(Number(p)))) return null;
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

/**
 * Compute the Jaccard similarity between two string arrays.
 * Returns `0` when both arrays are empty.
 */
export function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
