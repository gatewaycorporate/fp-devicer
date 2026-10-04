import type { CalibrationArtifact, CalibratedPrediction, CalibrationSample, PairLabel } from './calibration.js';

export type ConfigurationChange = "none" | "availability" | "extractor" | "schema" | "fusion" | "mixed";

export interface ConfigurationTransition {
  fromDigest: string;
  toDigest: string;
  change: ConfigurationChange;
  reason: string;
}

export interface CalibrationReuseAssessment {
  reusable: boolean;
  status: "compatible" | "requires_new_labels";
  reasonCodes: readonly string[];
}

export interface LabelCandidate {
  sample: CalibrationSample;
  prediction: CalibratedPrediction;
}

export interface LabelRequest {
  pairId: string;
  reason: "uncertainty_review" | "random_audit";
  inclusionProbability: number;
  predictedSet: readonly PairLabel[];
}

export interface LabelAllocation {
  requests: readonly LabelRequest[];
  uncertaintyCount: number;
  auditCount: number;
  auditRate: number;
}

export interface LabelAllocationOptions {
  auditRate: number;
  uncertaintyLimit: number;
  randomValues?: readonly number[];
}

export function assessCalibrationReuse(
  artifact: CalibrationArtifact,
  transition: ConfigurationTransition,
): CalibrationReuseAssessment {
  if (transition.fromDigest !== artifact.configurationDigest) {
    return { reusable: false, status: "requires_new_labels", reasonCodes: ["source_artifact_configuration_mismatch"] };
  }
  if (transition.fromDigest !== transition.toDigest) {
    return {
      reusable: false,
      status: "requires_new_labels",
      reasonCodes: ["configuration_digest_changed", `${transition.change}_change_requires_validation`],
    };
  }
  return { reusable: true, status: "compatible", reasonCodes: ["configuration_unchanged"] };
}

export function allocateCalibrationLabels(
  candidates: readonly LabelCandidate[],
  options: LabelAllocationOptions,
): LabelAllocation {
  if (!(options.auditRate >= 0 && options.auditRate <= 1)) throw new Error("auditRate must be between 0 and 1");
  if (!Number.isInteger(options.uncertaintyLimit) || options.uncertaintyLimit < 0) throw new Error("uncertaintyLimit must be a non-negative integer");
  const requests: LabelRequest[] = [];
  const uncertain = candidates
    .filter(candidate => candidate.prediction.status === "supported" && candidate.prediction.predictionSet.length !== 1)
    .slice(0, options.uncertaintyLimit);
  const uncertaintyIds = new Set(uncertain.map(candidate => candidate.sample.pairId));
  for (const candidate of uncertain) {
    requests.push({
      pairId: candidate.sample.pairId,
      reason: "uncertainty_review",
      inclusionProbability: 1,
      predictedSet: candidate.prediction.predictionSet,
    });
  }
  const randomValues = options.randomValues ?? [];
  let randomIndex = 0;
  for (const candidate of candidates) {
    if (uncertaintyIds.has(candidate.sample.pairId)) continue;
    const randomValue = randomValues[randomIndex++] ?? 0;
    if (randomValue < options.auditRate) {
      requests.push({
        pairId: candidate.sample.pairId,
        reason: "random_audit",
        inclusionProbability: options.auditRate,
        predictedSet: candidate.prediction.predictionSet,
      });
    }
  }
  return {
    requests,
    uncertaintyCount: uncertain.length,
    auditCount: requests.filter(request => request.reason === "random_audit").length,
    auditRate: options.auditRate,
  };
}