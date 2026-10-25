const {
  app, BrowserWindow, ipcMain, globalShortcut, dialog, Tray, Menu, nativeImage,
  nativeTheme, shell, screen, systemPreferences, clipboard, Notification, desktopCapturer,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { createStore } = require('./lib/store');
const { createExpander, writeExpansion } = require('./lib/expander');
const { BUILT_INS, TOKENS } = require('./lib/placeholders');
const { renderExpansion } = require('./lib/format');
const { fieldsFor } = require('./lib/fields');

const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';
const RELEASES_URL = 'https://github.com/throughnateseyes/macro-manager/releases/latest';
// CI launches the packaged app with --smoke-test before publishing a release:
// it must load both windows without errors, then it exits with 0 (or 1).
const SMOKE_TEST = process.argv.includes('--smoke-test');

// `npm run start:clean` keeps development data away from your real macros.
if (process.env.MACRO_MANAGER_DATA) app.setPath('userData', path.resolve(process.env.MACRO_MANAGER_DATA));

// Two copies running means every macro expands twice — keep exactly one.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}

if (IS_WIN) app.setAppUserModelId('com.macromanager.app');

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const store = createStore(app.getPath('userData'));
let macros = store.loadMacros();
let settings = store.loadSettings();

let mainWindow = null;
let paletteWindow = null;
let tray = null;
let isQuitting = false;
let updateState = { status: 'idle' }; // idle | checking | available | downloading | ready | latest | error | manual

console.log('[macros] Loaded', macros.snippets.length, 'macros from', store.paths.macros);

// ---------------------------------------------------------------------------
// Expansion
// ---------------------------------------------------------------------------
const expander = createExpander({
  getMacros: () => macros,
  isPaused: () => settings.paused,
  // Don't expand inside our own windows (the editor, the palette's search).
  // The smoke test types into the app on purpose.
  isAppFocused: () => !SMOKE_TEST && BrowserWindow.getFocusedWindow() !== null,
  onExpanded: (event) => recordUse(event),
  onNeedsFields: ({ macro, deleteCount }) => openFill(macro, { deleteCount }),
});

function recordUse(event) {
  const { usage, stats } = store.recordExpansion(event);
  broadcast('stats:changed', { usage, stats });
  scheduleTrayRefresh();
}

// The tray menu shows today's count; rebuilding it on every keystroke-burst
// is wasteful, so batch updates.
let trayRefreshTimer = null;
function scheduleTrayRefresh() {
  clearTimeout(trayRefreshTimer);
  trayRefreshTimer = setTimeout(updateTrayMenu, 1500);
}

// Send to every window except the one that caused the change.
function broadcast(channel, payload, except = null) {
  for (const w of [mainWindow, paletteWindow]) {
    if (w && !w.isDestroyed() && w.webContents !== except) w.webContents.send(channel, payload);
  }
}

function accessibilityGranted() {
  return IS_MAC ? systemPreferences.isTrustedAccessibilityClient(false) : true;
}

// On macOS the keyboard hook can't start until Accessibility is granted, which
// users often do after launch — so keep trying quietly until it works.
let expanderRunning = false;
let expanderRetry = null;

function startExpander() {
  if (expanderRunning) return true;
  if (!accessibilityGranted()) return false;
  try {
    expander.start();
    expanderRunning = true;
    clearInterval(expanderRetry);
    console.log('[expander] listening');
  } catch (err) {
    console.error('[expander] failed to start:', err.message);
  }
  return expanderRunning;
}

// ---------------------------------------------------------------------------
// Main window
// ---------------------------------------------------------------------------
const LIGHT_BG = '#ffffff';
const DARK_BG  = '#1c1c1e';

function titleBarOverlay() {
  const dark = nativeTheme.shouldUseDarkColors;
  return { color: dark ? DARK_BG : LIGHT_BG, symbolColor: dark ? '#f2f2f7' : '#1c1c1e', height: 44 };
}

function createWindow({ show = true } = {}) {
  mainWindow = new BrowserWindow({
    width: 1040,
    height: 680,
    minWidth: 760,
    minHeight: 500,
    show: false,
    title: 'Macro Manager',
    ...(IS_MAC
      ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 18, y: 18 }, vibrancy: 'sidebar', visualEffectState: 'followWindow' }
      : { titleBarStyle: 'hidden', titleBarOverlay: titleBarOverlay(), backgroundColor: nativeTheme.shouldUseDarkColors ? DARK_BG : LIGHT_BG, icon: assetPath('icon.png') }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  attachTextContextMenu(mainWindow);

  mainWindow.once('ready-to-show', () => {
    if (show) showWindow();
  });

  // Closing hides to the tray/menu bar — expansion keeps working.
  mainWindow.on('close', (e) => {
    if (isQuitting) return;
    e.preventDefault();
    mainWindow.hide();
    if (IS_MAC) app.dock.hide();
    if (IS_WIN && tray && !settings.trayHintShown) {
      tray.displayBalloon({
        title: 'Macro Manager is still running',
        content: 'Your macros keep working. Open it again from the tray icon near the clock.',
        iconType: 'info',
      });
      settings = store.saveSettings({ trayHintShown: true });
    }
  });

  // Re-check permissions whenever the user comes back from System Settings.
  mainWindow.on('focus', () => {
    startExpander();
    mainWindow.webContents.send('accessibility:changed', accessibilityGranted());
  });

  // Open links in the user's browser, never inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

function showWindow(page) {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  if (IS_MAC) app.dock.show();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  if (page) mainWindow.webContents.send('navigate', page);
}

function toggleWindow() {
  if (mainWindow && mainWindow.isVisible() && mainWindow.isFocused()) {
    mainWindow.hide();
    if (IS_MAC) app.dock.hide();
  } else {
    showWindow();
  }
}

nativeTheme.on('updated', () => {
  if (IS_WIN && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setTitleBarOverlay(titleBarOverlay());
    mainWindow.setBackgroundColor(nativeTheme.shouldUseDarkColors ? DARK_BG : LIGHT_BG);
  }
});

// ---------------------------------------------------------------------------
// Quick Insert palette — search any macro and paste it into the current app
// ---------------------------------------------------------------------------
function createPalette() {
  paletteWindow = new BrowserWindow({
    width: 640,
    height: 420,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: true,
    ...(IS_MAC
      ? { vibrancy: 'popover', visualEffectState: 'active', transparent: true, roundedCorners: true }
      : { backgroundColor: nativeTheme.shouldUseDarkColors ? DARK_BG : LIGHT_BG, roundedCorners: true }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  paletteWindow.setAlwaysOnTop(true, 'pop-up-menu');
  if (IS_MAC) paletteWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  paletteWindow.loadFile(path.join(__dirname, 'renderer', 'palette.html'));
  attachTextContextMenu(paletteWindow);
  // A right-click menu over the palette must not count as clicking away.
  paletteWindow.on('blur', () => { if (!menuOpenOver) hidePalette(); });
}

// Whether Macro Manager itself had focus when the palette opened; if not, the
// macro gets pasted into whichever app did.
let paletteOpenedFromApp = false;

// mode 'insert' — opened by shortcut: Enter pastes into the app you were in.
// mode 'app'    — opened over Macro Manager's own window: Enter opens the macro.
// mode 'tray'   — opened from the Windows tray icon: the taskbar has focus,
//                 so Enter copies instead and the window sits by the clock.
// mode 'fill'   — the fill-in prompt for one macro (`fill`: { macro, action }).
function showPalette(mode = 'insert', fill = null) {
  if (!paletteWindow || paletteWindow.isDestroyed()) createPalette();
  if (paletteWindow.isVisible()) {
    if (mode !== 'fill') { hidePalette(); return; }
  } else {
    paletteOpenedFromApp = Boolean(mainWindow && mainWindow.isFocused());
  }
  // Opened over Macro Manager itself there's nothing to paste into, so Enter
  // opens the macro instead.
  if (mode === 'insert' && paletteOpenedFromApp) mode = 'app';
  // The prompt opens from the keyboard hook, not a registered shortcut, and
  // Windows won't hand focus to a background window that merely asks. A
  // window being restored from minimized does get it.
  if (IS_WIN && mode === 'fill' && !paletteWindow.isVisible()) paletteWindow.minimize();
  if (paletteWindow.isMinimized()) paletteWindow.restore();

  const [w, h] = paletteWindow.getSize();
  if (mode === 'tray' && tray) {
    const icon = tray.getBounds();
    const { workArea } = screen.getDisplayMatching(icon);
    const x = Math.min(Math.max(workArea.x + 8, Math.round(icon.x + icon.width / 2 - w / 2)), workArea.x + workArea.width - w - 8);
    const taskbarAtTop = icon.y < workArea.y + workArea.height / 2;
    const y = taskbarAtTop ? workArea.y + 8 : workArea.y + workArea.height - h - 8;
    paletteWindow.setPosition(x, y);
  } else {
    // Centre on whichever screen the mouse is on, a fifth of the way down.
    const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    paletteWindow.setPosition(
      Math.round(workArea.x + (workArea.width - w) / 2),
      Math.round(workArea.y + workArea.height * 0.22),
    );
  }
  paletteWindow.webContents.send('palette:open', { mode, fill });
  paletteWindow.show();
  paletteWindow.focus();
  if (IS_MAC && mode === 'fill') app.focus({ steal: true });
}

// ---------------------------------------------------------------------------
// Fill-in fields
// ---------------------------------------------------------------------------
// The macro whose prompt is open, and what to do once it's filled in:
// action 'paste' erases `deleteCount` typed characters and pastes; 'copy'
// copies (tray menu, where no app has a caret).
let pendingFill = null;

function openFill(macro, { deleteCount = 0, action = 'paste' } = {}) {
  const snapshot = { title: macro.title, abbr: macro.abbr, content: macro.content, format: macro.format, fields: macro.fields };
  showPalette('fill', { macro: snapshot, action });
  pendingFill = { macro: snapshot, deleteCount, action };
}

// Paste a macro into the app the user came from, once the palette is gone.
function pasteMacro(macro, { deleteCount = 0, values } = {}) {
  hidePalette();
  if (values) store.rememberFields(fieldsFor(macro), values);
  // Wait for focus to land back in the previous app before pasting.
  setTimeout(() => {
    expander.paste(String(macro.content ?? ''), deleteCount, { format: macro.format, values })
      .then((chars) => recordUse({ abbr: macro.abbr || null, chars }))
      .catch((err) => console.error('[palette] insert failed:', err));
  }, IS_MAC ? 180 : 140);
}

// Copy a macro's expansion (both flavours for a formatted one).
async function copyMacro(macro, values, { remember = true } = {}) {
  const current = await clipboard.readText().catch(() => '');
  const out = renderExpansion(String(macro.content ?? ''), { format: macro.format, values, clipboard: current });
  await writeExpansion(out);
  if (values && remember) store.rememberFields(fieldsFor(macro), values);
  return out;
}

// Hide the palette and hand focus back to the app the user was typing in.
function hidePalette() {
  pendingFill = null;
  if (!paletteWindow || paletteWindow.isDestroyed() || !paletteWindow.isVisible()) return;
  if (IS_WIN) paletteWindow.minimize();
  paletteWindow.hide();
  if (IS_MAC && !paletteOpenedFromApp) app.hide();
}

// ---------------------------------------------------------------------------
// Global shortcuts
// ---------------------------------------------------------------------------
let shortcutErrors = {};

function registerShortcuts() {
  globalShortcut.unregisterAll();
  shortcutErrors = {};
  const pairs = [
    ['quickInsertShortcut', () => showPalette('insert')],
    ['openWindowShortcut', toggleWindow],
  ];
  for (const [key, fn] of pairs) {
    const accel = settings[key];
    if (!accel) continue;
    try {
      if (!globalShortcut.register(accel, fn)) shortcutErrors[key] = 'Another app is already using this shortcut.';
    } catch {
      shortcutErrors[key] = 'That shortcut isn’t supported.';
    }
  }
}

// ---------------------------------------------------------------------------
// Tray / menu bar
// ---------------------------------------------------------------------------
function assetPath(name) {
  return path.join(__dirname, 'assets', name);
}

function createTray() {
  try {
    const image = nativeImage.createFromPath(assetPath(IS_MAC ? 'trayTemplate.png' : 'tray.png'));
    if (IS_MAC) image.setTemplateImage(true);
    tray = new Tray(image);
    tray.setToolTip('Macro Manager');
    // macOS: clicking a menu-bar icon shows its menu. Windows: left-click opens
    // the Quick Access flyout by the clock, double-click opens the window,
    // right-click shows the menu.
    if (!IS_MAC) {
      tray.on('click', () => showPalette('tray'));
      tray.on('double-click', () => showWindow());
    }
    updateTrayMenu();
  } catch (e) {
    console.log('[tray] unavailable:', e.message);
  }
}

function prettyAccel(accel) {
  if (!accel) return '';
  return IS_MAC
    ? accel.replace(/Command|Cmd/g, '⌘').replace(/Control|Ctrl/g, '⌃').replace(/Alt|Option/g, '⌥').replace(/Shift/g, '⇧').replace(/\+/g, '')
    : accel.replace(/Control/g, 'Ctrl');
}

// Copy a macro's expansion from the tray — no app has text focus while a tray
// menu is open, so pasting directly isn't reliable there. A macro with fields
// asks for them first.
async function copyFromTray(m, values) {
  if (!values && fieldsFor(m).length) { openFill(m, { action: 'copy' }); return; }
  const { text } = await copyMacro(m, values);
  recordUse({ abbr: m.abbr, chars: Array.from(text).length });
  if (Notification.isSupported()) {
    new Notification({ title: `Copied “${m.title || m.abbr}”`, body: `Paste it with ${IS_MAC ? '⌘V' : 'Ctrl+V'}.`, silent: true }).show();
  }
}

// Pinned macros first, then the most used, up to eight.
function quickAccessMacros() {
  const usage = store.loadUsage();
  const usable = macros.snippets.filter((m) => m.abbr && m.content.trim());
  const pinned = usable.filter((m) => m.pinned);
  const rest = usable.filter((m) => !m.pinned && usage[m.abbr])
    .sort((a, b) => (usage[b.abbr] || 0) - (usage[a.abbr] || 0));
  return { pinned, popular: rest.slice(0, Math.max(0, 8 - pinned.length)) };
}

function updateTrayMenu() {
  if (!tray) return;
  const stats = store.loadStats();
  const today = stats.days[store.localDay()]?.total || 0;
  const { pinned, popular } = quickAccessMacros();
  const macroItem = (m) => ({
    // Windows right-aligns text after a tab; macOS would show it literally.
    label: `${m.title || 'Untitled'}${IS_MAC ? '   ' : '\t'}${macros.prefix}${m.abbr}`,
    click: () => copyFromTray(m).catch((err) => console.error('[tray] copy failed:', err)),
  });

  const template = [
    { label: `${today.toLocaleString()} today  ·  ${stats.lifetime.toLocaleString()} all time`, enabled: false },
    { type: 'separator' },
  ];
  if (pinned.length) {
    template.push({ label: 'Pinned — click to copy', enabled: false }, ...pinned.map(macroItem));
  }
  if (popular.length) {
    template.push({ label: pinned.length ? 'Most used' : 'Most used — click to copy', enabled: false }, ...popular.map(macroItem));
  }
  if (pinned.length || popular.length) template.push({ type: 'separator' });

  template.push(
    { label: `Quick Insert…   ${prettyAccel(settings.quickInsertShortcut)}`, click: () => showPalette(IS_MAC ? 'insert' : 'tray') },
    { label: 'Open Macro Manager', click: () => showWindow() },
    { label: 'New Macro…', click: () => showWindow('new') },
    { type: 'separator' },
    { label: 'Pause Expansion', type: 'checkbox', checked: settings.paused, click: (item) => applySettings({ paused: item.checked }) },
    { label: 'Launch at Login', type: 'checkbox', checked: getLaunchAtLogin(), click: (item) => applySettings({ launchAtLogin: item.checked }) },
    { type: 'separator' },
  );
  if (updateState.status === 'ready') {
    template.push({ label: `Restart to Update (v${updateState.version})`, click: () => installUpdate() });
  } else {
    template.push({ label: 'Check for Updates…', click: () => checkForUpdates(true) });
  }
  template.push({ label: 'Settings…', click: () => showWindow('settings') });
  template.push({ type: 'separator' });
  template.push({ label: 'Quit Macro Manager', click: () => { isQuitting = true; app.quit(); } });

  const menu = Menu.buildFromTemplate(template);
  // Windows: keep left-click for the flyout and show the menu on right-click.
  if (IS_MAC) tray.setContextMenu(menu);
  else {
    tray.removeAllListeners('right-click');
    tray.on('right-click', () => tray.popUpContextMenu(menu));
  }
  tray.setToolTip(settings.paused ? 'Macro Manager — paused' : `Macro Manager — ${today} expansions today`);
}

function buildAppMenu() {
  if (!IS_MAC) { Menu.setApplicationMenu(null); return; }
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { label: 'Check for Updates…', click: () => checkForUpdates(true) },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'Command+,', click: () => showWindow('settings') },
        { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' },
        { label: 'Quit Macro Manager', accelerator: 'Command+Q', click: () => { isQuitting = true; app.quit(); } },
      ],
    },
    {
      label: 'File',
      submenu: [
        { label: 'New Macro', accelerator: 'Command+N', click: () => showWindow('new') },
        { label: 'Quick Insert…', click: () => showPalette('insert') },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        ...(app.isPackaged ? [] : [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }]),
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
      ],
    },
    { role: 'windowMenu' },
  ]));
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
function getLaunchAtLogin() {
  return app.getLoginItemSettings(IS_WIN ? { args: ['--hidden'] } : undefined).openAtLogin;
}

function setLaunchAtLogin(enabled) {
  if (!app.isPackaged) return; // don't register the dev Electron binary
  app.setLoginItemSettings({ openAtLogin: enabled, ...(IS_WIN ? { args: ['--hidden'] } : {}) });
}

function applySettings(patch) {
  // While the user records a new shortcut, the old ones must not fire.
  if ('__suspendShortcuts' in patch) {
    if (patch.__suspendShortcuts) globalShortcut.unregisterAll();
    else registerShortcuts();
    return publicSettings();
  }
  const { launchAtLogin, ...rest } = patch;
  if (launchAtLogin !== undefined) setLaunchAtLogin(Boolean(launchAtLogin));
  if (Object.keys(rest).length) settings = store.saveSettings(rest);
  if (rest.theme) nativeTheme.themeSource = rest.theme;
  if ('quickInsertShortcut' in rest || 'openWindowShortcut' in rest) registerShortcuts();
  updateTrayMenu();
  const snapshot = publicSettings();
  broadcast('settings:changed', snapshot);
  return snapshot;
}

function publicSettings() {
  return { ...settings, launchAtLogin: getLaunchAtLogin(), shortcutErrors };
}

// ---------------------------------------------------------------------------
// Auto-update (packaged builds only)
//
// Windows installs update themselves in the background. macOS builds aren't
// signed with an Apple Developer ID, and Squirrel.Mac refuses unsigned
// updates, so on Mac we point the user to the download instead.
// ---------------------------------------------------------------------------
let autoUpdater = null;

function setUpdateState(next) {
  updateState = next;
  broadcast('update:state', updateState);
  updateTrayMenu();
}

function initAutoUpdater() {
  if (!app.isPackaged) return;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (e) {
    console.log('[updater] unavailable:', e.message);
    return;
  }
  autoUpdater.autoDownload = !IS_MAC;
  autoUpdater.autoInstallOnAppQuit = !IS_MAC;

  autoUpdater.on('checking-for-update', () => setUpdateState({ status: 'checking' }));
  autoUpdater.on('update-not-available', () => setUpdateState({ status: 'latest' }));
  autoUpdater.on('update-available', (info) => {
    setUpdateState({ status: IS_MAC ? 'manual' : 'downloading', version: info.version });
  });
  autoUpdater.on('download-progress', (p) => {
    setUpdateState({ status: 'downloading', version: updateState.version, percent: Math.round(p.percent) });
  });
  autoUpdater.on('update-downloaded', (info) => setUpdateState({ status: 'ready', version: info.version }));
  autoUpdater.on('error', (err) => {
    console.error('[updater]', err.message);
    setUpdateState({ status: 'error', message: 'Couldn’t check for updates. Try again later.' });
  });

  setTimeout(() => checkForUpdates(false), 5000);
  setInterval(() => checkForUpdates(false), 4 * 60 * 60 * 1000);
}

function checkForUpdates(userInitiated) {
  if (!autoUpdater) {
    if (userInitiated) {
      dialog.showMessageBox({ message: 'Updates are only available in the installed app.', detail: `You're running v${app.getVersion()} from source.` });
    }
    return;
  }
  if (['downloading', 'ready'].includes(updateState.status)) return;
  autoUpdater.checkForUpdates().catch(() => { /* reported via 'error' */ });
  if (userInitiated) showWindow('settings');
}

function installUpdate() {
  if (updateState.status === 'manual') { shell.openExternal(RELEASES_URL); return; }
  if (!autoUpdater || updateState.status !== 'ready') return;
  isQuitting = true;
  // Silent install, then relaunch straight back into the app.
  autoUpdater.quitAndInstall(true, true);
}

// ---------------------------------------------------------------------------
// Context menus
//
// Native menus, so right-click looks and behaves like the rest of macOS and
// Windows. The renderers describe a menu as plain data ({ id, label,
// submenu, checked, enabled, role, type: 'separator' }) and get back the id
// that was picked, or null.
// ---------------------------------------------------------------------------
function buildMenuTemplate(items, pick) {
  return items.map((it) => {
    if (it.type === 'separator') return { type: 'separator' };
    if (it.role) return { role: it.role };
    return {
      label: it.label,
      enabled: it.enabled !== false,
      ...(it.checked !== undefined ? { type: 'checkbox', checked: Boolean(it.checked) } : {}),
      ...(it.submenu ? { submenu: buildMenuTemplate(it.submenu, pick) } : { click: () => pick(it.id) }),
    };
  });
}

let menuOpenOver = null;

function popupMenu(win, items) {
  return new Promise((resolve) => {
    let chosen = null;
    const menu = Menu.buildFromTemplate(buildMenuTemplate(items, (id) => { chosen = id; }));
    menuOpenOver = win;
    // On macOS the item's click can arrive just after the menu reports it
    // closed, so wait a beat before answering.
    menu.popup({ window: win, callback: () => setTimeout(() => { menuOpenOver = null; resolve(chosen); }, 40) });
  });
}

// Text fields: spelling suggestions, then the usual edit commands. The macro
// body (the only textarea) also offers its placeholders.
function attachTextContextMenu(win) {
  win.webContents.on('context-menu', (_e, p) => {
    if (!p.isEditable && !p.selectionText) return;
    const items = [];
    if (p.misspelledWord) {
      for (const word of p.dictionarySuggestions.slice(0, 5)) {
        items.push({ label: word, click: () => win.webContents.replaceMisspelling(word) });
      }
      if (!p.dictionarySuggestions.length) items.push({ label: 'No guesses found', enabled: false });
      items.push({ label: 'Add to Dictionary', click: () => win.webContents.session.addWordToSpellCheckerDictionary(p.misspelledWord) });
      items.push({ type: 'separator' });
    }
    if (p.isEditable) items.push({ role: 'cut', enabled: p.editFlags.canCut }, { role: 'copy', enabled: p.editFlags.canCopy }, { role: 'paste', enabled: p.editFlags.canPaste });
    else items.push({ role: 'copy' });
    if (p.isEditable) items.push({ type: 'separator' }, { role: 'selectAll' });
    if (p.formControlType === 'text-area' && win === mainWindow) {
      items.push({ type: 'separator' }, {
        label: 'Insert Placeholder',
        submenu: TOKENS.map((t) => ({ label: `${t.label}   ${t.token}`, click: () => win.webContents.send('editor:insertToken', t.token) })),
      });
    }
    menuOpenOver = win;
    Menu.buildFromTemplate(items).popup({ window: win, callback: () => { menuOpenOver = null; } });
  });
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
ipcMain.handle('app:state', () => ({
  macros,
  usage: store.loadUsage(),
  stats: store.loadStats(),
  today: store.localDay(),
  settings: publicSettings(),
  version: app.getVersion(),
  platform: process.platform,
  dataPath: store.paths.macros,
  accessibility: accessibilityGranted(),
  update: updateState,
  builtIns: BUILT_INS,
  tokens: TOKENS,
  fieldMemory: store.loadFieldMemory(),
}));

ipcMain.handle('macros:save', (e, data) => {
  macros = store.saveMacros(data);
  broadcast('macros:changed', macros, e.sender);
  scheduleTrayRefresh(); // pinned macros live in the tray menu
  return macros;
});

ipcMain.handle('usage:rename', (_e, from, to) => store.renameUsage(String(from), String(to)));
ipcMain.handle('usage:delete', (_e, abbr) => store.deleteUsage(String(abbr)));

// Previews: { text, html, cursorBack }. `opts` may carry format, values, and
// chips/caret for the editor's preview card.
ipcMain.handle('template:preview', (_e, content, opts = {}) =>
  renderExpansion(String(content ?? ''), { ...(opts || {}), clipboard: '[clipboard]' }));
// Copy a macro the way it would paste. `remember` saves the answers as
// suggestions (only for answers someone actually typed in the prompt).
ipcMain.handle('expansion:copy', async (_e, { content, format, fields, values, remember } = {}) => {
  const { text } = await copyMacro({ content, format, fields }, values || undefined, { remember: Boolean(remember) });
  return { text };
});

ipcMain.handle('settings:set', (_e, patch) => applySettings(patch || {}));

ipcMain.handle('macros:export', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Macros',
    defaultPath: path.join(app.getPath('documents'), `macro-manager-backup-${today}.json`),
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePath) return { ok: false };
  try {
    fs.writeFileSync(filePath, JSON.stringify(macros, null, 2), 'utf-8');
    return { ok: true, count: macros.snippets.length };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('macros:import', async () => {
  const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Macros',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths.length) return { ok: false };
  try {
    const incoming = JSON.parse(fs.readFileSync(filePaths[0], 'utf-8'));
    const { merged, added, skipped } = store.mergeImport(incoming);
    macros = merged;
    broadcast('macros:changed', macros);
    return { ok: true, added, skipped };
  } catch (err) {
    return { ok: false, error: err instanceof SyntaxError ? 'That file isn’t valid JSON.' : err.message };
  }
});

ipcMain.handle('app:openDataFolder', () => shell.openPath(store.paths.dir));
ipcMain.handle('app:openReleases', () => shell.openExternal(RELEASES_URL));
ipcMain.handle('app:checkForUpdates', () => checkForUpdates(true));
ipcMain.handle('app:installUpdate', () => installUpdate());
ipcMain.handle('app:requestAccessibility', () => {
  if (!IS_MAC) return true;
  const ok = systemPreferences.isTrustedAccessibilityClient(true);
  if (!ok) shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
  return ok;
});
ipcMain.handle('app:showPalette', () => showPalette('insert'));
ipcMain.handle('menu:popup', (e, items) => popupMenu(BrowserWindow.fromWebContents(e.sender), Array.isArray(items) ? items : []));

// Palette → insert a macro into whatever app was focused before. `values`
// are the fill-in answers when it has fields.
ipcMain.handle('palette:insert', (_e, { content, abbr, format, fields, values }) => {
  pasteMacro({ content, abbr, format, fields }, { values: values || undefined });
});
// The fill-in prompt was submitted for the macro main asked about.
ipcMain.handle('palette:fill', async (_e, values) => {
  if (!pendingFill) return;
  const { macro, deleteCount, action } = pendingFill;
  pendingFill = null;
  if (action === 'copy') {
    hidePalette();
    await copyFromTray(macro, values || {}).catch((err) => console.error('[tray] copy failed:', err));
    return;
  }
  pasteMacro(macro, { deleteCount, values: values || {} });
});
ipcMain.handle('palette:copied', (_e, { abbr, chars }) => {
  recordUse({ abbr: abbr || null, chars: Number(chars) || 0 });
});
ipcMain.handle('palette:close', () => hidePalette());
ipcMain.handle('palette:openMacro', (_e, index) => {
  hidePalette();
  showWindow(index >= 0 ? `macro:${index}` : undefined);
});

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
app.on('second-instance', () => showWindow());

app.whenReady().then(() => {
  nativeTheme.themeSource = settings.theme;
  buildAppMenu();

  // Launched by the OS at login → start quietly in the tray.
  const startHidden = process.argv.includes('--hidden') || (IS_MAC && app.getLoginItemSettings().wasOpenedAtLogin);

  // A text expander that stops working after a reboot is no good, so turn
  // launch-at-login on once by default. Users can switch it off in Settings.
  if (!settings.launchAtLoginInitialized && !SMOKE_TEST) {
    setLaunchAtLogin(true);
    settings = store.saveSettings({ launchAtLoginInitialized: true });
  }

  createWindow({ show: !startHidden });
  if (startHidden && IS_MAC) app.dock.hide();
  createTray();
  createPalette();
  registerShortcuts();
  if (SMOKE_TEST) { runSmokeTest(); return; }
  initAutoUpdater();

  if (!startExpander()) {
    expanderRetry = setInterval(() => {
      if (startExpander()) broadcast('accessibility:changed', true);
    }, 3000);
  }

  app.on('activate', () => showWindow());
});

async function captureScreens(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const save = (name, img) => {
    fs.writeFileSync(path.join(dir, `${process.platform}-${name}.png`), img.toPNG());
    console.log('[smoke] screenshot', name);
  };
  const snap = async (win, name) => save(name, await win.webContents.capturePage());
  // The whole screen, so Windows' own title bar buttons are in the picture
  // (capturePage only sees the web page). macOS needs a permission for this.
  const snapScreen = async (name) => {
    if (!IS_WIN) return;
    const { width, height } = screen.getPrimaryDisplay().size;
    const [src] = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width, height } });
    if (src) save(name, src.thumbnail);
  };

  mainWindow.setSize(1100, 720);
  mainWindow.center();
  mainWindow.show();
  mainWindow.focus();
  await wait(1200);
  await snap(mainWindow, '0-whats-new');
  await mainWindow.webContents.executeJavaScript("document.querySelector('.sheet-backdrop [data-close]')?.click()");
  const views = [['overview', '1-overview'], ['library', '2-macros'], ['macro:1', '3-editor'], ['settings', '4-settings'], ['builtins', '5-date-time']];
  for (const [view, name] of views) {
    mainWindow.webContents.send('navigate', view);
    await wait(1000);
    await snap(mainWindow, name);
  }
  mainWindow.webContents.send('navigate', 'overview');
  await wait(800);
  await snapScreen('6-desktop');
  nativeTheme.themeSource = 'dark';
  await wait(1000);
  await snap(mainWindow, '7-overview-dark');
  await snapScreen('8-desktop-dark');
  nativeTheme.themeSource = settings.theme;
  showPalette('insert');
  await wait(1000);
  await snap(paletteWindow, '9-quick-insert');
  hidePalette();
  const withFields = macros.snippets.find((m) => fieldsFor(m).length);
  if (withFields) {
    await wait(400);
    openFill(withFields, { action: 'copy' });
    await wait(1000);
    await snap(paletteWindow, '11-fill-in');
    hidePalette();
  }
  if (IS_WIN) {
    await wait(400);
    showPalette('tray');
    await wait(1000);
    await snap(paletteWindow, '10-tray-flyout');
    hidePalette();
  }
}

function runSmokeTest() {
  const errors = [];
  const fail = (msg) => { console.error('[smoke] FAIL:', msg); app.exit(1); };
  setTimeout(() => fail('timed out after 90s'), 90000);

  const loaded = [mainWindow, paletteWindow].map((w) => new Promise((resolve) => {
    w.webContents.on('console-message', (e) => {
      const level = e.level ?? e.params?.level;
      if (level === 'error' || level === 3) errors.push(e.message ?? e.params?.message);
    });
    w.webContents.on('render-process-gone', (_e, d) => fail(`renderer crashed: ${d.reason}`));
    w.webContents.on('did-fail-load', (_e, code, desc) => fail(`load failed: ${desc} (${code})`));
    if (!w.webContents.isLoading()) resolve(); else w.webContents.once('did-finish-load', resolve);
  }));

  Promise.all(loaded).then(async () => {
    // Give the renderers a moment to run their init and render the UI.
    await new Promise((r) => setTimeout(r, 2500));
    const rows = await mainWindow.webContents.executeJavaScript('document.querySelectorAll(".nav-item").length');
    if (rows < 3) return fail(`main window didn't render (nav items: ${rows})`);
    if (errors.length) return fail(`renderer errors: ${errors.join(' | ')}`);
    try {
      expander.start();
      expander.stop();
      console.log('[smoke] keyboard hook started and stopped');
    } catch (err) {
      // Headless CI runners may refuse global hooks; loading the native module
      // (already done at require time) is what matters here.
      console.log('[smoke] keyboard hook unavailable on this runner:', err.message);
    }

    // SMOKE_SHOTS=<dir>: photograph every screen of the real packaged app on
    // this OS, so a Windows build can be looked at without a Windows PC.
    if (process.env.SMOKE_SHOTS) {
      try {
        await captureScreens(process.env.SMOKE_SHOTS);
      } catch (err) {
        console.log('[smoke] screenshots failed (not fatal):', err.message);
      }
    }

    // Type "/smoke" + Space through the real handler and paste path, with
    // synthetic key presses switched off so nothing is typed on the runner.
    // The expansion must be recorded and the clipboard put back exactly.
    const { uIOhook, UiohookKey: K } = require('uiohook-napi');
    uIOhook.keyTap = () => {};
    macros = { prefix: '/', snippets: [
      { title: 'Smoke', abbr: 'smoke', content: 'Smoke test {date}' },
      { title: 'Rich', abbr: 'smokerich', format: 'rich', content: '**Bold** and [a link](https://example.com)' },
      { title: 'Fill', abbr: 'smokefill', content: 'Hi {field:Name}, unit {field:Unit}', fields: [{ label: 'Unit', choices: ['2A', '4B'] }] },
    ] };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const type = (word) => {
      for (const ch of `/${word} `) {
        const code = ch === '/' ? K.Slash : ch === ' ' ? K.Space : K[ch.toUpperCase()];
        uIOhook.emit('keydown', { keycode: code, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false });
      }
    };
    // The expansion sits on the clipboard for a few hundred ms before the
    // user's clipboard comes back: catch it there.
    const catchPaste = async (sentinel) => {
      for (let t = 0; t < 60; t++) {
        const text = await clipboard.readText().catch(() => '');
        if (text && text !== sentinel) {
          const types = (await clipboard.read().catch(() => [])).flatMap((i) => i.types);
          const html = types.includes('text/html') ? await (await (await clipboard.read())[0].getType('text/html')).text() : null;
          return { text, html };
        }
        await sleep(10);
      }
      return null;
    };
    const uses = (abbr) => store.loadUsage()[abbr] || 0;

    // 1. A plain, field-free macro: text only, exactly as in 2.1.
    let sentinel = `smoke-${Date.now()}`;
    await clipboard.writeText(sentinel);
    type('smoke');
    const plain = await catchPaste(sentinel);
    await sleep(2000);
    if (!plain || !plain.text.startsWith('Smoke test ')) return fail(`plain expansion not on the clipboard (got ${JSON.stringify(plain)})`);
    if (plain.html) return fail('a plain macro put HTML on the clipboard');
    if (uses('smoke') !== 1) return fail(`expansion wasn't recorded (smoke count ${uses('smoke')})`);
    if (await clipboard.readText() !== sentinel) return fail('clipboard not restored after the plain expansion');
    console.log('[smoke] plain expansion pasted as text, recorded, and clipboard restored');

    // 2. A formatted macro: one clipboard item with both flavours.
    sentinel = `smoke-rich-${Date.now()}`;
    await clipboard.writeText(sentinel);
    type('smokerich');
    const rich = await catchPaste(sentinel);
    await sleep(2000);
    if (!rich || rich.text !== 'Bold and a link (https://example.com)') return fail(`rich expansion text wrong (got ${JSON.stringify(rich)})`);
    if (!rich.html || !rich.html.includes('<strong>Bold</strong>') || !rich.html.includes('href="https://example.com"')) return fail(`no HTML flavour (got ${JSON.stringify(rich.html)})`);
    if (uses('smokerich') !== 1) return fail('rich expansion not recorded');
    if (await clipboard.readText() !== sentinel) return fail('clipboard not restored after the rich expansion');
    console.log('[smoke] formatted expansion pasted with text/plain and text/html, clipboard restored');

    // 3. A macro with fields: the prompt opens and nothing is pasted until
    //    it's filled in; Esc leaves everything alone.
    const promptShown = () => paletteWindow.isVisible() && paletteWindow.webContents.executeJavaScript("!document.getElementById('fill').classList.contains('hidden') && !!document.getElementById('fill-0')");
    const waitFor = async (check) => { for (let t = 0; t < 100; t++) { if (await check()) return true; await sleep(30); } return false; };
    sentinel = `smoke-fill-${Date.now()}`;
    await clipboard.writeText(sentinel);
    type('smokefill');
    if (!await waitFor(promptShown)) return fail('fill-in prompt did not open');
    await paletteWindow.webContents.executeJavaScript("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await sleep(600);
    if (paletteWindow.isVisible() || uses('smokefill') || await clipboard.readText() !== sentinel) return fail('Esc in the prompt did not leave everything alone');
    type('smokefill');
    if (!await waitFor(promptShown)) return fail('fill-in prompt did not reopen');
    await paletteWindow.webContents.executeJavaScript(`(() => {
      const i = document.getElementById('fill-0');
      i.value = 'Jane'; i.dispatchEvent(new Event('input'));
      i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    })()`);
    const filled = await catchPaste(sentinel);
    await sleep(2000);
    if (!filled || filled.text !== 'Hi Jane, unit 2A') return fail(`fill-in expansion wrong (got ${JSON.stringify(filled)})`);
    if (uses('smokefill') !== 1) return fail('fill-in expansion not recorded');
    if (await clipboard.readText() !== sentinel) return fail('clipboard not restored after the fill-in expansion');
    if (!(store.loadFieldMemory().name || []).includes('Jane')) return fail('fill-in answer not remembered');
    console.log('[smoke] fill-in prompt opened, Esc left it alone, Enter pasted the answers');

    console.log(`[smoke] OK — v${app.getVersion()} on ${process.platform}`);
    app.exit(0);
  });
}

// Stay alive in the tray when every window is closed.
app.on('window-all-closed', () => {});

app.on('before-quit', () => { isQuitting = true; });

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (expanderRunning) {
    try { expander.stop(); } catch { /* already stopped */ }
  }
});
