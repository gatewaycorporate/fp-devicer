/**
 * A weighted relationship between two distinct device identifiers inferred
 * from common signals observed across sessions (shared IP subnet, overlapping
 * fingerprint clusters, or common user-account bindings).
 */
export interface IdentityEdge {
  /** One of the two device identifiers in the relationship. */
  deviceIdA: string;
  /** The other device identifier. */
  deviceIdB: string;
  /**
   * Combined edge weight in `[0, 1]`.  A higher value indicates a stronger
   * or more frequently observed relationship.
   */
  weight: number;
  /**
   * Human-readable signals that contributed to this edge.
   * Examples: `"shared-ip-subnet"`, `"canvas-cluster"`, `"font-overlap"`.
   */
  reasons: string[];
  /** Timestamp of the first session that created this edge. */
  firstSeen: Date;
  /** Timestamp of the most-recent session that reinforced this edge. */
  lastSeen: Date;
  /** Number of times (sessions) this relationship was observed and reinforced. */
  occurrences: number;
}

/**
 * A device that is related to a queried device via one or more identity edges.
 */
export interface RelatedDevice {
  /** The related device's stable identifier. */
  deviceId: string;
  /** Weight of the shared identity edge; cf. {@link IdentityEdge.weight}. */
  edgeWeight: number;
  /** Signals that produced the edge; cf. {@link IdentityEdge.reasons}. */
  reasons: string[];
  /** Timestamp of the most-recent session that observed the relationship. */
  lastSeen: Date;
  /** Number of co-observations. */
  occurrences: number;
}
