# NEXT Model Upstream Inventory

Status: source repositories pinned for investigation; research checkpoints are
provisioned only outside the repository and are not RC-supported.

The repositories below were inspected on 2026-09-30 and cloned at the pinned
commits. A source commit is not a model checkpoint and must not be used as the
checkpoint digest in a production manifest.

| Domain | Model | Repository | License | Pinned source commit | Integration status |
| --- | --- | --- | --- | --- | --- |
| Face | KR-RPE + AdaFace | https://github.com/mk-minchul/CVLface | MIT | `308142aa50adf2e187711354f7524635d3414f1e` | Checked out at `vendor/models/CVLface`; WebFace4M KPRPE+AdaFace checkpoint is provisioned outside the repository at `/tmp` with digest recorded below; Python runtime acceptance remains open. |
| Physical fingerprint | JIPNet | https://github.com/XiongjunGuan/JIPNet | MIT | `40d8445c5b3afa55b409ae3221377e54e3ace53f` | Checked out at `vendor/models/JIPNet`; source and inference scripts identified; sensor/input contract, checkpoint digest, and runtime packaging remain open. |
| Signature | DetailSemNet | https://github.com/nycu-acm/DetailSemNet_OSV | MIT | `0230f41e4454d9ec6274fc32b102e45c0b171ca9` | Checked out at `vendor/models/DetailSemNet`; source identified; checkpoint, preprocessing, and runtime packaging remain open. |
| Face | AdaFace reference | https://github.com/mk-minchul/AdaFace | MIT | `c60eaa786a42c03444f3df7096dbaf9d57ae010d` | Checked out at `vendor/models/AdaFace` as the standalone reference implementation; the face integration uses CVLface as the combined upstream. |

## Promotion Requirements

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
not download repositories or weights implicitly. Run `npm run next:models:check`
to verify that all three source submodules are present at their pinned commits.

Initialize the source repositories in a fresh checkout with:

```sh
git submodule update --init --recursive
npm run next:models:check
```

Using a submodule supplies the model source and research inference code; it does
not supply Python environments, downloaded checkpoints, sensor drivers, or a
Node-compatible runtime. A production adapter must provision those separately,
record their digests in `ModelArtifactManifest`, and inject a `ModelRuntime`
that translates the upstream model output into the typed NEXT observation.

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
