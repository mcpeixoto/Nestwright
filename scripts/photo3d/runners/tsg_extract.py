"""Faster hierarchical SDF extraction for TripoSG on MPS (replaces triposg.inference_utils.hierarchical_extract_geometry).
Same idea as upstream: dense coarse grid, then refine only a band around the surface at 2x resolution.
Differences: explicit query chunking tuned for MPS, a narrower refinement band (|logit| < band) instead of
fp16 sigmoid saturation, and synchronised timings."""
import time
import numpy as np
import torch
import torch.nn.functional as F
from skimage import measure


def _sync(dev):
    if str(dev).startswith("mps"):
        torch.mps.synchronize()


def query(vae, latents, pts, chunk):
    """pts (N,3) on device -> logits (N,) float32 on device."""
    out = vae._decode(latents, pts[None].to(latents.dtype), num_chunks=chunk).sample
    return out[0, :, 0].float()


def extract(vae, latents, d0=7, d1=8, bounds=1.005, chunk=50000, band=None, log=None):
    dev = latents.device
    t = {}
    t0 = time.time()
    N0 = 2 ** d0
    lin = torch.linspace(-bounds, bounds, N0, device=dev, dtype=torch.float32)
    xs, ys, zs = torch.meshgrid(lin, lin, lin, indexing="ij")
    pts = torch.stack([xs, ys, zs], -1).view(-1, 3)
    grid = query(vae, latents, pts, chunk).view(N0, N0, N0)
    _sync(dev); t["dense"] = time.time() - t0; n_q = pts.shape[0]
    for d in range(d0 + 1, d1 + 1):
        t1 = time.time()
        N = 2 ** d
        hi = F.interpolate(grid[None, None], scale_factor=2, mode="trilinear", align_corners=False)[0, 0]
        if band is None:   # upstream: sigmoid(fp16)*2-1 saturation => roughly |logit| < ~8
            core = torch.sigmoid(grid[1:-1, 1:-1, 1:-1].half()) * 2 - 1
            sel = core.abs() < 1.0
        else:
            sel = grid[1:-1, 1:-1, 1:-1].abs() < band
        m = torch.zeros_like(grid)
        m[1:-1, 1:-1, 1:-1] = sel.float()
        k = 5 if N0 < 256 else 3
        m = F.max_pool3d(m[None, None], k, stride=1, padding=k // 2)[0, 0] > 0
        lo = torch.nonzero(m)  # coarse voxel indices
        off = torch.tensor([[i, j, l] for i in (0, 1) for j in (0, 1) for l in (0, 1)], device=dev)
        idx = (lo[:, None, :] * 2 + off[None]).view(-1, 3)
        p = (idx.float() - N / 2) * (bounds / (N / 2))
        vals = query(vae, latents, p, chunk)
        hi[idx[:, 0], idx[:, 1], idx[:, 2]] = vals
        grid = hi; N0 = N
        _sync(dev); t[f"refine{d}"] = time.time() - t1; n_q += p.shape[0]
    t2 = time.time()
    g = grid.cpu().numpy()
    v, f, _, _ = measure.marching_cubes(g, 0, method="lewiner")
    v = v / (2 ** d1) * (2 * bounds) - bounds
    t["mc"] = time.time() - t2
    if log:
        log(f"extract d0={d0} d1={d1} chunk={chunk} band={band} queries={n_q} " + " ".join(f"{k}={x:.1f}s" for k, x in t.items()))
    return v.astype(np.float32), np.ascontiguousarray(f)
