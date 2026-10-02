# NEXT Domain Model Implementation Plan

Status: integration foundation and operational safety controls implemented;
these models are not currently shipped or RC-supported.

Implemented foundation: `createModelBackedAdapter` now provides an injected
inference boundary, requires checkpoint/license/runtime provenance, and binds
the model manifest into the NEXT configuration digest. Research checkpoints,
preprocessing, and production inference runtimes remain follow-on work.

The current implementation also exports typed `createFaceAdapter`,
`createPhysicalFingerprintAdapter`, and `createSignatureAdapter` factories,
structured `ModelInputError` and `ModelInferenceError` failures, model
provenance on observations, and evaluation-manifest leakage checks. These
factories require an application-supplied inference function and do not imply
that KR-RPE, AdaFace, JIPNet, or DetailSemNet weights are packaged.

Model runtimes may now be injected as cancellable runtime objects with signal
propagation and optional teardown. Runtime-only adapters are supported; the
same provenance and quality gates apply to them.

The NEXT package now includes an optional JSON-lines `ProcessModelRuntime` for
application-owned Python, native, or worker runtimes. It provides lazy process
startup, request serialization, request-scoped responses, bounded inference
timeouts, cancellation, decoding, and teardown without downloading model
weights. The `createGovernedNextStore` wrapper adds retention expiry,
authorization hooks, transactional deletion, and metadata-only audit events.

The shared `runEvaluation` runner now reports genuine/impostor counts, false
match and false non-match rates, abstentions, unavailable and unsupported
comparisons, score summaries, quality slices, and latency percentiles. A local
LFW preparation and structural evaluation was completed; its manifests are
subject-disjoint and its raw images remain outside the repository. It is marked
structural-only because the CVLface Python runtime could not be provisioned in
the current environment.

The current upstream investigation is recorded in the [model upstream
inventory](model-upstreams.md). CVLface is the pinned face upstream containing
the KPRPE and AdaFace components; checkpoint and runtime promotion still
requires the exact downloaded artifacts and execution environment.

This plan defines how to integrate the requested domain models behind the NEXT
adapter contract:

- Facial recognition: KR-RPE plus AdaFace for advanced face matching.
- Physical fingerprinting: JIPNet as the default fingerprint matcher.
- Handwriting and signature matching: DetailSemNet for signature verification.

The models must remain replaceable implementation details. NEXT owns versioned
observations, relationships, evidence, configuration binding, abstention,
calibration, persistence, and operational policy. A model owns preprocessing,
embedding or template extraction, model inference, and model-specific quality
signals.

## Scope And Non-Claims

The first milestone is an engineering integration and evaluation harness, not a
claim of biometric accuracy, identity proof, demographic fairness, or production
readiness. The integrations must not reuse browser or document calibration
artifacts. Each modality requires its own data manifest, labels, calibration
artifact, retention policy, and release decision.

The face, physical fingerprint, and signature paths are high-sensitivity
biometric workflows. They require lawful collection, informed consent or
another documented legal basis, access control, encryption, deletion, audit
logging, and a threat model before handling real user data. Development should
use synthetic, consented, or otherwise approved fixtures.

Before implementation, record the exact upstream papers, repositories, model
checkpoints, preprocessing rules, licenses, known limitations, and intended
meaning of each requested model name. In particular, verify the selected
KR-RPE, AdaFace, JIPNet, and DetailSemNet implementations rather than assuming
that similarly named repositories are equivalent.

## Shared Adapter Contract

Create one adapter per domain and bind every observation to an immutable model
configuration. The configuration digest must include at least:

- model name, upstream revision, checkpoint digest, and license metadata;
- preprocessing and image or sensor quality rules;
- embedding/template dimensions and normalization;
- comparator version, threshold policy, and runtime/backend;
- extractor version, schema version, and supported relationship IDs.

All adapters must implement conformance fixtures for positive, negative,
near-match, malformed-input, missing-input, wrong-modality, and incompatible
configuration cases. The adapters must return `insufficient_data`,
`unsupported_configuration`, or an explicit quality failure where appropriate.
They must never turn a missing template, failed extraction, or low-quality
sample into a positive comparison.

A recommended internal pipeline is:

```text
raw sample -> validated input -> quality gate -> model inference
           -> normalized representation -> relation-specific comparator
           -> evidence -> calibrated decision or abstention
```

Raw biometric samples should not be stored in NEXT observations by default.
Persist only the minimum representation required by the declared retention
policy, preferably encrypted templates or embeddings with a key reference,
model/configuration metadata, quality metrics, provenance, timestamps, and
revocation/deletion state.

## Track A: Facial Recognition

### Objective

Use KR-RPE and AdaFace as a two-stage face pipeline:

1. KR-RPE provides the face representation or quality-aware representation
   required by the selected implementation.
2. AdaFace provides the face-recognition embedding or comparison stage.

The exact division of responsibilities must be confirmed against the selected
checkpoints. If the evaluated implementation combines or replaces either stage,
record that fact in the model manifest rather than presenting an assumed
pipeline.

### Adapter design

Add a `face` adapter with relationships kept distinct:

- `same-enrolled-identity`: one-to-one verification against an enrolled
  template;
- `same-subject`: evaluation-only pair comparison;
- `different-subject`: evaluation labels, not a production relationship.

The adapter should accept an external image or an upstream detector output in
its ingestion boundary, run the quality and alignment pipeline, and emit a
versioned embedding/template observation. It must record quality factors such as
face detection confidence, pose, blur, occlusion, illumination, and crop
validity without exposing sensitive raw pixels in logs.

### Implementation steps

1. Freeze a model manifest for KR-RPE, AdaFace, preprocessing, checkpoints,
   runtime, and hardware requirements.
2. Build a standalone inference wrapper with deterministic input validation,
   batch and single-item paths, bounded resource use, and structured errors.
3. Add the NEXT face adapter and configuration digest binding.
4. Add cosine or the model-prescribed comparator as a versioned comparator;
   do not hard-code a universal threshold.
5. Add enrolled verification with explicit `match`, `non_match`, and
   `insufficient_evidence` outcomes.
6. Add calibration on a face-specific development split and evaluate on a
   subject-disjoint test split.
7. Measure accuracy, ROC/DET operating points, false match rate, false
   non-match rate, abstention rate, latency, memory, and quality-stratified
   performance.
8. Evaluate relevant demographic and capture-condition slices when legally and
   ethically permitted, and document unsupported conditions.

### Face acceptance gates

- No subject overlap between enrollment, calibration, and test partitions.
- No checkpoint, preprocessing, or threshold change without a new artifact
  digest and compatibility evaluation.
- Spoof, replay, presentation-attack, and template-protection risks are
  documented; face matching alone is not described as liveness detection.
- A held-out evaluation demonstrates the selected operating point and its
  uncertainty before any supported-domain claim.

## Track B: Physical Fingerprinting

### Objective

Use JIPNet as the default matcher for physical fingerprint sensor templates.
The integration is template-based and must not confuse a physical fingerprint
with a browser or device fingerprint.

### Adapter design

Add a `physical-fingerprint` adapter with the relationship:

- `same-enrolled-finger`: probe template compared with an enrolled finger;
- optional evaluation-only labels for `same-finger` and `different-finger`.

The adapter boundary should accept a sensor SDK result, not raw unvalidated
bytes. Validate sensor modality, vendor/format metadata, template version,
quality score, dimensions, and capture status before invoking JIPNet. Preserve
sensor provenance and quality without storing raw captures unless explicitly
required by the retention policy.

### Implementation steps

1. Confirm the JIPNet checkpoint, expected template/image input, sensor-format
   assumptions, license, and supported capture conditions.
2. Implement a sensor normalization layer with strict format and dimension
   checks plus explicit unsupported-sensor errors.
3. Wrap JIPNet inference behind a bounded worker interface with cancellation,
   teardown, and no model calls while storage locks are held.
4. Add the `physical-fingerprint` NEXT adapter, versioned comparator, quality
   gate, and modality scoping.
5. Add enrollment, probe verification, duplicate-enrollment detection, and
   deletion/revocation workflows without rewriting historical observations.
6. Calibrate thresholds separately for each declared sensor family or document
   why a shared calibration is valid.
7. Evaluate genuine/impostor pairs, cross-session variation, sensor changes,
   partial or damaged captures, and low-quality abstention behavior.
8. Record operational limits for model loading, concurrent probes, retries,
   memory, and sensitive-template access.

### Fingerprint acceptance gates

- Sensor vendor, capture protocol, template format, and JIPNet configuration
  are part of the artifact manifest.
- Cross-sensor comparisons are rejected or separately calibrated; they are not
  silently treated as compatible.
- Enrollment and test subjects are disjoint where the evaluation requires it.
- Deletion removes or cryptographically renders the retained template unusable
  while preserving only the minimum audit record required by policy.

## Track C: Handwriting And Signature Verification

### Objective

Use DetailSemNet for signature verification and handwriting comparison. The
first supported relationship should be verification of a claimed writer or
signer, not authorship attribution or identity discovery.

### Adapter design

Add a `signature` adapter with relationships kept separate:

- `same-writer`: embedding-based comparison for writer consistency;
- `same-signature-intent`: evaluation-only relation for verification labels;
- `same-transcription`: exact transcription comparison, independent of writer
  similarity.

The adapter should support the selected input modality explicitly: scanned
offline signatures, tablet strokes, or both. Do not combine image and stroke
features until DetailSemNet has an evaluated multimodal configuration.

Observations should include model representation metadata, capture modality,
quality indicators such as crop completeness, resolution, stroke availability,
and preprocessing provenance. Signature content and handwriting samples are
sensitive and should be encrypted or kept external to the observation store.

### Implementation steps

1. Confirm which DetailSemNet checkpoint and input modality are being adopted,
   including whether it produces embeddings, scores, or both.
2. Define a canonical signature sample schema and reject mixed modality inputs.
3. Implement preprocessing, quality checks, inference, and normalized template
   output behind a model wrapper.
4. Add the NEXT signature adapter with `same-writer` and explicit missingness.
5. Add a verification policy that requires a claimed identity and enrollment
   set; do not turn the result into an unbounded identity search.
6. Calibrate on signer-disjoint development data and test on signer-disjoint,
   document-disjoint data. Keep transcription equality as a separate signal.
7. Evaluate genuine and skilled-forgery/impostor pairs, session variation,
   writing instruments, capture devices, and low-quality samples.
8. Report score distributions, false acceptance/rejection rates, abstentions,
   calibration metrics, latency, and failure causes.

### Signature acceptance gates

- Writer, document, and capture-session leakage checks pass.
- The model never receives labels or duplicate samples from the held-out test
  partition through preprocessing, threshold selection, or artifact generation.
- Skilled forgeries and hard negatives are represented in the evaluation
  protocol, or their absence is an explicit limitation.
- The released relationship is verification, not an authorship or identity
  guarantee.

## Shared Evaluation And Calibration

Create a frozen evaluation runner with manifests for source data, subject or
writer groups, capture sessions, preprocessing, model artifacts, and labels.
The runner must produce machine-readable results and a human-readable summary.
At minimum report:

- genuine/impostor counts and group-overlap checks;
- similarity distributions and operating thresholds;
- false match and false non-match rates;
- Brier score, log loss, calibration status, coverage, and prediction-set size
  when calibrated probabilities or conformal outputs are used;
- abstention, unavailable-input, and unsupported-configuration rates;
- p50/p95/p99 inference latency, memory, batch behavior, and failure rates;
- results by declared quality, sensor/capture condition, and permitted subgroup.

Calibration artifacts must bind to the complete configuration digest and evidence
mask. A model, checkpoint, preprocessor, comparator, sensor family, or threshold
change requires a new artifact or an explicit compatibility evaluation.
Unsupported or stale artifacts must produce explicit status and no probability.

## Packaging And Runtime Plan

Keep model runtimes and checkpoints out of the legacy root export. Add explicit
optional NEXT subpaths only after the runtime and licensing strategy is settled,
for example:

```text
devicer.js/next/face
devicer.js/next/physical-fingerprint
devicer.js/next/signature
```

The default package should not download large checkpoints implicitly. Choose and
document one supported distribution mode per model: separately provisioned
weights, an approved package artifact, or an application-owned inference
service. Record CPU/GPU/WASM/native support separately and do not claim a target
without executing its acceptance suite.

Model loading must be lazy, bounded, observable without sensitive payloads, and
safe to shut down. Native, worker, and portable paths need equivalent status and
error semantics before being advertised together.

## Delivery Phases

### Phase 1: Provenance And Feasibility

- Confirm model identities, checkpoints, licenses, dependencies, input/output
  contracts, and supported runtimes.
- Produce tiny approved fixtures and a model manifest for each track.
- Prove one inference call and one deterministic repeated call per model.

### Phase 2: Adapter And Safety Foundations

- Implement wrappers, input validation, quality gates, configuration digests,
  explicit missingness, cancellation, teardown, and redacted diagnostics.
- Add conformance tests and negative fixtures without claiming accuracy.

### Phase 3: Domain Evaluation

- Build frozen, disjoint data splits and leakage checks.
- Generate calibration artifacts and held-out evaluation reports per modality.
- Benchmark quality slices, failure behavior, resource limits, and operational
  costs.

### Phase 4: Persistence And Operations

- Persist only approved templates or references with encryption and retention
  controls.
- Test reopen, rollback, deletion, access boundaries, artifact activation, and
  model-version migration on real supported backends.
- Add audit events for enrollment, verification, rejection, abstention,
  deletion, and artifact promotion without logging raw biometric data.

### Phase 5: Promotion Decision

Promote a model/domain combination only when its manifest, license review,
conformance suite, security/privacy review, frozen evaluation, calibration
artifact, operational benchmark, and known-limitations record are complete.
Promotion is per modality and per relationship; success in one track does not
promote the others.

## Explicit Exclusions

This plan does not authorize production biometric deployment, universal model
thresholds, cross-sensor or cross-domain calibration, liveness detection,
forensic authorship claims, demographic performance claims without evidence,
identity graph construction, or storage of raw biometric media by default.
