"""TripoSG runner (shape only): RGBA cutout -> dense mesh (.ply) + the prepared input/alpha images
(<out>.input.png, <out>.alpha.png) that the texture baker projects. Prints 'STAGE <0..1> <words>'.

v2: the pipeline is stopped after the last diffusion step and the SDF is extracted with
runners/tsg_extract.py (coarser dense grid + band refinement, ~1 min instead of ~1.6 min). Each step
synchronises the GPU so progress is real (MPS queues work asynchronously)."""
import argparse, os, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(1, os.path.join(HERE, "shim_tsg"))
sys.path.insert(2, os.path.join(ROOT, "engines", "TripoSG"))
os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")


def stage(f, w):
    print(f"STAGE {f:.2f} {w}", flush=True)


def prep(path, pad=0.1, size=512):
    import numpy as np
    from PIL import Image
    a = np.array(Image.open(path).convert("RGBA")).astype(np.float32) / 255
    al = a[..., 3]
    ys, xs = np.where(al > 0.5)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgb = a[..., :3] * al[..., None] + (1 - al[..., None])
    crop, ca = rgb[y0:y1, x0:x1], al[y0:y1, x0:x1]
    h, w = crop.shape[:2]
    side = int(max(h, w) * (1 + 2 * pad))
    out = np.ones((side, side, 3), np.float32); oa = np.zeros((side, side), np.float32)
    oy, ox = (side - h) // 2, (side - w) // 2
    out[oy:oy + h, ox:ox + w] = crop; oa[oy:oy + h, ox:ox + w] = ca
    im = Image.fromarray((out * 255).astype(np.uint8)).resize((size, size), Image.LANCZOS)
    am = Image.fromarray((oa * 255).astype(np.uint8)).resize((size, size), Image.LANCZOS)
    return im, am


class _Stop(Exception):
    pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rgba", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--steps", type=int, default=30)
    ap.add_argument("--d0", type=int, default=6, help="dense grid = 2^d0")
    ap.add_argument("--d1", type=int, default=8, help="final grid = 2^d1")
    ap.add_argument("--band", type=float, default=3.0)
    ap.add_argument("--chunk", type=int, default=50000)
    ap.add_argument("--device", default="mps")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--tokens", type=int, default=2048, help="latent tokens (model default 2048)")
    ap.add_argument("--latents-out", default=None, help="debug: also save the final latents")
    a = ap.parse_args()
    t0 = time.time()
    stage(0.0, "loading model")
    import numpy as np, torch, trimesh
    from huggingface_hub import snapshot_download
    from triposg.pipelines.pipeline_triposg import TripoSGPipeline
    import tsg_extract

    wdir = snapshot_download(repo_id="VAST-AI/TripoSG")
    dev = a.device if torch.backends.mps.is_available() else "cpu"
    dtype = torch.float16 if dev == "mps" else torch.float32
    pipe = TripoSGPipeline.from_pretrained(wdir).to(dev, dtype)
    sync = torch.mps.synchronize if dev == "mps" else (lambda: None)
    t1 = time.time()
    img, alpha = prep(a.rgba)
    stage(0.1, "generating shape")
    got = {}

    def cb(p, i, t, kw):
        sync()
        stage(0.1 + 0.75 * (i + 1) / a.steps, "generating shape")
        if i == a.steps - 1:
            got["latents"] = kw["latents"].detach()
            raise _Stop()
        return kw

    try:
        with torch.no_grad():
            pipe(image=img, generator=torch.Generator(device="cpu").manual_seed(a.seed),
                 num_inference_steps=a.steps, guidance_scale=7.0, use_flash_decoder=False, num_tokens=a.tokens,
                 callback_on_step_end=cb)
    except _Stop:
        pass
    lat = got["latents"]
    if a.latents_out:
        torch.save(lat.cpu(), a.latents_out)
    t2 = time.time()
    stage(0.86, "extracting mesh")
    with torch.no_grad():
        v, f = tsg_extract.extract(pipe.vae, lat, a.d0, a.d1, chunk=a.chunk, band=a.band,
                                   log=lambda s: print(s, file=sys.stderr, flush=True))
    t3 = time.time()
    trimesh.Trimesh(v, f, process=False).export(a.out)
    img.save(a.out + ".input.png"); alpha.save(a.out + ".alpha.png")
    print(f"TIMING load={t1-t0:.1f} diffusion={t2-t1:.1f} extract={t3-t2:.1f} steps={a.steps} device={dev} faces={len(f)}", flush=True)
    stage(1.0, "engine done")


if __name__ == "__main__":
    main()
