#!/bin/sh
# Fill YOUR_* in scripts/steam/*.vdf and write a real steam_appid.txt first.
# steamcmd prompts for the password and Steam Guard. Do not store either.
#   STEAM_USERNAME=you scripts/steam/upload.sh
#   STEAM_USERNAME=you scripts/steam/upload.sh --preview
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
REPO=$(CDPATH= cd -- "$ROOT/../.." && pwd)

if [ $# -gt 1 ] || { [ $# -eq 1 ] && [ "$1" != "--preview" ]; }; then
  echo "usage: scripts/steam/upload.sh [--preview]" >&2
  exit 1
fi
PREVIEW=0
if [ "${1:-}" = "--preview" ]; then
  PREVIEW=1
fi

placeholders=0
for f in "$ROOT"/*.vdf; do
  if grep -q 'YOUR_' "$f"; then
    echo "Refusing to upload: $f still contains a YOUR_ placeholder." >&2
    placeholders=1
  fi
done
if [ "$placeholders" -ne 0 ]; then
  exit 1
fi

APPID_FILE="$REPO/steam_appid.txt"
if [ ! -f "$APPID_FILE" ]; then
  echo "Refusing to upload: steam_appid.txt is missing from the repo root." >&2
  exit 1
fi
appid=$(tr -d '[:space:]' < "$APPID_FILE")
if [ "$appid" = "480" ]; then
  echo "Refusing to upload: steam_appid.txt is 480 (Spacewar). Never ship 480." >&2
  exit 1
fi

missing=0
need() {
  dir=$1
  cmd=$2
  if [ ! -d "$dir" ] || [ -z "$(find "$dir" -mindepth 1 -print 2>/dev/null | head -n 1)" ]; then
    echo "Refusing to upload: $dir is missing or empty. Run: $cmd" >&2
    missing=1
  fi
}
need "$REPO/release/mac-universal" "npm run dist:mac"
need "$REPO/release/win-unpacked" "npm run dist:win"
need "$REPO/release/linux-unpacked" "npm run dist:linux"
if [ "$missing" -ne 0 ]; then
  exit 1
fi

if [ -z "${STEAM_USERNAME:-}" ]; then
  echo "Set STEAM_USERNAME to the Steamworks partner account. steamcmd prompts for the password and Steam Guard code." >&2
  exit 1
fi

VDF="$ROOT/app_build.vdf"
if [ "$PREVIEW" -eq 1 ]; then
  TMP=$(mktemp -d)
  trap 'rm -rf "$TMP"' EXIT
  for f in "$ROOT"/*.vdf; do
    base=$(basename "$f")
    REPO="$REPO" awk '
      BEGIN { root = ENVIRON["REPO"] }
      {
        gsub(/\.\.\/\.\.\/release/, root "/release")
        gsub("\"Preview\" \"0\"", "\"Preview\" \"1\"")
        print
      }
    ' "$f" > "$TMP/$base"
  done
  VDF="$TMP/app_build.vdf"
fi

steamcmd +login "$STEAM_USERNAME" +run_app_build "$VDF" +quit
