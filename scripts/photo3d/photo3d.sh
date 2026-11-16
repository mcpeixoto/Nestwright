#!/bin/zsh
# photo3d.sh --out <file.glb> [--engine <name>] [--quality fast|best] <image> [<image>...]
HERE="${0:A:h}"
source "$HERE/engines/venv-tsr/bin/activate"
export PYTORCH_ENABLE_MPS_FALLBACK=1
exec python -I "$HERE/photo3d.py" "$@"
