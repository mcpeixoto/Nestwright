#!/bin/zsh
# Installs the local photo-to-3D converter that "Furniture from photo" runs.
#   scripts/photo3d/setup.sh [target]
# Default target: ~/Library/Application Support/Nestwright/photo3d, where the app finds it with no
# setting. Needs git and uv, an Apple Silicon Mac, about 3 GB of disk for the Python environments,
# and about 8 GB more for model weights, which download from Hugging Face on the first run (no
# login, no licence gate). Engines: TripoSG and TripoSR (MIT); background removal BiRefNet (MIT).
set -euo pipefail

SRC="${0:A:h}"
TARGET="${1:-$HOME/Library/Application Support/Nestwright/photo3d}"
TRIPOSG_REV=fc5c409
TRIPOSR_REV=107cefd

for tool in git uv; do
  command -v "$tool" >/dev/null || { print -u2 "setup: $tool is required"; exit 1; }
done

mkdir -p "$TARGET/engines"
cp "$SRC/photo3d.sh" "$SRC/photo3d.py" "$TARGET/"
rm -rf "$TARGET/runners" "$TARGET/engines/birefnet_code"
cp -R "$SRC/runners" "$TARGET/runners"
cp -R "$SRC/vendor/birefnet_code" "$TARGET/engines/birefnet_code"
chmod +x "$TARGET/photo3d.sh"

clone() { # clone <url> <dir> <rev>
  local dir="$TARGET/engines/$2"
  [[ -d "$dir/.git" ]] || git clone --quiet "$1" "$dir"
  git -C "$dir" fetch --quiet origin
  git -C "$dir" checkout --quiet "$3"
}
clone https://github.com/VAST-AI-Research/TripoSG.git TripoSG "$TRIPOSG_REV"
clone https://github.com/VAST-AI-Research/TripoSR.git TripoSR "$TRIPOSR_REV"

venv() { # venv <name> <requirements>
  local dir="$TARGET/engines/$1"
  [[ -x "$dir/bin/python" ]] || uv venv --quiet --python 3.11 "$dir"
  uv pip install --quiet --python "$dir/bin/python" -r "$SRC/$2"
}
venv venv-tsr requirements-tsr.txt
venv venv-tsg requirements-tsg.txt

print "Converter installed: $TARGET/photo3d.sh"
print "The first run downloads the model weights (about 8 GB) and takes longer."
