"""Bake a base-colour texture for a shape-only mesh by projecting the input photo.

For every texel of an xatlas UV layout of the (simplified) mesh:
  1. visible to the inferred camera (depth test + facing + inside the photo's alpha) -> bilinear photo sample
  2. else its mirror across the model's left/right plane (x = centre) is visible -> sample there
  3. else fill from the coloured texels nearest in 3D (Gaussian-weighted, so it reads as the same material)
Then a gutter: every empty texel takes its nearest filled texel, so mip-mapping never pulls in black.
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.spatial import cKDTree


def _cam_rot(yaw_deg, pitch_deg):
    a, b = np.radians(yaw_deg), np.radians(pitch_deg)
    Ry = np.array([[np.cos(a), 0, -np.sin(a)], [0, 1, 0], [np.sin(a), 0, np.cos(a)]])
    Rx = np.array([[1, 0, 0], [0, np.cos(b), -np.sin(b)], [0, np.sin(b), np.cos(b)]])
    return Rx @ Ry


def _norm_proj(p2, G):
    lo, hi = p2.min(0), p2.max(0)
    sc = 0.8 * G / max(hi[1] - lo[1], 1e-9)
    return (p2 - (lo + hi) / 2) * sc + G / 2


def _iou_grid(sub, A, G, yaw, pitch):
    pc = sub @ _cam_rot(yaw, pitch).T
    q = np.clip(_norm_proj(pc[:, :2], G).astype(int), 0, G - 1)
    M = np.zeros((G, G), bool)
    M[q[:, 1], q[:, 0]] = True
    M = ndimage.binary_closing(M, iterations=2)
    return (M & A).sum() / max((M | A).sum(), 1)


def _mask_grid(al, G):
    ys, xs = np.where(al > 0.5)
    pts = np.stack([xs, al.shape[0] - 1 - ys], 1).astype(np.float64)
    A = np.zeros((G, G), bool)
    q = np.clip(_norm_proj(pts, G).astype(int), 0, G - 1)
    A[q[:, 1], q[:, 0]] = True
    return ndimage.binary_closing(A, iterations=1)


def fit_camera(v, al):
    """(iou, yaw, pitch) of the orthographic view whose silhouette best matches the alpha mask:
    coarse 10-degree search at 128 px, then 2-degree and 1-degree refinements at 256 px."""
    sub = v[:: max(1, len(v) // 20000)]
    A = _mask_grid(al, 128)
    best = max((_iou_grid(sub, A, 128, y, p), y, p) for p in range(-20, 41, 10) for y in range(-90, 91, 10))
    sub2 = v[:: max(1, len(v) // 80000)]
    A2 = _mask_grid(al, 256)
    for step, rad in ((2, 8), (1, 2)):
        _, y0, p0 = best
        best = max([best] + [(_iou_grid(sub2, A2, 256, y, p), y, p)
                             for p in range(max(-25, p0 - rad), p0 + rad + 1, step)
                             for y in range(y0 - rad, y0 + rad + 1, step)])
    return best


def make_camera(v, image_path, alpha_path):
    img = np.asarray(Image.open(image_path).convert("RGB"), np.float32) / 255
    al = np.asarray(Image.open(alpha_path).convert("L"), np.float32) / 255
    iou, yaw, pitch = fit_camera(v, al)
    R = _cam_rot(yaw, pitch)
    pc = v @ R.T
    H, W = al.shape
    ys, xs = np.where(al > 0.5)
    lo_i = np.array([xs.min(), H - 1 - ys.max()], float)
    hi_i = np.array([xs.max(), H - 1 - ys.min()], float)
    lo_m, hi_m = pc[:, :2].min(0), pc[:, :2].max(0)
    k = (hi_i[1] - lo_i[1]) / max(hi_m[1] - lo_m[1], 1e-9)
    # sample only well inside the cut-out: an eroded mask keeps background pixels off the silhouette edge
    al_in = ndimage.binary_erosion(al > 0.5, iterations=3).astype(np.float32)
    return {"R": R, "cm": (lo_m + hi_m) / 2, "ci": (lo_i + hi_i) / 2, "k": k, "img": img, "al": al_in,
            "H": H, "W": W, "yaw": yaw, "pitch": pitch, "iou": iou}


def to_pixels(cam, p):
    """3D points (final frame) -> (col, row, depth). depth grows towards the camera."""
    pc = p @ cam["R"].T
    xy = (pc[:, :2] - cam["cm"]) * cam["k"] + cam["ci"]
    return xy[:, 0], (cam["H"] - 1) - xy[:, 1], pc[:, 2]


def _bary_raster(tri2d, size_hw, values=None):
    """Yield (face, rows, cols, l1, l2, l3) for pixel centres inside each 2D triangle (x=col, y=row)."""
    H, W = size_hw
    for fi, t in enumerate(tri2d):
        x0, y0 = np.maximum(np.floor(t.min(0)).astype(int), 0)
        x1, y1 = np.minimum(np.ceil(t.max(0)).astype(int), [W - 1, H - 1])
        if x1 < x0 or y1 < y0:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        a, b, c = t
        d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(d) < 1e-12:
            continue
        l1 = ((b[1] - c[1]) * (xs - c[0]) + (c[0] - b[0]) * (ys - c[1])) / d
        l2 = ((c[1] - a[1]) * (xs - c[0]) + (a[0] - c[0]) * (ys - c[1])) / d
        l3 = 1 - l1 - l2
        m = (l1 >= -1e-4) & (l2 >= -1e-4) & (l3 >= -1e-4)
        if m.any():
            yield fi, (ys[m] - 0.5).astype(int), (xs[m] - 0.5).astype(int), l1[m], l2[m], l3[m]


def depth_map(cam, v, f, scale=1.0):
    H, W = int(cam["H"] * scale), int(cam["W"] * scale)
    u, w, z = to_pixels(cam, v)
    tri = np.stack([u[f] * scale, w[f] * scale], -1)
    zb = np.full((H, W), -np.inf)
    zf = z[f]
    for fi, rr, cc, l1, l2, l3 in _bary_raster(tri, (H, W)):
        zz = l1 * zf[fi, 0] + l2 * zf[fi, 1] + l3 * zf[fi, 2]
        cur = zb[rr, cc]
        upd = zz > cur
        zb[rr[upd], cc[upd]] = zz[upd]
    return zb, scale


def _bilinear(img, x, y):
    H, W = img.shape[:2]
    x = np.clip(x, 0, W - 1.001); y = np.clip(y, 0, H - 1.001)
    x0 = np.floor(x).astype(int); y0 = np.floor(y).astype(int)
    fx = (x - x0)[:, None]; fy = (y - y0)[:, None]
    return (img[y0, x0] * (1 - fx) * (1 - fy) + img[y0, x0 + 1] * fx * (1 - fy)
            + img[y0 + 1, x0] * (1 - fx) * fy + img[y0 + 1, x0 + 1] * fx * fy)


def _sample_visible(cam, zb, zscale, P, N, tol, min_facing=0.35):
    u, w, z = to_pixels(cam, P)
    facing = (N @ cam["R"].T)[:, 2]
    H, W = zb.shape
    ri = np.clip((w * zscale).astype(int), 0, H - 1)
    ci = np.clip((u * zscale).astype(int), 0, W - 1)
    inside = (u >= 0) & (u <= cam["W"] - 1) & (w >= 0) & (w <= cam["H"] - 1)
    al = cam["al"][np.clip(w.round().astype(int), 0, cam["H"] - 1), np.clip(u.round().astype(int), 0, cam["W"] - 1)]
    vis = inside & (facing > min_facing) & (z >= zb[ri, ci] - tol) & (al > 0.5)
    col = np.zeros((len(P), 3), np.float32)
    if vis.any():
        col[vis] = _bilinear(cam["img"], u[vis], w[vis])
    return vis, col


def bake_photo(v, f, cam, tex_size=1024, gutter=4, log=None):
    import xatlas
    atlas = xatlas.Atlas()
    atlas.add_mesh(v.astype(np.float32), f.astype(np.uint32))
    po = xatlas.PackOptions()
    po.resolution = tex_size
    po.padding = gutter
    po.bilinear = True
    co = xatlas.ChartOptions()
    co.max_cost = 8.0  # bigger charts: ~25% faster chart building, same texel use
    atlas.generate(chart_options=co, pack_options=po)
    vmap, idx, uv = atlas[0]
    nv = v[vmap]
    S = tex_size
    fn = np.cross(nv[idx[:, 1]] - nv[idx[:, 0]], nv[idx[:, 2]] - nv[idx[:, 0]])
    fn /= np.linalg.norm(fn, axis=1, keepdims=True) + 1e-12
    # texel rasterisation in UV space (row 0 = top = v 1)
    tri = np.stack([uv[idx][:, :, 0] * S, (1 - uv[idx][:, :, 1]) * S], -1)
    rows, cols, P, N = [], [], [], []
    W3 = nv[idx]
    for fi, rr, cc, l1, l2, l3 in _bary_raster(tri, (S, S)):
        rows.append(rr); cols.append(cc)
        P.append(l1[:, None] * W3[fi, 0] + l2[:, None] * W3[fi, 1] + l3[:, None] * W3[fi, 2])
        N.append(np.repeat(fn[fi][None], len(rr), 0))
    rows = np.concatenate(rows); cols = np.concatenate(cols); P = np.concatenate(P); N = np.concatenate(N)
    ext = np.ptp(v, 0)
    zb, zs = depth_map(cam, v, f, scale=1.0)
    tol = 0.01 * ext.max()
    vis, col = _sample_visible(cam, zb, zs, P, N, tol)
    # mirror across the left/right plane
    cx = (v[:, 0].min() + v[:, 0].max()) / 2
    Pm = P.copy(); Pm[:, 0] = 2 * cx - Pm[:, 0]
    Nm = N.copy(); Nm[:, 0] = -Nm[:, 0]
    todo = ~vis
    vis_m, col_m = _sample_visible(cam, zb, zs, Pm[todo], Nm[todo], 3 * tol)
    col[np.where(todo)[0][vis_m]] = col_m[vis_m]
    have = vis.copy(); have[np.where(todo)[0][vis_m]] = True
    # fill the rest so unseen sides read as the same material: cluster the seen colours into a few
    # materials, give each unseen texel the material most of its nearest seen texels (in 3D, weighted by
    # distance and normal agreement) belong to, and use that material's median colour with a little of
    # the local average for shading variation.
    rest = ~have
    if rest.any() and have.any():
        from scipy.cluster.vq import kmeans2
        src = np.where(have)[0]
        sub = src[:: max(1, len(src) // 120000)]
        rng = np.random.default_rng(0)
        k = 4
        cs = col[sub].astype(np.float64)
        lum = cs.mean(1, keepdims=True)
        # cluster mostly on chroma so a material's highlights and shadows stay one material
        feat = np.concatenate([(cs - lum) * 3.0, lum * 0.5], 1)
        cent, lab = kmeans2(feat, k, minit="++", seed=rng)
        med = np.stack([np.median(col[sub][lab == j], 0) if (lab == j).any() else cent[j] for j in range(k)])
        tree = cKDTree(P[sub])
        col_sub, N_sub = col[sub], N[sub]
        sigma = 0.05 * ext.max()
        ridx = np.where(rest)[0]
        out = np.zeros((len(ridx), 3), np.float32)
        for a in range(0, len(ridx), 200000):
            rr = ridx[a:a + 200000]
            d, nn = tree.query(P[rr], k=32)
            wgt = np.exp(-0.5 * (d / sigma) ** 2) * np.clip((N_sub[nn] * N[rr][:, None]).sum(-1), 0.05, 1) + 1e-9
            votes = np.zeros((len(rr), k))
            for j in range(k):
                votes[:, j] = (wgt * (lab[nn] == j)).sum(1)
            best = votes.argmax(1)
            local = (col_sub[nn] * wgt[..., None]).sum(1) / wgt.sum(1, keepdims=True)
            out[a:a + len(rr)] = 0.85 * med[best] + 0.15 * local
        col[rest] = out
    tex = np.zeros((S, S, 3), np.float32)
    filled = np.zeros((S, S), bool)
    tex[rows, cols] = col
    filled[rows, cols] = True
    # gutter + background: nearest filled texel everywhere else (mip-safe)
    _, (iy, ix) = ndimage.distance_transform_edt(~filled, return_indices=True)
    tex = tex[iy, ix]
    if log:
        n = len(P)
        log(f"photobake: camera yaw={cam['yaw']} pitch={cam['pitch']} iou={cam['iou']:.3f} texels={n} "
            f"seen={vis.mean():.2f} mirrored={vis_m.sum()/n:.2f} filled={rest.mean():.2f}")
    img = Image.fromarray((np.clip(tex, 0, 1) * 255).astype(np.uint8))
    return nv, idx.astype(np.int64), uv, img
