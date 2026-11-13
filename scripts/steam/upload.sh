#!/bin/sh
# Template. Fill YOUR_* placeholders in the .vdf files first.
# Login uses the Steamworks account; do not put a password in this script.
#   STEAM_USERNAME=you scripts/steam/upload.sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
if [ -z "${STEAM_USERNAME:-}" ]; then
  echo "Set STEAM_USERNAME to the Steamworks partner account." >&2
  exit 1
fi
steamcmd +login "$STEAM_USERNAME" +run_app_build "$ROOT/app_build.vdf" +quit
