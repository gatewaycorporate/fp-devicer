import type { Logger, Metrics } from '../types/observability.js';
/**
 * A minimal {@link Logger} implementation that forwards all messages to the
 * native `console` methods, prefixing each line with its level tag.
 *
 * Used as the default logger inside {@link DeviceManager} when no custom
 * logger is supplied via {@link ObservabilityOptions}.
 */
export declare const defaultLogger: Logger;
/**
 * In-memory {@link Metrics} implementation for development and testing.
 *
 * - Counters and gauges are stored in a `Map<string, number>`.
 * - Histograms accumulate observations in a `Map<string, number[]>`.
 *
 * Exposes {@link DefaultMetrics.getSummary} for quick inspection. Not
 * suitable for production monitoring — use a Prometheus or OpenTelemetry
 * adapter instead.
 */
export declare class DefaultMetrics implements Metrics {
    private counters;
    private histograms;
    /**
     * Increment a named counter by `value` (default `1`).
     * Creates the counter with value `0` if it does not yet exist.
     */
    incrementCounter(name: string, value?: number): void;
    /**
     * Append a single observation to the named histogram bucket.
     * Creates the bucket array if it does not yet exist.
     */
    recordHistogram(name: string, value: number): void;
    /**
     * Set a named gauge to an absolute value.
     * Reuses the counter map; the last recorded value wins.
     */
    recordGauge(name: string, value: number): void;
    /**
     * Convenience helper that records all metrics produced by a single
     * {@link DeviceManager.identify} call in one shot.
     *
     * @param durationMs - Wall-clock identify duration in milliseconds.
     * @param confidence - Final confidence score (0–100).
     * @param isNewDevice - `true` when a new device record was created.
     * @param candidatesCount - Number of pre-filter candidates evaluated.
     * @param matched - `true` when an existing device was matched.
     */
    recordIdentify(durationMs: number, confidence: number, isNewDevice: boolean, candidatesCount: number, matched: boolean): void;
    /**
     * Return a plain-object summary of all recorded metrics.
     *
     * Includes all counter/gauge values and the mean of the
     * `identify_latency_ms` histogram.
     *
     * @returns An object with `counters` and `avgLatency` keys.
     */
    getSummary(): {
        counters: {
            [k: string]: number;
        };
        avgLatency: number;
    };
}
/**
 * Shared singleton instance of {@link DefaultMetrics}.
 *
 * Used as the default metrics sink inside {@link DeviceManager} when no
 * custom metrics implementation is provided.
 */
export declare const defaultMetrics: DefaultMetrics;
//# sourceMappingURL=default-observability.d.ts.map