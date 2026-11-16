#!/usr/bin/env python3
"""photo3d: photo(s) of a piece of furniture -> game-ready GLB.

photo3d.sh --out <file.glb> [--engine <name>] [--quality fast|best] <image> [<image>...]

stdout protocol: 'PROGRESS <0..1> <stage words>' lines, then 'DONE <path>' (exit 0)
or 'ERROR <message>' (exit != 0). Diagnostics go to stderr.
"""
import argparse
import os
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
RUNNERS = os.path.join(HERE, "runners")
ENGINES = os.path.join(HERE, "engines")
sys.path.insert(0, RUNNERS)

# Each engine: venv python, runner script, args per quality, transform engine frame -> Y-up with
# the input camera on +Z, and whether it can use several views.
ENGINE_TABLE = {
    "triposr": {
        "python": os.path.join(ENGINES, "venv-tsr", "bin", "python"),
        "runner": os.path.join(RUNNERS, "run_triposr.py"),
        "args": {"fast": ["--mc-res", "192"], "best": ["--mc-res", "320"]},
        # TripoSR: z up, input camera on +x  ->  X=y, Y=z, Z=x (proper rotation, det=+1)
        "to_yup": [[0, 1, 0], [0, 0, 1], [1, 0, 0]],
        "multiview": False,
    },
    "triposg": {
        "python": os.path.join(ENGINES, "venv-tsg", "bin", "python"),
        "runner": os.path.join(RUNNERS, "run_triposg.py"),
        "args": {"fast": ["--steps", "15", "--d0", "6", "--d1", "7"], "best": ["--steps", "25", "--d0", "6", "--d1", "8"]},
        "to_yup": [[1, 0, 0], [0, 1, 0], [0, 0, 1]],  # TripoSG output is already Y-up, front on +Z (canonical, not camera-aligned)
        "multiview": False,
        "project": True,  # shape only: colours projected from the photo
        "fix_tilt": False,  # output is canonical and upright already
    },
}
# no --engine: best -> TripoSG (better shape, ~8 min, ~9.5 GB), fast -> TripoSR (~1 min, ~6 GB)
DEFAULT_ENGINE = {"best": "triposg", "fast": "triposr"}
QUALITY = {"fast": {"faces": 15000, "tex": 512}, "best": {"faces": 30000, "tex": 1024}}


def progress(frac, words):
    print(f"PROGRESS {frac:.2f} {words}", flush=True)


def fail(msg, code=1):
    print(f"ERROR {msg}", flush=True)
    sys.exit(code)


def run_engine(eng, rgba, raw_out, quality):
    cmd = ["/usr/bin/time", "-l", eng["python"], "-I", eng["runner"], "--rgba", rgba, "--out", raw_out] + eng["args"][quality]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1)
    err_tail = []

    def drain_err():
        for line in p.stderr:
            ls = line.strip()
            if ls.endswith("peak memory footprint") or ls.endswith("maximum resident set size") or " real " in ls:
                sys.stderr.write("photo3d-engine: " + ls + "\n")
                continue
            if ls and ls.split()[0].isdigit() and len(ls.split()) > 1 and not ls.split()[1].isdigit():
                continue  # other /usr/bin/time -l counters
            err_tail.append(line.rstrip())
            del err_tail[:-30]
            sys.stderr.write(line)

    import threading
    t = threading.Thread(target=drain_err, daemon=True)
    t.start()
    for line in p.stdout:
        line = line.strip()
        if line.startswith("STAGE "):
            _, frac, words = line.split(" ", 2)
            # engine owns 0.15 .. 0.70 of the bar
            progress(0.15 + 0.55 * float(frac), words)
        else:
            sys.stderr.write(line + "\n")
    p.wait()
    t.join(timeout=5)
    if p.returncode != 0 or not os.path.exists(raw_out):
        last = next((l for l in reversed(err_tail) if l.strip()), "no output")
        fail(f"engine failed (rc={p.returncode}): {last[-300:]}")


def main():
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--engine", default=None)
    ap.add_argument("--quality", default="best", choices=["fast", "best"])
    ap.add_argument("images", nargs="+")
    try:
        a = ap.parse_args()
    except SystemExit as e:
        if e.code:
            print("ERROR bad arguments", flush=True)
        raise
    if a.engine is None:
        a.engine = DEFAULT_ENGINE[a.quality]
    if a.engine not in ENGINE_TABLE:
        fail(f"unknown engine '{a.engine}' (have: {', '.join(ENGINE_TABLE)})", 2)
    for im in a.images:
        if not os.path.isfile(im):
            fail(f"image not found: {im}", 2)
    eng = ENGINE_TABLE[a.engine]
    if not os.path.exists(eng["python"]):
        fail(f"engine '{a.engine}' is not installed ({eng['python']} missing)", 3)
    if len(a.images) > 1 and not eng["multiview"]:
        sys.stderr.write(f"photo3d: engine {a.engine} is single-view; using only {a.images[0]}\n")
    out = os.path.abspath(a.out)
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    q = QUALITY[a.quality]
    t0 = time.time()
    try:
        with tempfile.TemporaryDirectory(prefix="photo3d_") as td:
            progress(0.0, "removing background")
            rgba = os.path.join(td, "cut.png")
            os.environ.setdefault("U2NET_HOME", os.path.join(ENGINES, "weights", "rembg"))
            # BiRefNet (MIT) in PyTorch/MPS fp16 at 768 px: ~3.7 GB peak. Fallback: rembg ISNet (Apache-2.0, ~2.3 GB).
            tsg_py = os.path.join(ENGINES, "venv-tsg", "bin", "python")
            if os.path.exists(tsg_py):
                bg_cmd = [tsg_py, "-I", os.path.join(RUNNERS, "bg_birefnet.py"), a.images[0], rgba, "768"]
            else:
                bg_cmd = [sys.executable, "-I", os.path.join(RUNNERS, "rembg_cut.py"), a.images[0], rgba, "isnet-general-use"]
            r = subprocess.run(["/usr/bin/time", "-l"] + bg_cmd, capture_output=True, text=True)
            for ln in r.stderr.splitlines():
                if ln.strip().endswith("peak memory footprint") or " real " in ln:
                    sys.stderr.write("photo3d-bg: " + ln.strip() + "\n")
            if r.returncode != 0 or not os.path.exists(rgba):
                fail("background removal failed: " + ([l for l in r.stderr.strip().splitlines() if not l.strip()[:1].isdigit()] or ["?"])[-1][-300:])
            progress(0.15, "generating shape")
            raw = os.path.join(td, "raw.ply")
            run_engine(eng, rgba, raw, a.quality)
            keep = os.environ.get("PHOTO3D_KEEP_RAW")  # debugging: keep the dense engine mesh
            if keep:
                import shutil
                os.makedirs(keep, exist_ok=True)
                stem = os.path.splitext(os.path.basename(out))[0]
                for ext in ("", ".input.png", ".alpha.png"):
                    if os.path.exists(raw + ext):
                        shutil.copy(raw + ext, os.path.join(keep, stem + ".raw.ply" + ext))
            import postprocess
            info = postprocess.run(raw, out, eng["to_yup"], (0, 0, 1), max_faces=q["faces"], tex_size=q["tex"],
                                   log=progress,
                                   project=(raw + ".input.png", raw + ".alpha.png") if eng.get("project") else None,
                                   fix_tilt=eng.get("fix_tilt", True))
            sys.stderr.write(f"photo3d: {info} total={time.time() - t0:.1f}s\n")
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001
        fail(f"{type(e).__name__}: {e}")
    progress(1.0, "done")
    print(f"DONE {out}", flush=True)


if __name__ == "__main__":
    main()
