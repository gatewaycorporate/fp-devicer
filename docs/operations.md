# Operations

NEXT calibration artifacts are immutable records. `CalibrationArtifactRegistry`
registers an artifact once, returns defensive copies, records every activation
reason and timestamp, and supports rollback by selecting a previously registered
artifact. Activation does not retrain a model, change observations, or convert
predicted links into labels.

Promotion should follow held-out evaluation and configuration-scope checks.
Keep the prior supported artifact registered until the replacement is accepted;
rollback is an artifact-selection operation. Expired or unsupported artifacts
must continue to return explicit calibration statuses rather than probabilities.

The exact retrieval index is candidate discovery only. Rebuilds produce a
versioned manifest, and snapshots can be restored only after scope and exact
content-digest validation. `exhaustiveCandidates` remains the evaluation oracle
so retrieval recall is measured separately from pairwise scoring.

Retention, deletion, raw-artifact storage, redaction, persistent index storage,
and deployment-specific access controls remain adapter and deployment
responsibilities. They are not inferred from the in-memory registry.