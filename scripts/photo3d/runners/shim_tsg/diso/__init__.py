"""Stub: diso (CUDA marching cubes) is unavailable on macOS; the hierarchical skimage path is used instead."""
class DiffDMC:
    def __init__(self, *a, **k):
        raise RuntimeError("diso is CUDA-only; use use_flash_decoder=False")
