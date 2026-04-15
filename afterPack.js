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

  // 1. Strip extended attributes (com.apple.quarantine, etc.)
  execSync(`xattr -cr "${appPath}"`);

  // 2. Remove ._* resource fork sidecar files — codesign rejects these as
  //    "detritus". dot_clean -m merges then removes them recursively.
  execSync(`dot_clean -m "${appPath}"`);

  console.log('[afterPack] Done — bundle is clean for signing');
};
