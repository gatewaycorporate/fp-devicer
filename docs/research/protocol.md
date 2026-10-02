# Initial Research Protocol

Status: pre-pilot design, 2026-09-30. No datasets, trained artifacts, measured
research results, or numerical acceptance targets are established yet.

## Question And Tasks

Test configuration-aware adaptation after extractor/model replacement and
evidence loss: does evidence reuse and label allocation recover useful decisions
with fewer labels than full recalibration at a predeclared error/coverage target?
Start with browser pair verification and document content/lineage verification,
each with explicit relationship labels. Similarity does not establish authorship
or shared person identity.

## Data And Leakage Controls

Freeze manifests for observations, extractor/configuration versions, labels and
provenance. Keep training, model selection, calibration and final testing
separate. Split underlying browser identities and document revision/template
families before making pairs; transformed copies stay together. Use forward-time
testing for drift. Track ambiguous labels instead of forcing certainty.

Include managed-device negatives, same-template/different-document negatives,
OCR corruption, missing sources, extractor changes, gradual drift and abrupt
changes. Raw artifacts are retained only with explicit permission and deletion
policy. No raw sensitive samples belong in default logs or public fixtures.

Predicted identity assignments are not trusted labels. Keep a random audit
stream separate from uncertainty-driven review and record sampling probabilities.
Reuse old evidence only when configuration compatibility and shift assumptions
are justified. Otherwise request labels, retain a supported artifact, or abstain.

## Baselines And Measurements

Compare frozen Devicer 2, fixed-weight fusion, regularized score/quality fusion,
probability calibration, static split conformal, appropriate rolling/group/mask
methods, per-configuration calibration and full retraining/recalibration.
Compare random and proposed label acquisition at equal budgets. Ablate quality,
dependency grouping, disagreement, population features, evidence reuse and
drift-triggered transitions. Complete the manifesto's prior-art audit before
claiming novelty or choosing only favorable baselines.

Report FAR/FRR, precision/recall, ROC/PR and actual EER crossing/interpolation;
Brier/log loss and reliability; prediction-set coverage and size; abstention and
accepted-decision errors; labels/time to recovery and worst-window degradation.
Break results down by supported configuration, availability mask, group and time
window. Evaluate retrieval recall separately from pair scoring. Measure extraction,
binding, scoring, storage and calibration costs separately when implemented.

State assumptions for probability calibration and conformal coverage. Marginal
coverage is not per-pair correctness, and returning all labels is not useful
decision-making. Zero observed errors is not zero population error. Uncertainty
estimates must account for reused entities and temporal dependence.

## Acceptance And Artifact Lifecycle

Set operating points, sample sizes and minimum meaningful improvement after
pilot variance estimates and before final testing. The proposed gate is a
reproducible useful-decision-rate or labels-to-recovery improvement on both
initial domains at a predeclared error/coverage requirement, without hidden group
regression. Numerical targets remain open until the pilot; do not select them
after seeing final test results.

Freeze old artifacts, evaluate changed configurations in shadow mode, and promote
only after held-out gates pass. Calibration artifacts declare task, population,
configuration digest, supported masks/groups, label provenance and expiry rules.
Unsupported/stale artifacts yield explicit states, not confident percentages.
Rollback selects an immutable prior artifact. Publish a negative result if the
adaptation method does not improve on the strongest suitable baseline.