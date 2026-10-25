/**
 * afterPack hook — runs after electron-builder assembles the app bundle and
 * before the DMG/ZIP is made. (electron-builder's own signing is turned off
 * with mac.identity: null, so the ad-hoc signature below is the final one.)
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

  // 4. Ad-hoc sign. We don't have an Apple Developer ID, and an Apple Silicon
  //    app whose signature no longer matches its contents is reported as
  //    "damaged". An ad-hoc signature turns that into the normal
  //    "unidentified developer" prompt, which users can approve once.
  execSync(`codesign --force --deep --sign - "${appPath}"`);

  console.log('[afterPack] Done — bundle cleaned and ad-hoc signed');
};
