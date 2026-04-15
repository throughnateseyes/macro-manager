/**
 * afterPack hook — runs after electron-builder unpacks the app bundle
 * but before code-signing begins.
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

  console.log('[afterPack] Done — bundle is clean for signing');
};
