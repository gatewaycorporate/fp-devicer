// src/libs/default-observability.ts
import type { Logger, Metrics } from '../types/observability.js';

export const defaultLogger: Logger = {
  info: (msg, meta) => console.log(`[INFO] ${msg}`, meta ?? ''),
  warn: (msg, meta) => console.warn(`[WARN] ${msg}`, meta ?? ''),
  error: (msg, meta) => console.error(`[ERROR] ${msg}`, meta ?? ''),
  debug: (msg, meta) => console.debug(`[DEBUG] ${msg}`, meta ?? ''),
};

export class DefaultMetrics implements Metrics {
  private counters = new Map<string, number>();
  private histograms = new Map<string, number[]>();

  incrementCounter(name: string, value = 1) {
    this.counters.set(name, (this.counters.get(name) ?? 0) + value);
  }

  recordHistogram(name: string, value: number) {
    if (!this.histograms.has(name)) this.histograms.set(name, []);
    this.histograms.get(name)!.push(value);
  }

  recordGauge(name: string, value: number) {
    this.counters.set(name, value); // reuse counter map for gauges
  }

  recordIdentify(durationMs: number, confidence: number, isNewDevice: boolean, candidatesCount: number, matched: boolean) {
    this.incrementCounter('identify_total');
    if (isNewDevice) this.incrementCounter('new_devices');
    if (matched) this.incrementCounter('matches_total');

    this.recordHistogram('identify_latency_ms', durationMs);
    this.recordHistogram('confidence_scores', confidence);
    this.recordGauge('candidates_per_identify', candidatesCount);
    this.recordGauge('avg_confidence', confidence); // last value (or compute mean in real impl)
  }

  // Optional: expose for reporting
  getSummary() {
    const latencies = this.histograms.get('identify_latency_ms');
    return {
      counters: Object.fromEntries(this.counters),
      avgLatency: latencies && latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
    };
  }
}

export const defaultMetrics = new DefaultMetrics();