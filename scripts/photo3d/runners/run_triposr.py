"""TripoSR runner: RGBA cutout -> dense vertex-coloured mesh (.ply). Prints 'STAGE <0..1> <words>'."""
import argparse, os, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(HERE, "shim"))
sys.path.insert(1, os.path.join(ROOT, "engines", "TripoSR"))
os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")


def stage(f, w):
    print(f"STAGE {f:.2f} {w}", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rgba", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--mc-res", type=int, default=256)
    ap.add_argument("--device", default="mps")
    ap.add_argument("--fg-ratio", type=float, default=0.85)
    a = ap.parse_args()
    t0 = time.time()
    stage(0.0, "loading model")
    import numpy as np, torch
    from PIL import Image
    from tsr.system import TSR
    from tsr.utils import resize_foreground
    dev = a.device if (a.device != "mps" or torch.backends.mps.is_available()) else "cpu"
    model = TSR.from_pretrained("stabilityai/TripoSR", config_name="config.yaml", weight_name="model.ckpt")
    model.renderer.set_chunk_size(8192)
    model.to(dev)
    t1 = time.time()
    img = resize_foreground(Image.open(a.rgba).convert("RGBA"), a.fg_ratio)
    arr = np.array(img).astype(np.float32) / 255.0
    arr = arr[:, :, :3] * arr[:, :, 3:4] + (1 - arr[:, :, 3:4]) * 0.5
    img = Image.fromarray((arr * 255).astype(np.uint8))
    stage(0.3, "generating shape")
    with torch.no_grad():
        codes = model([img], device=dev)
    t2 = time.time()
    stage(0.6, "extracting mesh")
    mesh = model.extract_mesh(codes, True, resolution=a.mc_res)[0]
    t3 = time.time()
    mesh.export(a.out)
    print(f"TIMING load={t1-t0:.1f} infer={t2-t1:.1f} mesh={t3-t2:.1f} device={dev} faces={len(mesh.faces)}", flush=True)
    stage(1.0, "engine done")


if __name__ == "__main__":
    main()
