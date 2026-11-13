#!/bin/sh
# Copy the unpacked arm64 app into ~/Applications and clear quarantine.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
SRC="$ROOT/release/mac-arm64/Nestwright.app"
DEST="$HOME/Applications/Nestwright.app"
if [ ! -d "$SRC" ]; then
  echo "Missing $SRC — run npm run dist:mac first" >&2
  exit 1
fi
rm -rf "$DEST"
mkdir -p "$HOME/Applications"
cp -R "$SRC" "$DEST"
xattr -dr com.apple.quarantine "$DEST"
echo "Installed $DEST"
