#!/usr/bin/env bash
# Put the Mac signing certificate into a dedicated keychain that codesign can
# use without prompting. Run once per machine (CI runs it on every build).
#
#   scripts/mac-signing-keychain.sh <cert.p12> <password>
#
# WHY A SELF-SIGNED CERTIFICATE. macOS remembers the Accessibility permission
# by the app's "designated requirement". An ad-hoc signature's requirement is
# the hash of that exact build, so every update looked like a different app
# and the permission silently stopped applying. Signed with one certificate,
# the requirement becomes "this bundle id, signed by this certificate", and
# every future build satisfies it. Keep the .p12 safe: a new certificate
# means everyone re-grants once.
set -euo pipefail

P12="$1"
PASS="$2"
KC="${MAC_SIGN_KEYCHAIN:-$HOME/Library/Keychains/macro-manager-signing.keychain-db}"

[ -f "$KC" ] || security create-keychain -p "$PASS" "$KC"
security unlock-keychain -p "$PASS" "$KC"
security set-keychain-settings "$KC"                    # never auto-lock

# Importing twice reports "already exists"; that's fine.
security import "$P12" -k "$KC" -P "$PASS" -T /usr/bin/codesign >/dev/null 2>&1 || true
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$PASS" "$KC" >/dev/null

# Add to the search list (keeping what's already there) so codesign finds it.
if ! security list-keychains -d user | grep -q "$(basename "$KC")"; then
  # shellcheck disable=SC2046
  security list-keychains -d user -s "$KC" $(security list-keychains -d user | tr -d '"')
fi

security find-identity -p codesigning "$KC" | grep "Macro Manager Self-Signed"
