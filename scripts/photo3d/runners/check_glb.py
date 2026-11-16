"""Validate a GLB against the game contract. check_glb.py <file.glb>..."""
import sys, json, struct
import numpy as np, trimesh
from pygltflib import GLTF2
for p in sys.argv[1:]:
    g = GLTF2().load(p)
    m = trimesh.load(p, force="mesh")
    v = np.asarray(m.vertices)
    mats = g.materials
    pbr = mats[0].pbrMetallicRoughness if mats else None
    tex = m.visual.material.baseColorTexture.size if hasattr(m.visual, "material") and getattr(m.visual.material, "baseColorTexture", None) is not None else None
    ok = (len(m.faces) <= 30000 and len(mats) == 1 and tex and max(tex) <= 1024 and abs(v[:, 1].min()) < 1e-4
          and abs((v[:, 0].min() + v[:, 0].max()) / 2) < 1e-3 and abs((v[:, 2].min() + v[:, 2].max()) / 2) < 1e-3)
    print(f"{'OK ' if ok else 'BAD'} {p.split('/')[-1]}: tris={len(m.faces)} materials={len(mats)} tex={tex} "
          f"rough={pbr.roughnessFactor if pbr else None} metal={pbr.metallicFactor if pbr else None} "
          f"ymin={v[:,1].min():.4f} extent={np.ptp(v,0).round(3).tolist()}")
