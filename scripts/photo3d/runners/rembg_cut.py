"""Background removal in its own process (frees ~10 GB before the engine starts).
Usage: rembg_cut.py <in> <out.png> [model]"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("U2NET_HOME", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "engines", "weights", "rembg"))
from rembg_lib import cut
print(cut(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "birefnet-general"))
