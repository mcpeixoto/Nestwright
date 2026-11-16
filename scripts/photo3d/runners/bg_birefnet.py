"""Background removal with BiRefNet (MIT, ZhengPeng7/BiRefNet pinned at e2bf8e4) in PyTorch on MPS, fp16.
Usage: bg_birefnet.py <in> <out.png> [size]. RGBA inputs with real alpha are kept as is."""
import os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "engines"))
import numpy as np
from PIL import Image, ImageOps

REV = "e2bf8e4460fc8fa32bba5ea4d94b3233d367b0e4"


def main():
    src, dst = sys.argv[1], sys.argv[2]
    size = int(sys.argv[3]) if len(sys.argv) > 3 else 1024
    im = ImageOps.exif_transpose(Image.open(src))
    if im.mode == "RGBA" and np.array(im)[..., 3].min() < 250:
        im.save(dst); print("kept-alpha"); return
    im = im.convert("RGB")
    import torch
    from safetensors.torch import load_file
    from huggingface_hub import hf_hub_download
    from birefnet_code.birefnet import BiRefNet
    from birefnet_code.BiRefNet_config import BiRefNetConfig
    dev = "mps" if torch.backends.mps.is_available() else "cpu"
    dt = torch.float16 if dev == "mps" else torch.float32
    w = hf_hub_download("ZhengPeng7/BiRefNet", "model.safetensors", revision=REV)
    model = BiRefNet(bb_pretrained=False, config=BiRefNetConfig(bb_pretrained=False))
    model.load_state_dict(load_file(w))
    model.to(dev, dt).eval()
    x = np.asarray(im.resize((size, size), Image.BILINEAR), np.float32) / 255
    x = (x - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]
    x = torch.from_numpy(x.transpose(2, 0, 1)[None].astype(np.float32)).to(dev, dt)
    t = time.time()
    with torch.no_grad():
        pred = model(x)[-1].sigmoid().float().cpu()[0, 0].numpy()
    m = Image.fromarray((pred * 255).astype(np.uint8)).resize(im.size, Image.BILINEAR)
    a = np.asarray(m)
    if (a > 127).mean() < 0.01:
        print("no object found", file=sys.stderr); sys.exit(3)
    out = im.convert("RGBA"); out.putalpha(m); out.save(dst)
    print(f"birefnet-torch {size} {dev} {time.time()-t:.1f}s")


if __name__ == "__main__":
    main()
