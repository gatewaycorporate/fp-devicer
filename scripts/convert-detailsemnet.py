#!/usr/bin/env python3
"""Convert the pinned DetailSemNet PyTorch state dict for Candle.

The released DetailSemNet checkpoint is a PyTorch ``.pt`` state dict. Candle
loads safetensors, so conversion is intentionally explicit and reproducible.
This script does not alter model keys: the Rust implementation must match the
upstream DSNet module names exactly.

Usage:
    python scripts/convert-detailsemnet.py \
      models/DetailSemNet_BHSig_B_best.pt \
      models/DetailSemNet_BHSig_B_best.safetensors

Requirements: torch and safetensors.
"""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path

import torch
from safetensors.torch import save_file


def load_state_dict(path: Path) -> dict[str, torch.Tensor]:
    state = torch.load(path, map_location="cpu")
    if not isinstance(state, dict):
        raise TypeError(f"{path} does not contain a state dict")
    tensors = {}
    for name, value in state.items():
        if not isinstance(name, str) or not isinstance(value, torch.Tensor):
            raise TypeError(f"unsupported checkpoint entry: {name!r}")
        if not value.is_floating_point():
            # BatchNorm's num_batches_tracked is not a model parameter and
            # Candle's floating-point model does not need it for inference.
            continue
        tensors[name] = value.detach().contiguous().to(dtype=torch.float32)
    if not tensors:
        raise ValueError("checkpoint contains no floating-point tensors")
    return tensors


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()

    tensors = load_state_dict(args.source)
    args.destination.parent.mkdir(parents=True, exist_ok=True)
    save_file(tensors, str(args.destination), metadata={
        "source": str(args.source),
        "source_sha256": sha256(args.source),
        "format": "DetailSemNet DSNet state dict, float32",
    })
    print(f"wrote {len(tensors)} tensors to {args.destination}")
    print(f"source sha256: {sha256(args.source)}")
    print(f"output sha256: {sha256(args.destination)}")


if __name__ == "__main__":
    main()