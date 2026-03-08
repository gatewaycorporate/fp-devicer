import { Gauge, Counter, Histogram } from "prom-client";
import { Metrics } from "../main.js";

class PromethiusMetrics implements Metrics {
	private identifyCounter = new Counter({ name: "fp_identify_total", help: "Total identify calls" });
	private newDevicesCounter = new Counter({ name: "fp_new_devices_total", help: "Total new devices identified" });
	private matchesCounter = new Counter({ name: "fp_matches_total", help: "Total successful matches" });
	private latencyHistogram = new Histogram({ name: "fp_identify_latency_ms", help: "Identify latency in ms" });
	private confidenceHistogram = new Histogram({ name: "fp_confidence_scores", help: "Confidence scores" });
	private candidatesGauge = new Gauge({ name: "fp_candidates_per_identify", help: "Number of candidates per identify call" });
	private avgConfidenceGauge = new Gauge({ name: "fp_avg_confidence", help: "Average confidence score" });

	recordIdentify(durationMs: number, confidence: number, isNewDevice: boolean, candidatesCount: number, matched: boolean) {
		this.identifyCounter.inc();
		if (isNewDevice) this.newDevicesCounter.inc();
		if (matched) this.matchesCounter.inc();
		
		this.latencyHistogram.observe(durationMs);
		this.confidenceHistogram.observe(confidence);
		this.candidatesGauge.set(candidatesCount);
		this.avgConfidenceGauge.set(confidence); // In a real implementation, you'd want to compute a rolling average
	}

	incrementCounter(name: string, value?: number): void {
		switch (name) {
			case "identify_total":
				this.identifyCounter.inc(value);
				break;
			case "new_devices":
				this.newDevicesCounter.inc(value);
				break;
			case "matches_total":
				this.matchesCounter.inc(value);
				break;
			default:
				throw new Error(`Unknown counter: ${name}`);
		}
	}

	recordHistogram(name: string, value: number): void {
		switch (name) {
			case "identify_latency_ms":
				this.latencyHistogram.observe(value);
				break;
			case "confidence_scores":
				this.confidenceHistogram.observe(value);
				break;
			default:
				throw new Error(`Unknown histogram: ${name}`);
		}
	}

	recordGauge(name: string, value: number): void {
		switch (name) {
			case "candidates_per_identify":
				this.candidatesGauge.set(value);
				break;
			case "avg_confidence":
				this.avgConfidenceGauge.set(value);
				break;
			default:
				throw new Error(`Unknown gauge: ${name}`);
		}
	}
}