# NEXT Evaluation Datasets

## Labeled Faces in the Wild

The local structural evaluation used the public LFW archive distributed through
the scikit-learn/figshare download endpoint:

- Source: <https://ndownloader.figshare.com/files/5976018>
- Archive: `lfw.tgz`
- SHA-256: `055f7d9c632d7370e6fb4afc7468d40f970c34a80d4c6f50ffec63f5a8d536c0`
- Observed contents: 5,749 subjects and 13,233 JPEG images
- Local storage: `/tmp/devicer-datasets/lfw`; no images are committed here

The archive did not contain a license file in its top-level contents. It is
therefore suitable for local engineering validation only after the operator
reviews the upstream LFW terms; this repository does not redistribute it or
make a biometric deployment or accuracy claim from it.

Prepare hashed references and subject-disjoint manifests with:

```sh
node scripts/prepare-lfw-evaluation.mjs \
  /tmp/devicer-datasets/lfw/images \
  /tmp/devicer-datasets/lfw/evaluation
```

The generated metadata contains image paths, content digests, subject groups,
and labels, but not image bytes. The current output is explicitly marked
`structural-only-unprovisioned-model-runtime`: it validates dataset integrity
and split leakage controls, not KR-RPE/AdaFace accuracy.