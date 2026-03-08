// src/libs/default-observability.ts
import type { Logger, Metrics } from '../types/observability.js';

/**
 * A minimal {@link Logger} implementation that forwards all messages to the
 * native `console` methods, prefixing each line with its level tag.
 *
 * Used as the default logger inside {@link DeviceManager} when no custom
 * logger is supplied via {@link ObservabilityOptions}.
 */
export const defaultLogger: Logger = {
  info: (msg, meta) => console.log(`[INFO] ${msg}`, meta ?? ''),
  warn: (msg, meta) => console.warn(`[WARN] ${msg}`, meta ?? ''),
  error: (msg, meta) => console.error(`[ERROR] ${msg}`, meta ?? ''),
  debug: (msg, meta) => console.debug(`[DEBUG] ${msg}`, meta ?? ''),
};

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
export class DefaultMetrics implements Metrics {
  private counters = new Map<string, number>();
  private histograms = new Map<string, number[]>();

  /**
   * Increment a named counter by `value` (default `1`).
   * Creates the counter with value `0` if it does not yet exist.
   */
  incrementCounter(name: string, value = 1) {
    this.counters.set(name, (this.counters.get(name) ?? 0) + value);
  }

  /**
   * Append a single observation to the named histogram bucket.
   * Creates the bucket array if it does not yet exist.
   */
  recordHistogram(name: string, value: number) {
    if (!this.histograms.has(name)) this.histograms.set(name, []);
    this.histograms.get(name)!.push(value);
  }

  /**
   * Set a named gauge to an absolute value.
   * Reuses the counter map; the last recorded value wins.
   */
  recordGauge(name: string, value: number) {
    this.counters.set(name, value); // reuse counter map for gauges
  }

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
  recordIdentify(durationMs: number, confidence: number, isNewDevice: boolean, candidatesCount: number, matched: boolean) {
    this.incrementCounter('identify_total');
    if (isNewDevice) this.incrementCounter('new_devices');
    if (matched) this.incrementCounter('matches_total');

    this.recordHistogram('identify_latency_ms', durationMs);
    this.recordHistogram('confidence_scores', confidence);
    this.recordGauge('candidates_per_identify', candidatesCount);
    this.recordGauge('avg_confidence', confidence); // last value (or compute mean in real impl)
  }

  /**
   * Return a plain-object summary of all recorded metrics.
   *
   * Includes all counter/gauge values and the mean of the
   * `identify_latency_ms` histogram.
   *
   * @returns An object with `counters` and `avgLatency` keys.
   */
  getSummary() {
    const latencies = this.histograms.get('identify_latency_ms');
    return {
      counters: Object.fromEntries(this.counters),
      avgLatency: latencies && latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
    };
  }
}

/**
 * Shared singleton instance of {@link DefaultMetrics}.
 *
 * Used as the default metrics sink inside {@link DeviceManager} when no
 * custom metrics implementation is provided.
 */
export const defaultMetrics = new DefaultMetrics();