// Render the UI with sample data (dev/mock-api.js) and save README screenshots.
//   npx electron dev/capture.js
const { app, BrowserWindow, nativeTheme } = require('electron');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'docs', 'screenshots');

const click = (text) =>
  `[...document.querySelectorAll('button')].find((b) => b.textContent.includes(${JSON.stringify(text)}))?.click()`;

const SHOTS = [
  { name: 'overview-light.png', file: 'preview.html', query: 'platform=darwin&solid&busy', theme: 'light' },
  { name: 'overview-dark.png', file: 'preview.html', query: 'platform=darwin&solid&busy', theme: 'dark' },
  { name: 'editor-light.png', file: 'preview.html', query: 'platform=darwin&solid', theme: 'light', run: click('Tour Confirmation') },
  { name: 'settings-windows.png', file: 'preview.html', query: 'platform=win32&update=ready', theme: 'light', run: click('Settings') },
  { name: 'quick-insert-dark.png', file: 'palette.html', query: 'platform=darwin&solid', theme: 'dark', width: 640, height: 420 },
  { name: 'tray-flyout-windows.png', file: 'palette.html', query: 'platform=win32&mode=tray', theme: 'light', width: 640, height: 420 },
];

// Destroying each window must not end the app before the next shot.
app.on('window-all-closed', () => {});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const only = process.env.ONLY;
  for (const s of SHOTS.filter((x) => !only || x.name.startsWith(only))) {
    nativeTheme.themeSource = s.theme;
    const win = new BrowserWindow({ width: s.width || 1100, height: s.height || 720, show: false, useContentSize: true });
    await win.loadFile(path.join(__dirname, s.file), { search: s.query });
    await wait(500);
    if (s.run) { await win.webContents.executeJavaScript(s.run).catch(() => {}); await wait(1800); }
    fs.writeFileSync(path.join(OUT, s.name), (await win.webContents.capturePage()).toPNG());
    console.log('saved', s.name);
    win.destroy();
  }
  app.quit();
});
