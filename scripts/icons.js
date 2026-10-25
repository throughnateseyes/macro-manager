// Rebuild every icon from the SVG sources in design/.
// Needs rsvg-convert (macOS: brew install librsvg).
const { execFileSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const out = [
  ['design/icon.svg', 1024, 'build/icon.png'],          // installers, .icns/.ico
  ['design/icon.svg', 256, 'assets/icon.png'],           // window icon
  ['design/tray-template.svg', 16, 'assets/trayTemplate.png'],
  ['design/tray-template.svg', 32, 'assets/trayTemplate@2x.png'],
  ['design/tray-color.svg', 16, 'assets/tray.png'],
  ['design/tray-color.svg', 32, 'assets/tray@2x.png'],
];

for (const [src, size, dest] of out) {
  execFileSync('rsvg-convert', ['-w', String(size), '-h', String(size), path.join(root, src), '-o', path.join(root, dest)]);
  console.log(`${dest} (${size}px)`);
}
