import { Gauge, Counter, Histogram } from "prom-client";
class PromethiusMetrics {
    identifyCounter = new Counter({ name: "fp_identify_total", help: "Total identify calls" });
    newDevicesCounter = new Counter({ name: "fp_new_devices_total", help: "Total new devices identified" });
    matchesCounter = new Counter({ name: "fp_matches_total", help: "Total successful matches" });
    latencyHistogram = new Histogram({ name: "fp_identify_latency_ms", help: "Identify latency in ms" });
    confidenceHistogram = new Histogram({ name: "fp_confidence_scores", help: "Confidence scores" });
    candidatesGauge = new Gauge({ name: "fp_candidates_per_identify", help: "Number of candidates per identify call" });
    avgConfidenceGauge = new Gauge({ name: "fp_avg_confidence", help: "Average confidence score" });
    recordIdentify(durationMs, confidence, isNewDevice, candidatesCount, matched) {
        this.identifyCounter.inc();
        if (isNewDevice)
            this.newDevicesCounter.inc();
        if (matched)
            this.matchesCounter.inc();
        this.latencyHistogram.observe(durationMs);
        this.confidenceHistogram.observe(confidence);
        this.candidatesGauge.set(candidatesCount);
        this.avgConfidenceGauge.set(confidence); // In a real implementation, you'd want to compute a rolling average
    }
    incrementCounter(name, value) {
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
    recordHistogram(name, value) {
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
    recordGauge(name, value) {
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
