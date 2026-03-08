/**
 * Minimal logging interface consumed by {@link DeviceManager}.
 * Designed to be satisfied by popular loggers such as `pino`, `winston`,
 * or the built-in {@link defaultLogger}.
 */
export interface Logger {
    /** Log an informational message with optional structured metadata. */
    info(message: string, meta?: Record<string, any>): void;
    /** Log a warning message with optional structured metadata. */
    warn(message: string, meta?: Record<string, any>): void;
    /** Log an error message with optional structured metadata. */
    error(message: string, meta?: Record<string, any>): void;
    /** Log a debug-level message with optional structured metadata. Optional. */
    debug?(message: string, meta?: Record<string, any>): void;
}
/**
 * Metrics sink interface consumed by {@link DeviceManager}.
 * Implementations can emit to Prometheus, StatsD, OpenTelemetry, or any
 * other backend. The built-in {@link defaultMetrics} keeps values in memory.
 */
export interface Metrics {
    /** Increment a named counter by `value` (default `1`). e.g. `"matches_total"` */
    incrementCounter(name: string, value?: number): void;
    /** Record a single observation into a named histogram. e.g. `"identify_latency_ms"` */
    recordHistogram(name: string, value: number): void;
    /** Set a named gauge to an absolute value. e.g. `"avg_confidence"` */
    recordGauge(name: string, value: number): void;
    /**
     * Convenience helper called by {@link DeviceManager} after each `identify()`
     * call. Aggregates latency, confidence, and device lifecycle counters in one
     * shot.
     *
     * @param durationMs - Wall-clock time taken by the identify call.
     * @param confidence - Final confidence score (0–100).
     * @param isNewDevice - `true` when no existing device was matched.
     * @param candidatesCount - Number of pre-filter candidates evaluated.
     * @param matched - `true` when an existing device was matched above threshold.
     */
    recordIdentify(durationMs: number, confidence: number, isNewDevice: boolean, candidatesCount: number, matched: boolean): void;
    /** Return an arbitrary summary object for reporting. Optional. */
    getSummary?(): Record<string, any>;
}
/**
 * Optional observability overrides passed to {@link DeviceManager}.
 * When omitted, {@link defaultLogger} and {@link defaultMetrics} are used.
 */
export type ObservabilityOptions = {
    logger?: Logger;
    metrics?: Metrics;
};
//# sourceMappingURL=observability.d.ts.map