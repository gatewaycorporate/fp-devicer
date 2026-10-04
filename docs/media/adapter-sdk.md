# NEXT Adapter SDK

A NEXT adapter owns domain-specific extraction and comparison. The core only
requires a domain, schema version, extractor versions, declared relationships,
configuration metadata, an observation factory, and a comparison function.

Adapters must:

- declare every relationship they support;
- return typed missingness or unavailable evidence instead of treating absence
  as a match;
- include comparator and extractor versions in their configuration;
- keep similarity distinct from probability and identity;
- provide fixtures for positive, negative, and insufficient-evidence cases.

P7 includes model-agnostic conformance fixtures for handwriting and enrolled
biometric verification. Handwriting declares separate same-writer and
same-transcription relationships. The biometric fixture is scoped to one
declared modality and compares templates only when both modality and template
are available. These adapters do not ship models, claim writer/subject
accuracy, or reuse browser/document calibration artifacts.
The test adapter in `src/tests/next/core.test.ts` is intentionally outside the
core's domain vocabulary. It proves that adding a new domain does not require a
core edit. `createBrowserAdapter` and `createDocumentAdapter` provide the first
two built-in domain fixtures, while `InstanceRegistry` keeps adapter lifecycles
instance-scoped. The `next:cli` command compares JSON observations without
assigning an identity. Production adapters must still define retention,
deletion, artifact references, and quality semantics before release.
