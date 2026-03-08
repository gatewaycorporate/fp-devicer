export interface Logger {
  info(message: string, meta?: Record<string, any>): void;
  warn(message: string, meta?: Record<string, any>): void;
  error(message: string, meta?: Record<string, any>): void;
  debug?(message: string, meta?: Record<string, any>): void;
}

export interface Metrics {
  // Core counters
  incrementCounter(name: string, value?: number): void;     // e.g. "matches_total"
  recordHistogram(name: string, value: number): void;       // e.g. "identify_latency_ms"
  recordGauge(name: string, value: number): void;           // e.g. "avg_confidence"

  // Convenience helpers (we'll use these in DeviceManager)
  recordIdentify(
    durationMs: number,
    confidence: number,
    isNewDevice: boolean,
    candidatesCount: number,
    matched: boolean
  ): void;

	getSummary?(): Record<string, any>;
}

export type ObservabilityOptions = {
  logger?: Logger;
  metrics?: Metrics;
};