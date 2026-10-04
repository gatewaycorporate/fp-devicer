# Historical Model Upstream Inventory

Status: archived investigation, not release dependencies. Production model
implementations and checkpoints are excluded. The recorded repositories below
are no longer submodules of this branch. Do not initialize or download them to
build, test or install NEXT. See [signal contracts](domain-model-plan.md).

The repositories below were inspected on 2026-09-30 and cloned at the pinned
commits. A source commit is not a model checkpoint and must not be used as the
checkpoint digest in a production manifest.

| Domain | Model | Repository | License | Pinned source commit | Integration status |
| --- | --- | --- | --- | --- | --- |
| Face | KR-RPE + AdaFace | https://github.com/mk-minchul/CVLface | MIT | `308142aa50adf2e187711354f7524635d3414f1e` | Historical investigation only; excluded. |
| Physical fingerprint | JIPNet | https://github.com/XiongjunGuan/JIPNet | MIT | `40d8445c5b3afa55b409ae3221377e54e3ace53f` | Historical investigation only; excluded. |
| Signature | DetailSemNet | https://github.com/nycu-acm/DetailSemNet_OSV | MIT | `0230f41e4454d9ec6274fc32b102e45c0b171ca9` | Historical investigation only; excluded. |
| Face | AdaFace reference | https://github.com/mk-minchul/AdaFace | MIT | `c60eaa786a42c03444f3df7096dbaf9d57ae010d` | Historical investigation only; excluded. |

## Historical Promotion Requirements (Out Of Scope)

Before adding any row to a supported model catalog, record:

- the exact upstream repository and revision;
- the checkpoint URL or source artifact and a SHA-256 digest of the downloaded
  checkpoint;
- the license and any dataset or non-commercial restrictions;
- input dimensions, color/channel order, alignment, normalization, and output
  representation;
- supported inference runtimes, hardware, and dependency versions;
- a deterministic smoke fixture and expected output tolerance;
- domain-specific calibration and held-out evaluation manifests.

The current NEXT model factories accept these facts through
`ModelArtifactManifest` and an application-supplied inference function. They do
not download repositories or weights implicitly. Model-source validation,
conversion and dataset-preparation scripts have been removed. Generic runtime
injection is retained without a bundled production implementation.

## External Face Checkpoint Trial

The documented Hugging Face artifact selected for the face trial is
`minchul/cvlface_adaface_vit_base_kprpe_webface4m`. It was downloaded outside
the repository on 2026-09-30:

- `pretrained_model/model.pt`: 460,381,841 bytes
- SHA-256: `b8d5adde0a00f6482b5e866b6e37eeaa947302a40d9af31c211af72f34d38afb`
- Published input: RGB `112x112`; output dimension: 512
- Source: <https://huggingface.co/minchul/cvlface_adaface_vit_base_kprpe_webface4m>

The environment could not resolve PyPI while provisioning the published
PyTorch/Transformers runtime, so no inference or accuracy result is claimed.
