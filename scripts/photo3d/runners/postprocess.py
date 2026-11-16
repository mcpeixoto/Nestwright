"""Turn a dense engine mesh into a game-ready GLB.

Y-up, sitting on y=0, centred on x/z, <= max_faces triangles, one PBR material
(baseColorTexture <= tex_size, roughness 0.7, metallic 0), front towards +Z.
"""
import sys
import numpy as np
import trimesh
from PIL import Image
from scipy.spatial import cKDTree
from scipy import ndimage


def load_dense(path):
    m = trimesh.load(path, force="mesh", process=False)
    if isinstance(m.visual, trimesh.visual.TextureVisuals):
        m.visual = m.visual.to_color()
    cols = np.asarray(m.visual.vertex_colors, dtype=np.float32)[:, :3] / 255.0
    return np.asarray(m.vertices, np.float64), np.asarray(m.faces, np.int64), cols


def clean(v, f, c, keep_frac=0.02):
    m = trimesh.Trimesh(v, f, process=False)
    comps = m.split(only_watertight=False)
    if len(comps) > 1:
        big = max(len(x.faces) for x in comps)
        lab = trimesh.graph.connected_component_labels(m.face_adjacency, node_count=len(f))
        counts = np.bincount(lab)
        keep = counts[lab] >= keep_frac * big
        f = f[keep]
    used = np.unique(f)
    remap = -np.ones(len(v), np.int64)
    remap[used] = np.arange(len(used))
    return v[used], remap[f], c[used]


def _rot(a):
    ca, sa = np.cos(a), np.sin(a)
    # rotation about +Y by angle a
    return np.array([[ca, 0, sa], [0, 1, 0], [-sa, 0, ca]])


def upright(v, max_tilt_deg=40.0):
    """Single-view engines bake the photo's camera elevation into the object frame (the object
    leans). Use the minimum-volume oriented box: its axis closest to +Y becomes the new up.
    Returns rotated v and the tilt removed in degrees."""
    pts = v[:: max(1, len(v) // 20000)]
    try:
        T, _ = trimesh.bounds.oriented_bounds(pts)
    except Exception:
        return v, 0.0
    axes = T[:3, :3]  # rows: OBB axes in world coordinates
    k = int(np.argmax(np.abs(axes[:, 1])))
    a = axes[k] * np.sign(axes[k, 1])
    tilt = np.degrees(np.arccos(np.clip(a[1], -1, 1)))
    if tilt < 0.5 or tilt > max_tilt_deg:
        return v, 0.0
    # rotate a onto +Y (Rodrigues)
    y = np.array([0.0, 1.0, 0.0])
    ax = np.cross(a, y); sn = np.linalg.norm(ax); cs = float(a @ y)
    ax /= sn
    K = np.array([[0, -ax[2], ax[1]], [ax[2], 0, -ax[0]], [-ax[1], ax[0], 0]])
    R = np.eye(3) + sn * K + (1 - cs) * K @ K
    return v @ R.T, tilt


def orient(v, cam_dir_to_viewer):
    """v already Y-up, input camera direction known. Rotate about Y so the footprint's minimum-area
    box is axis aligned, choosing among the 4 such yaws the one whose +Z points most toward the
    camera (the photographed side is assumed to be the front). Returns rotated v and the angle
    between +Z and the camera direction."""
    pts = v[:: max(1, len(v) // 20000)]
    xz = pts[:, [0, 2]]
    angs = np.radians(np.arange(0, 90, 0.5))
    areas = []
    for a in angs:
        ca, sa = np.cos(a), np.sin(a)
        x = ca * xz[:, 0] + sa * xz[:, 1]
        z = -sa * xz[:, 0] + ca * xz[:, 1]
        areas.append(np.ptp(x) * np.ptp(z))
    a0 = angs[int(np.argmin(areas))]
    cam = np.asarray(cam_dir_to_viewer, float)
    cam = cam / (np.linalg.norm(cam) + 1e-9)
    best = None
    for k in range(4):
        R = _rot(a0 + k * np.pi / 2)
        cz = (R @ cam)[2]
        if best is None or cz > best[0]:
            best = (cz, R)
    return v @ best[1].T, np.degrees(np.arccos(np.clip(best[0], -1, 1)))


def simplify(v, f, max_faces):
    if len(f) <= max_faces:
        return v, f
    import fast_simplification
    red = 1.0 - (max_faces * 0.98) / len(f)
    v2, f2 = fast_simplification.simplify(v.astype(np.float32), f.astype(np.int32), target_reduction=red)
    return v2.astype(np.float64), f2.astype(np.int64)


def bake(v, f, dense_v, dense_c, tex_size):
    import xatlas
    vmap, idx, uv = xatlas.parametrize(v.astype(np.float32), f.astype(np.uint32))
    nv = v[vmap]
    S = tex_size
    tex = np.zeros((S, S, 3), np.float32)
    filled = np.zeros((S, S), bool)
    P = uv[idx] * (S - 1)  # (F,3,2) texel space, origin bottom-left
    W = nv[idx]  # (F,3,3)
    pix_pos, pix_xy = [], []
    for tri, wp in zip(P, W):
        x0, y0 = np.floor(tri.min(0)).astype(int)
        x1, y1 = np.ceil(tri.max(0)).astype(int)
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        pts = np.stack([xs.ravel(), ys.ravel()], 1).astype(np.float64)
        a, b, c = tri
        d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(d) < 1e-12:
            continue
        l1 = ((b[1] - c[1]) * (pts[:, 0] - c[0]) + (c[0] - b[0]) * (pts[:, 1] - c[1])) / d
        l2 = ((c[1] - a[1]) * (pts[:, 0] - c[0]) + (a[0] - c[0]) * (pts[:, 1] - c[1])) / d
        l3 = 1 - l1 - l2
        ins = (l1 >= -0.02) & (l2 >= -0.02) & (l3 >= -0.02)
        if not ins.any():
            continue
        L = np.stack([l1[ins], l2[ins], l3[ins]], 1)
        pix_pos.append(L @ wp)
        pix_xy.append(pts[ins].astype(int))
    pos = np.concatenate(pix_pos)
    xy = np.clip(np.concatenate(pix_xy), 0, S - 1)
    tree = cKDTree(dense_v)
    dist, nn = tree.query(pos, k=4)
    w = 1.0 / (dist + 1e-6)
    col = (dense_c[nn] * w[..., None]).sum(1) / w.sum(1, keepdims=True)
    rows = (S - 1) - xy[:, 1]  # image row 0 = top = v 1
    tex[rows, xy[:, 0]] = col
    filled[rows, xy[:, 0]] = True
    # dilate to hide seams
    for _ in range(8):
        if filled.all():
            break
        _, (iy, ix) = ndimage.distance_transform_edt(~filled, return_indices=True)
        ring = ndimage.binary_dilation(filled) & ~filled
        tex[ring] = tex[iy[ring], ix[ring]]
        filled |= ring
    img = Image.fromarray((np.clip(tex, 0, 1) * 255).astype(np.uint8))
    return nv, idx.astype(np.int64), uv, img


def finish(v, f, uv, img, out_path):
    mn, mx = v.min(0), v.max(0)
    v = v - np.array([(mn[0] + mx[0]) / 2, mn[1], (mn[2] + mx[2]) / 2])
    mat = trimesh.visual.material.PBRMaterial(
        name="photo3d", baseColorTexture=img, roughnessFactor=0.7, metallicFactor=0.0,
        baseColorFactor=[255, 255, 255, 255])
    vis = trimesh.visual.TextureVisuals(uv=uv, material=mat)
    m = trimesh.Trimesh(v, f, visual=vis, process=False)
    m.export(out_path)
    return m


def _cam_rot(yaw_deg, pitch_deg):
    """World -> camera rotation for a camera at azimuth yaw (about +Y, 0 = on +Z) looking down by pitch."""
    a, b = np.radians(yaw_deg), np.radians(pitch_deg)
    Ry = np.array([[np.cos(a), 0, -np.sin(a)], [0, 1, 0], [np.sin(a), 0, np.cos(a)]])
    Rx = np.array([[1, 0, 0], [0, np.cos(b), -np.sin(b)], [0, np.sin(b), np.cos(b)]])
    return Rx @ Ry


def _norm_proj(p2, G, lo=None, hi=None):
    lo = p2.min(0) if lo is None else lo
    hi = p2.max(0) if hi is None else hi
    sc = 0.8 * G / max(hi[1] - lo[1], 1e-9)
    c = (lo + hi) / 2
    return (p2 - c) * sc + G / 2


def fit_camera(v, al, G=128):
    """Find (yaw, pitch) whose orthographic silhouette best matches the photo's alpha (IoU)."""
    ys, xs = np.where(al > 0.5)
    pts = np.stack([xs, al.shape[0] - 1 - ys], 1).astype(np.float64)
    A = np.zeros((G, G), bool)
    q = np.clip(_norm_proj(pts, G).astype(int), 0, G - 1)
    A[q[:, 1], q[:, 0]] = True
    sub = v[:: max(1, len(v) // 60000)]
    best = (-1, 0, 0)
    for pitch in range(0, 41, 5):
        for yaw in range(-90, 91, 5):
            pc = sub @ _cam_rot(yaw, pitch).T
            q = np.clip(_norm_proj(pc[:, :2], G).astype(int), 0, G - 1)
            M = np.zeros((G, G), bool)
            M[q[:, 1], q[:, 0]] = True
            M = ndimage.binary_closing(M, iterations=2)
            iou = (M & A).sum() / max((M | A).sum(), 1)
            if iou > best[0]:
                best = (iou, yaw, pitch)
    return best


def project_colors(v, f, image_path, alpha_path, grid=384, fit=True):
    """Shape-only engines: colour vertices by orthographic projection of the input photo from the
    camera pose whose silhouette best matches the photo. Hidden vertices take the nearest visible colour."""
    img = np.asarray(Image.open(image_path).convert("RGB"), np.float32) / 255
    al = np.asarray(Image.open(alpha_path).convert("L"), np.float32) / 255
    H, W = al.shape
    iou, yaw, pitch = fit_camera(v, al) if fit else (0, 0, 0)
    R = _cam_rot(yaw, pitch)
    pc = v @ R.T
    ys, xs = np.where(al > 0.5)
    lo_i = np.array([xs.min(), H - 1 - ys.max()], float); hi_i = np.array([xs.max(), H - 1 - ys.min()], float)
    # map mesh-projected coords into image pixels: same normalisation both ways
    G = 1000.0
    n_mesh = _norm_proj(pc[:, :2], G)
    sc_i = 0.8 * G / (hi_i[1] - lo_i[1]); c_i = (lo_i + hi_i) / 2
    pix = (n_mesh - G / 2) / sc_i + c_i
    u = pix[:, 0]; w = (H - 1) - pix[:, 1]
    m = trimesh.Trimesh(v, f, process=False)
    nz = m.vertex_normals @ R.T
    gi = np.clip((u / W * grid).astype(int), 0, grid - 1)
    gj = np.clip((w / H * grid).astype(int), 0, grid - 1)
    zbuf = np.full((grid, grid), -np.inf)
    np.maximum.at(zbuf, (gj, gi), pc[:, 2])
    depth_tol = 0.02 * np.ptp(pc[:, 2])
    ui = np.clip(u.round().astype(int), 0, W - 1)
    wi = np.clip(w.round().astype(int), 0, H - 1)
    vis = (pc[:, 2] >= zbuf[gj, gi] - depth_tol) & (nz[:, 2] > 0.05) & (al[wi, ui] > 0.5)
    c = np.full((len(v), 3), 0.5, np.float32)
    c[vis] = img[wi[vis], ui[vis]]
    if vis.any() and (~vis).any():
        _, nn = cKDTree(v[vis]).query(v[~vis], k=1)
        c[~vis] = c[vis][nn]
    print(f"project_colors: camera yaw={yaw} pitch={pitch} iou={iou:.3f} visible={vis.mean():.2f}", file=sys.stderr)
    return c


def run(dense_path, out_path, engine_to_yup, cam_dir, max_faces=30000, tex_size=1024, log=print, project=None,
        photo_texture=True, fix_tilt=True):
    v, f, c = load_dense(dense_path)
    n_raw = len(f)
    v = v @ np.asarray(engine_to_yup, float).T
    v, f, c = clean(v, f, c)
    cam = None
    if project and photo_texture:
        import photobake
        cam = photobake.make_camera(v, *project)
    elif project:
        c = project_colors(v, f, *project)
    v0 = v.copy()
    v, tilt = upright(v) if fix_tilt else (v, 0.0)
    v, yaw_off = orient(v, cam_dir)
    if cam is not None:
        # upright/orient are pure rotations: v = v0 @ X. Camera coords pc = v0 @ R.T = v @ (R @ X).T
        X, *_ = np.linalg.lstsq(v0[::50], v[::50], rcond=None)
        cam["R"] = cam["R"] @ X
    dense_v = v.copy()
    log(0.75, "simplifying")
    sv, sf = simplify(v, f, max_faces)
    log(0.82, "texturing")
    if cam is not None:
        import photobake
        nv, idx, uv, img = photobake.bake_photo(sv, sf, cam, tex_size, log=lambda m: print(m, file=sys.stderr))
    else:
        nv, idx, uv, img = bake(sv, sf, dense_v, c, tex_size)
    log(0.95, "writing")
    m = finish(nv, idx, uv, img, out_path)
    return {"faces_raw": n_raw, "faces_out": len(idx), "extent": np.ptp(nv, 0).round(3).tolist(),
            "front_off_camera_deg": round(float(yaw_off), 1), "tilt_fixed_deg": round(float(tilt), 1)}
