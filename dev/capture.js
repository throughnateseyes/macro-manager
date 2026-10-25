// Render the UI with sample data (dev/mock-api.js) and save README screenshots.
//   npx electron dev/capture.js
//   SET=mocks OUT=<dir> npx electron dev/capture.js   → every new screen, Mac
//                                                       and Windows, light and dark
const { app, BrowserWindow, nativeTheme } = require('electron');
const fs = require('fs');
const path = require('path');

const OUT = process.env.OUT ? path.resolve(process.env.OUT) : path.join(__dirname, '..', 'docs', 'screenshots');

const click = (text) =>
  `[...document.querySelectorAll('button')].find((b) => b.textContent.includes(${JSON.stringify(text)}))?.click()`;

const SHOTS = [
  { name: 'whats-new-windows.png', file: 'preview.html', query: 'platform=win32', theme: 'light', run: "localStorage.setItem('whatsNewSeen','2.0'); location.reload();" },
  { name: 'overview-light.png', file: 'preview.html', query: 'platform=darwin&solid&busy', theme: 'light' },
  { name: 'overview-dark.png', file: 'preview.html', query: 'platform=darwin&solid&busy', theme: 'dark' },
  { name: 'editor-light.png', file: 'preview.html', query: 'platform=darwin&solid', theme: 'light', run: click('Tour Confirmation') },
  { name: 'settings-windows.png', file: 'preview.html', query: 'platform=win32&update=ready', theme: 'light', run: click('Settings') },
  { name: 'quick-insert-dark.png', file: 'palette.html', query: 'platform=darwin&solid', theme: 'dark', width: 640, height: 420 },
  { name: 'tray-flyout-windows.png', file: 'palette.html', query: 'platform=win32&mode=tray', theme: 'light', width: 640, height: 420 },
  { name: 'fill-in-light.png', file: 'palette.html', query: 'platform=darwin&solid&mode=fill', theme: 'light', width: 640, height: 420, run: 'FILL_IN' },
  { name: 'add-field-windows.png', file: 'preview.html', query: 'platform=win32', theme: 'light', run: 'ADD_FIELD' },
  { name: 'whats-new-2.2.png', file: 'preview.html', query: 'platform=darwin&solid&v=2.2.0', theme: 'light', run: "localStorage.setItem('whatsNewSeen','2.1'); location.reload();" },
];

// The 2.2 screens: formatting, Add field, a field in Preview, the prompt.
const openTour = click('Tour Confirmation');
const addField = `${openTour}; setTimeout(() => {
  document.querySelector('#btn-field').click();
  setTimeout(() => {
    const set = (sel, v) => { const i = document.querySelector(sel); i.value = v; i.dispatchEvent(new Event('input')); };
    set('#pf-label', 'Lease term');
    document.querySelector('.seg [data-kind="list"]').click();
    set('#pf-choices', '12 months\\n6 months\\nMonth to month');
    document.activeElement.blur();
  }, 300);
}, 600);`;
const fillIn = `setTimeout(() => {
  const i = document.querySelector('#fill-0'); i.value = 'Jane Park'; i.dispatchEvent(new Event('input'));
  const s = document.querySelector('#fill-1'); s.value = '4B'; s.dispatchEvent(new Event('change'));
  document.querySelector('#fill-1').focus();
}, 400);`;
for (const s of SHOTS) if (s.run === 'FILL_IN') s.run = fillIn; else if (s.run === 'ADD_FIELD') s.run = addField;
const MOCKS = [];
for (const [os, platform] of [['mac', 'darwin'], ['windows', 'win32']]) {
  for (const theme of ['light', 'dark']) {
    const q = `platform=${platform}&solid`;
    MOCKS.push(
      { name: `editor-${os}-${theme}.png`, file: 'preview.html', query: q, theme, run: openTour },
      { name: `add-field-${os}-${theme}.png`, file: 'preview.html', query: q, theme, run: addField },
      { name: `fill-in-${os}-${theme}.png`, file: 'palette.html', query: `${q}&mode=fill`, theme, width: 640, height: 420, run: fillIn },
    );
  }
}

// Destroying each window must not end the app before the next shot.
app.on('window-all-closed', () => {});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const only = process.env.ONLY;
  const set = process.env.SET === 'mocks' ? MOCKS : SHOTS;
  for (const s of set.filter((x) => !only || x.name.startsWith(only))) {
    nativeTheme.themeSource = s.theme;
    const win = new BrowserWindow({ width: s.width || 1100, height: s.height || 720, show: false, useContentSize: true });
    await win.loadFile(path.join(__dirname, s.file), { search: s.query });
    win.webContents.on('console-message', (e) => { if ((e.level ?? e.params?.level) === 'error') console.log('  console error:', e.message ?? e.params?.message); });
    await wait(500);
    if (s.run) { await win.webContents.executeJavaScript(s.run).catch(() => {}); await wait(1800); }
    fs.writeFileSync(path.join(OUT, s.name), (await win.webContents.capturePage()).toPNG());
    console.log('saved', s.name);
    win.destroy();
  }
  app.quit();
});
