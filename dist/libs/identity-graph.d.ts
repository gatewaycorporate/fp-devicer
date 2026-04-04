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
export declare class IdentityGraph {
    /** Map of `"${deviceIdA}||${deviceIdB}"` → {@link IdentityEdge}. */
    private readonly edges;
    private static canonicalKey;
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
    addEdge(deviceIdA: string, deviceIdB: string, reason: string, weight?: number): void;
    /**
     * Return all devices that share an identity edge with the given device,
     * sorted by descending edge weight.
     *
     * @param deviceId - The device to look up.
     * @returns        An array of {@link RelatedDevice}, or an empty array if
     *                 no edges are known for this device.
     */
    getRelated(deviceId: string): RelatedDevice[];
    /**
     * Return the raw edge between two specific devices, or `undefined` if none
     * exists.
     */
    getEdge(deviceIdA: string, deviceIdB: string): IdentityEdge | undefined;
    /**
     * Remove edges whose `lastSeen` is older than `maxAgeMs` milliseconds.
     *
     * An edge is considered stale when `edge.lastSeen + maxAgeMs <= Date.now()`,
     * so `prune(0)` removes all edges regardless of age.
     *
     * @param maxAgeMs - Maximum allowed edge staleness in milliseconds.
     * @returns        The number of edges pruned.
     */
    prune(maxAgeMs: number): number;
    /** Total number of edges currently in the graph. */
    size(): number;
    /** Return a snapshot of all edges (for inspection / serialisation). */
    allEdges(): IdentityEdge[];
}
/**
 * Extract the `/24` subnet string from an IPv4 address.
 * Returns `null` for IPv6 or malformed addresses.
 *
 * @example subnetKey("192.168.1.123") // → "192.168.1"
 */
export declare function subnetKey(ip: string): string | null;
/**
 * Compute the Jaccard similarity between two string arrays.
 * Returns `0` when both arrays are empty.
 */
export declare function jaccardSimilarity(a: string[], b: string[]): number;
//# sourceMappingURL=identity-graph.d.ts.map