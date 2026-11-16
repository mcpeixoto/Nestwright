"""Headless software preview of a GLB (texture sampled per pixel, Lambert shading):
input photo | front (+Z) | 3/4 | side (+X) | back 3/4.
Usage: preview.py <model.glb> <out.png> [input_image]"""
import sys
import numpy as np
import trimesh
from PIL import Image, ImageDraw

S = 420


def render(v, f, yaw, pitch, tex=None, fuv=None, fcol=None):
    cy, sy = np.cos(np.radians(yaw)), np.sin(np.radians(yaw))
    cp, sp = np.cos(np.radians(pitch)), np.sin(np.radians(pitch))
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rx = np.array([[1, 0, 0], [0, cp, -sp], [0, sp, cp]])
    p = v @ (Rx @ Ry).T
    p = p - (p.max(0) + p.min(0)) / 2
    s = 0.9 * S / max(np.ptp(p[:, 0]), np.ptp(p[:, 1]))
    X = p[:, 0] * s + S / 2
    Y = S / 2 - p[:, 1] * s
    Z = p[:, 2]
    n = np.cross(p[f[:, 1]] - p[f[:, 0]], p[f[:, 2]] - p[f[:, 0]])
    n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-12
    light = np.array([0.3, 0.5, 0.8]); light /= np.linalg.norm(light)
    shade = 0.35 + 0.65 * np.abs(n @ light)
    img = np.full((S, S, 3), 0.92)
    zb = np.full((S, S), -np.inf)
    if tex is not None:
        TH, TW = tex.shape[:2]
    for i in range(len(f)):
        t = np.stack([X[f[i]], Y[f[i]]], 1)
        x0, y0 = np.maximum(np.floor(t.min(0)).astype(int), 0)
        x1, y1 = np.minimum(np.ceil(t.max(0)).astype(int), S - 1)
        if x1 < x0 or y1 < y0:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        a, b, c = t
        d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(d) < 1e-9:
            continue
        l1 = ((b[1] - c[1]) * (xs - c[0]) + (c[0] - b[0]) * (ys - c[1])) / d
        l2 = ((c[1] - a[1]) * (xs - c[0]) + (a[0] - c[0]) * (ys - c[1])) / d
        l3 = 1 - l1 - l2
        m = (l1 >= 0) & (l2 >= 0) & (l3 >= 0)
        z = l1 * Z[f[i, 0]] + l2 * Z[f[i, 1]] + l3 * Z[f[i, 2]]
        sub = zb[y0:y1 + 1, x0:x1 + 1]
        m &= z > sub
        if not m.any():
            continue
        sub[m] = z[m]
        if tex is not None:
            uv = l1[m, None] * fuv[i, 0] + l2[m, None] * fuv[i, 1] + l3[m, None] * fuv[i, 2]
            col = tex[np.clip(((1 - uv[:, 1]) * (TH - 1)).astype(int), 0, TH - 1),
                      np.clip((uv[:, 0] * (TW - 1)).astype(int), 0, TW - 1)]
        else:
            col = fcol[i][None]
        img[y0:y1 + 1, x0:x1 + 1][m] = np.clip(col * shade[i], 0, 1)
    return Image.fromarray((img * 255).astype(np.uint8))


def main():
    glb, out = sys.argv[1], sys.argv[2]
    m = trimesh.load(glb, force="mesh")
    v, f = np.asarray(m.vertices), np.asarray(m.faces)
    vis = m.visual
    kw = {}
    if isinstance(vis, trimesh.visual.TextureVisuals) and vis.uv is not None:
        kw["tex"] = np.asarray(vis.material.baseColorTexture.convert("RGB"), np.float32) / 255
        kw["fuv"] = np.asarray(vis.uv)[f]
    else:
        kw["fcol"] = np.asarray((vis.to_color() if hasattr(vis, "to_color") else vis).vertex_colors, np.float32)[f][:, :, :3].mean(1) / 255
    views = [render(v, f, 0, 0, **kw), render(v, f, -35, 20, **kw), render(v, f, -90, 0, **kw), render(v, f, 145, 20, **kw)]
    labels = ["front (+Z)", "3/4", "side (+X)", "back 3/4"]
    tiles = []
    if len(sys.argv) > 3:
        ph = Image.open(sys.argv[3]).convert("RGB"); ph.thumbnail((S, S))
        t = Image.new("RGB", (S, S), (255, 255, 255)); t.paste(ph, ((S - ph.width) // 2, (S - ph.height) // 2))
        tiles.append(t); labels.insert(0, "input")
    tiles += views
    canvas = Image.new("RGB", (S * len(tiles), S + 42), (255, 255, 255))
    d = ImageDraw.Draw(canvas)
    for i, (t, l) in enumerate(zip(tiles, labels)):
        canvas.paste(t, (S * i, 20)); d.text((S * i + 6, 4), l, fill=(0, 0, 0))
    ext = np.ptp(v, 0)
    d.text((6, S + 26), f"{len(f)} tris  extent x/y/z {ext[0]:.2f}/{ext[1]:.2f}/{ext[2]:.2f}  ymin {v[:,1].min():.3f}", fill=(0, 0, 0))
    canvas.save(out)


if __name__ == "__main__":
    main()
