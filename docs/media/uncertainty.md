# NEXT Uncertainty Contract

NEXT keeps these quantities separate:

- **Similarity:** an adapter comparator output for one declared relationship.
- **Probability:** an empirical calibration output tied to one artifact,
  configuration digest, population, task, evidence mask, and label manifest.
- **Prediction set:** labels retained by the split-conformal artifact at its
  declared error level. A larger set is uncertainty, not a weaker identity.
- **Decision:** a policy result such as match, non-match, or insufficient
  evidence. Threshold decisions are not probabilities.
- **Identity:** an explicit application operation that is outside pairwise
  comparison and calibration.

`supported` means the comparison matches the artifact's configuration and
evidence-mask scope and is not expired. `uncalibrated` means a similarity is
available without a supported probability artifact. `insufficient_data` means
no usable evidence is available. `stale` means the artifact has expired.
`unsupported_configuration` means scope, relationship, modality, or evidence
availability is outside the artifact contract.

Calibration artifacts must declare their task, population, configuration
digest, data manifest, label provenance, supported masks, and expiry policy.
Held-out evaluation is a separate manifest and reports coverage, set size,
Brier score, and log loss. `evaluateCalibrationByMask` reports the same metrics
for each evidence-availability mask. Marginal conformal coverage is not per-pair
correctness, subgroup coverage, or accepted-decision precision.

Predicted links, analyst judgments, and externally verified labels are distinct
records. The random audit stream is separate from uncertainty-driven review and
records inclusion probabilities. No prediction becomes a trusted calibration
label automatically.

The current P5/P6 implementation provides empirical-bin and split-conformal
baselines plus configuration-aware reuse assessment. It does not claim a
general conditional guarantee, robustness to arbitrary shift, or research
improvement over a baseline.