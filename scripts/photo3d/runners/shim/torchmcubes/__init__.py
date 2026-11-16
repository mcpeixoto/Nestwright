"""Drop-in for torchmcubes.marching_cubes using PyMCubes (BSD) on CPU.
torchmcubes returns vertices as (x=idx2, y=idx1, z=idx0); PyMCubes as (idx0, idx1, idx2)."""
import numpy as np
import torch
import mcubes


def marching_cubes(vol: torch.Tensor, thresh: float):
    v, f = mcubes.marching_cubes(vol.detach().cpu().numpy().astype(np.float64), float(thresh))
    v = v[:, ::-1].copy()
    return torch.from_numpy(v.astype(np.float32)), torch.from_numpy(f.astype(np.int64))
