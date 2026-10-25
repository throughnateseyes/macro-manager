/**
 * afterPack hook — runs after electron-builder assembles the app bundle and
 * before the DMG/ZIP is made. (electron-builder's own signing is turned off
 * with mac.identity: null, so the signature below is the final one: it only
 * looks up *trusted* identities, and ours is self-signed on purpose.)
 *
 * macOS codesign rejects files that carry resource forks or Finder
 * extended attributes ("detritus"). Electron's pre-built binaries are
 * sometimes downloaded with com.apple.quarantine or similar xattrs
 * attached. Stripping them here lets codesign proceed cleanly.
 */
const { execSync } = require('child_process');
const path = require('path');

exports.default = async function afterPack(context) {
  const targetPlatform = context.electronPlatformName;
  if (targetPlatform !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);

  console.log(`[afterPack] Cleaning app bundle for codesign: ${appPath}`);

  // 1. Delete ._* resource fork sidecar files explicitly — these can survive
  //    dot_clean when the volume stores them as HFS+ resource forks.
  execSync(`find "${appPath}" -name '._*' -delete 2>/dev/null || true`);

  // 2. Strip all extended attributes recursively (quarantine, resource forks
  //    stored as xattrs, etc.). Per-file is more reliable than -r on bundles.
  execSync(`find "${appPath}" -exec xattr -c {} \\; 2>/dev/null || true`);

  // 3. dot_clean as a final pass to merge/remove any remaining sidecar data.
  execSync(`dot_clean -m "${appPath}" 2>/dev/null || true`);

  // 4. Sign. An Apple Silicon app whose signature doesn't match its contents
  //    is reported as "damaged", so every build is signed, preferably with
  //    the project's self-signed certificate (see
  //    scripts/mac-signing-keychain.sh): one certificate across releases
  //    means macOS keeps the Accessibility permission through updates.
  //    Ad-hoc ("-") is the fallback for machines without it; CI sets
  //    REQUIRE_MAC_SIGNING so a release can never quietly fall back.
  const identity = findIdentity();
  if (!identity && process.env.REQUIRE_MAC_SIGNING) {
    throw new Error(`[afterPack] "${IDENTITY_NAME}" isn't in any keychain. Run scripts/mac-signing-keychain.sh first.`);
  }
  execSync(`codesign --force --deep --sign ${identity || '-'} "${appPath}"`, { stdio: 'inherit' });

  console.log(`[afterPack] Done — signed with ${identity ? `"${IDENTITY_NAME}" (${identity})` : 'an ad-hoc signature'}`);
};

const IDENTITY_NAME = 'Macro Manager Self-Signed';

// The certificate's SHA-1, or null. Signing by hash avoids ambiguity if the
// name ever appears twice.
function findIdentity() {
  try {
    const out = execSync('security find-identity -p codesigning', { encoding: 'utf8' });
    const line = out.split('\n').find((l) => l.includes(`"${IDENTITY_NAME}"`));
    return line ? line.trim().split(/\s+/)[1] : null;
  } catch {
    return null;
  }
}
