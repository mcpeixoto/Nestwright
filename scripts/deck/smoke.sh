#!/bin/bash
# Steam Deck smoke test: copy the Linux build (and optionally the Windows build) to the Deck,
# run each with --smoke in the desktop session, fetch smoke.png / smoke.json / console.log.
#
#   npm run dist:linux                       # and npm run dist:win for the Proton run
#   scripts/deck/smoke.sh [--win] [--host deck@steamdeck.local] [--out deck-smoke]
#
# House rules for the Deck (it is also the owner's console and a CI helper):
#   - runs only in desktop mode (plasmashell up) and never while a Steam game is running;
#   - uses the internal drive, under ~/nestwright-smoke, and deletes it afterwards;
#   - key login only; never a password.
set -euo pipefail
cd "$(dirname "$0")/../.."

HOST=deck@steamdeck.local
OUT=deck-smoke
WIN=0
while [ $# -gt 0 ]; do
  case "$1" in
    --host) HOST=$2; shift 2 ;;
    --out) OUT=$2; shift 2 ;;
    --win) WIN=1; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

[ -x release/linux-unpacked/nestwright ] || { echo "No release/linux-unpacked — run npm run dist:linux" >&2; exit 1; }
if [ "$WIN" = 1 ] && [ ! -f release/win-unpacked/Nestwright.exe ]; then
  echo "No release/win-unpacked — run npm run dist:win" >&2; exit 1
fi

SSH=(ssh -o BatchMode=yes -o ConnectTimeout=10 "$HOST")
STAMP=$(date +%Y%m%d-%H%M%S)
LOCAL="$OUT/$STAMP"
mkdir -p "$LOCAL"

echo "▸ preflight on $HOST"
"${SSH[@]}" 'bash -s' <<'PRE'
set -e
pgrep -x plasmashell >/dev/null || { echo "Deck is not in desktop mode; not running." >&2; exit 3; }
if pgrep -f SteamLaunch >/dev/null; then echo "A Steam game is running; not running." >&2; exit 3; fi
free=$(df -Pk "$HOME" | awk 'NR==2 {print int($4/1024/1024)}')
[ "$free" -ge 5 ] || { echo "Only ${free} GB free on /home; need 5." >&2; exit 3; }
echo "desktop mode, no game, ${free} GB free"
PRE

echo "▸ copying builds"
DIRS=(linux-unpacked)
[ "$WIN" = 1 ] && DIRS+=(win-unpacked)
COPYFILE_DISABLE=1 tar --no-mac-metadata --no-xattrs -C release -cf - "${DIRS[@]}" | "${SSH[@]}" 'rm -rf ~/nestwright-smoke && mkdir -p ~/nestwright-smoke && tar -xf - -C ~/nestwright-smoke'

echo "▸ running"
set +e
"${SSH[@]}" "WIN=$WIN bash -s" <<'RUN'
set -u
ROOT=$HOME/nestwright-smoke
OUTDIR=$ROOT/out
mkdir -p "$OUTDIR"
# Borrow the desktop session's display and bus from plasmashell.
PID=$(pgrep -xo plasmashell)
while IFS= read -r -d '' kv; do
  case "$kv" in
    DISPLAY=*|WAYLAND_DISPLAY=*|XAUTHORITY=*|XDG_RUNTIME_DIR=*|DBUS_SESSION_BUS_ADDRESS=*) export "$kv" ;;
  esac
done < "/proc/$PID/environ"
{
  echo "date: $(date -Is)"
  echo "os: $(. /etc/os-release; echo "$PRETTY_NAME $VERSION_ID") kernel $(uname -r)"
  echo "session: DISPLAY=${DISPLAY:-} WAYLAND_DISPLAY=${WAYLAND_DISPLAY:-}"
} > "$OUTDIR/host.txt"

run_linux() {
  local dir=$OUTDIR/linux
  mkdir -p "$dir"
  cd "$ROOT/linux-unpacked"
  timeout 180 ./nestwright --smoke="$dir" > "$dir/stdout.log" 2>&1
  local rc=$?
  # Without a setuid chrome-sandbox and with user namespaces blocked, Chromium refuses to
  # start; retry once without the sandbox and record that it was needed.
  if [ $rc -ne 0 ] && grep -q -i "sandbox" "$dir/stdout.log"; then
    echo "retrying with --no-sandbox" >> "$dir/stdout.log"
    echo "needed --no-sandbox" > "$dir/sandbox.txt"
    timeout 180 ./nestwright --no-sandbox --smoke="$dir" >> "$dir/stdout.log" 2>&1
    rc=$?
  fi
  echo "linux rc=$rc"
}

run_proton() {
  local dir=$OUTDIR/proton
  mkdir -p "$dir"
  local steam=$HOME/.local/share/Steam
  local proton
  proton=$(ls -d "$steam"/steamapps/common/Proton*/ 2>/dev/null | sort -V | tail -1)
  if [ -z "$proton" ]; then echo "proton: not installed" | tee "$dir/stdout.log"; return; fi
  echo "proton: $proton" > "$dir/stdout.log"
  mkdir -p "$ROOT/pfx"
  cd "$ROOT/win-unpacked"
  STEAM_COMPAT_CLIENT_INSTALL_PATH=$steam STEAM_COMPAT_DATA_PATH=$ROOT/pfx \
    timeout 300 "${proton}proton" run ./Nestwright.exe "--smoke=Z:${dir//\//\\}" >> "$dir/stdout.log" 2>&1
  echo "proton rc=$?"
}

run_linux
[ "$WIN" = 1 ] && run_proton
exit 0
RUN
set -e

echo "▸ fetching results into $LOCAL"
"${SSH[@]}" 'tar -C ~/nestwright-smoke/out -cf - . && rm -rf ~/nestwright-smoke' | tar -xf - -C "$LOCAL"

echo "▸ summary"
cat "$LOCAL/host.txt"
for f in "$LOCAL"/*/smoke.json; do
  [ -f "$f" ] || continue
  node -e '
    const r = require(process.argv[1]);
    const p = r.renderer && r.renderer.perf;
    console.log(`${process.argv[2]}: ${r.ok ? "OK" : "FAILED"} backend=${p ? p.backend : "-"} fps=${p ? p.fpsAvg : "-"} gl="${r.renderer ? r.renderer.webglRenderer : "-"}" ${r.reasons.join("; ")}`)
  ' "$PWD/$f" "$(basename "$(dirname "$f")")"
done
ls "$LOCAL"/*/ 2>/dev/null
fail=0
for d in "$LOCAL"/linux $( [ "$WIN" = 1 ] && echo "$LOCAL/proton" ); do
  [ -f "$d/smoke.json" ] && node -e 'process.exit(require(process.argv[1]).ok ? 0 : 1)' "$PWD/$d/smoke.json" || { echo "no passing smoke in $d"; fail=1; }
done
exit $fail
