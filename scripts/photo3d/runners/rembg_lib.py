"""Background removal (rembg, MIT code; BiRefNet weights MIT / ISNet Apache-2.0). RGBA inputs with real alpha keep it."""
import numpy as np
from PIL import Image, ImageOps


def cut(src, dst, model="birefnet-general"):
    im = ImageOps.exif_transpose(Image.open(src))
    if im.mode == "RGBA" and np.array(im)[..., 3].min() < 250:
        im.save(dst)
        return "kept-alpha"
    im = im.convert("RGB")
    im.thumbnail((1536, 1536))
    import rembg
    out = rembg.remove(im, session=rembg.new_session(model), post_process_mask=True)
    a = np.array(out)
    if (a[..., 3] > 127).sum() < 0.01 * a[..., 3].size:
        raise RuntimeError("background removal found no object")
    out.save(dst)
    return model
