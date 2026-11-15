#!/bin/bash
# Signed + notarised universal mac build from this Mac, with nothing exported:
# the Developer ID key stays in the login keychain and notarisation uses the
# App Store Connect API key in ~/.appstoreconnect/private_keys (same as Ata).
#
#   scripts/packaging/dist-mac-signed.sh
#
# ASC_KEY_ID picks a key when several exist; the issuer comes from $ASC_ISSUER_ID
# or ~/.appstoreconnect/issuer_id.
set -euo pipefail
cd "$(dirname "$0")/../.."

IDENTITY=$(security find-identity -v -p codesigning | sed -n 's/.*"\(Developer ID Application: [^"]*\)".*/\1/p' | head -1)
[ -n "$IDENTITY" ] || { echo "No 'Developer ID Application' identity in the keychain." >&2; exit 1; }

KEYS=~/.appstoreconnect/private_keys
if [ -n "${ASC_KEY_ID:-}" ]; then
  KEY="$KEYS/AuthKey_${ASC_KEY_ID}.p8"
else
  KEY=$(ls "$KEYS"/AuthKey_*.p8 2>/dev/null | head -1 || true)
fi
[ -f "${KEY:-}" ] || { echo "No App Store Connect key in $KEYS." >&2; exit 1; }
KEY_ID=$(basename "$KEY" .p8); KEY_ID=${KEY_ID#AuthKey_}
ISSUER=${ASC_ISSUER_ID:-$(cat ~/.appstoreconnect/issuer_id 2>/dev/null || true)}
[ -n "$ISSUER" ] || { echo "Set ASC_ISSUER_ID or write ~/.appstoreconnect/issuer_id." >&2; exit 1; }

export NESTWRIGHT_MAC_IDENTITY="$IDENTITY"
export APPLE_API_KEY="$KEY" APPLE_API_KEY_ID="$KEY_ID" APPLE_API_ISSUER="$ISSUER"
npm run dist:mac
APP=release/mac-universal/Nestwright.app
codesign --verify --deep --strict "$APP"
spctl -a -vv -t exec "$APP"
