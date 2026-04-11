const { app, BrowserWindow, ipcMain, clipboard, globalShortcut, dialog, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { uIOhook, UiohookKey } = require('uiohook-napi');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const DATA_DIR = app.getPath('userData');
const MACROS_PATH = path.join(DATA_DIR, 'macros.json');
const USAGE_PATH  = path.join(DATA_DIR, 'usage.json');

// Legacy path — used for one-time migration from the Python app
const LEGACY_PATH = path.join(__dirname, '..', 'snippets.json');

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------
const DEFAULT_DATA = {
  snippets: [],
  prefix: '/',
};

function loadMacros() {
  // If macros.json exists, always use it — never fall back to legacy.
  if (fs.existsSync(MACROS_PATH)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(MACROS_PATH, 'utf-8'));
      // Shape normalization — guard against corrupt or partial writes.
      if (!Array.isArray(parsed.snippets)) parsed.snippets = [];
      if (typeof parsed.prefix !== 'string' || parsed.prefix.length === 0) parsed.prefix = '/';
      return parsed;
    } catch {
      console.error('[macros] macros.json is corrupt — resetting to defaults');
      const fresh = { snippets: [], prefix: '/' };
      fs.writeFileSync(MACROS_PATH, JSON.stringify(fresh, null, 2), 'utf-8');
      return fresh;
    }
  }

  // macros.json does not exist yet — one-time migration from Python app.
  if (fs.existsSync(LEGACY_PATH)) {
    try {
      const legacy = JSON.parse(fs.readFileSync(LEGACY_PATH, 'utf-8'));
      if (!Array.isArray(legacy.snippets)) legacy.snippets = [];
      if (typeof legacy.prefix !== 'string' || legacy.prefix.length === 0) legacy.prefix = '/';
      fs.writeFileSync(MACROS_PATH, JSON.stringify(legacy, null, 2), 'utf-8');
      console.log('[macros] Migrated', legacy.snippets.length, 'snippets from legacy snippets.json');
      return legacy;
    } catch {
      console.error('[macros] Failed to migrate legacy snippets.json — starting fresh');
    }
  }

  // No data anywhere — write defaults and return.
  const fresh = { snippets: [], prefix: '/' };
  fs.writeFileSync(MACROS_PATH, JSON.stringify(fresh, null, 2), 'utf-8');
  return fresh;
}

function saveMacros(data) {
  fs.writeFileSync(MACROS_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// Usage tracking helpers  { "abbr": count, ... }
// ---------------------------------------------------------------------------
function loadUsage() {
  if (fs.existsSync(USAGE_PATH)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(USAGE_PATH, 'utf-8'));
      if (typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch { /* fall through */ }
  }
  return {};
}

function saveUsage(usage) {
  fs.writeFileSync(USAGE_PATH, JSON.stringify(usage, null, 2), 'utf-8');
}

function incrementUsage(abbr) {
  const usage = loadUsage();
  usage[abbr] = (usage[abbr] || 0) + 1;
  saveUsage(usage);
  return usage[abbr];
}

// ---------------------------------------------------------------------------
// Keyboard listener — abbreviation expansion via uiohook-napi
// ---------------------------------------------------------------------------
let buf = '';
let macrosCache = loadMacros();
let listening = true;

console.log('[macros] Loaded from:', MACROS_PATH);
console.log('[macros] Snippet count:', macrosCache.snippets.length);
console.log('[macros] Prefix:', macrosCache.prefix);
macrosCache.snippets.forEach((s, i) =>
  console.log(`  [${i}] abbr="${s.abbr}" content="${String(s.content).slice(0, 60)}..."`)
);

// ---------------------------------------------------------------------------
// Keycode → character map (printable ASCII)
//
// uiohook fires on physical keycodes, not characters. Holding Shift does NOT
// change the keycode — typing uppercase 'N' fires the same code as lowercase
// 'n'. We always store lowercase and match case-insensitively, so shifted
// letters work transparently without tracking shift state.
// ---------------------------------------------------------------------------
const KEYCODE_CHAR = {};

'abcdefghijklmnopqrstuvwxyz'.split('').forEach((c) => {
  KEYCODE_CHAR[UiohookKey[c.toUpperCase()] ?? UiohookKey[c]] = c;
});

'0123456789'.split('').forEach((c) => {
  KEYCODE_CHAR[UiohookKey[`Num${c}`] ?? UiohookKey[c]] = c;
});

// Punctuation — covers all characters usable as a trigger prefix or in an
// abbreviation. Shift variants of these keys are not tracked (see note above).
const PUNCT_MAP = {
  [UiohookKey.Slash]:        '/',
  [UiohookKey.Backslash]:    '\\',
  [UiohookKey.Period]:       '.',
  [UiohookKey.Comma]:        ',',
  [UiohookKey.Semicolon]:    ';',
  [UiohookKey.Equal]:        '=',
  [UiohookKey.Minus]:        '-',
  [UiohookKey.Quote]:        "'",
  [UiohookKey.Backquote]:    '`',
  [UiohookKey.BracketLeft]:  '[',
  [UiohookKey.BracketRight]: ']',
};
Object.assign(KEYCODE_CHAR, PUNCT_MAP);

// Pure modifier keycodes — pressing these does not change what is on screen,
// so they must not reset the buffer. Stored as a Set for O(1) lookup.
const MODIFIER_KEYS = new Set([
  UiohookKey.Shift,      UiohookKey.ShiftRight,
  UiohookKey.Alt,        UiohookKey.AltRight,
  UiohookKey.Ctrl,       UiohookKey.CtrlRight,
  UiohookKey.Meta,       UiohookKey.MetaRight,
]);

// Default snippets — date & time, dynamically generated at expansion time
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

const DEFAULT_RESOLVERS = {
  ts: () => {
    const d = new Date();
    let h = d.getHours(), ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} ${h}:${String(d.getMinutes()).padStart(2,'0')} ${ampm}`;
  },
  date: () => {
    const d = new Date();
    return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;
  },
  isodate: () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },
  time: () => {
    const d = new Date();
    let h = d.getHours(), ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${String(d.getMinutes()).padStart(2,'0')} ${ampm}`;
  },
  time24: () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
  },
  day: () => {
    const d = new Date();
    return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
  },
  unix: () => String(Math.floor(Date.now() / 1000)),
};

// expandMacro() is called immediately when a trigger key (Space / Enter / Tab)
// is pressed. At call time:
//   - buf contains everything typed since the last reset, e.g. "/nate"
//   - the trigger key itself has NOT been appended (trigger keys are handled
//     before any character append and always clear buf afterward)
//   - Shift and other pure modifiers never modified buf
// If buf starts with the current prefix and the remainder matches a known
// abbreviation, the typed text is replaced with the expansion.
function expandMacro() {
  const prefix = macrosCache.prefix || '/';

  if (!buf.startsWith(prefix)) return;

  const abbr = buf.slice(prefix.length).toLowerCase();
  if (!abbr) return;

  // deleteCount = everything currently in buf + the trigger key that just fired
  const deleteCount = buf.length + 1;

  // Check user macros first (they take priority over defaults)
  const userMatch = macrosCache.snippets.find(
    (s) => s.abbr.toLowerCase() === abbr
  );
  if (userMatch) {
    const raw = typeof userMatch.content === 'string' ? userMatch.content : '';
    // Normalise content: handle HTML from old contenteditable saves, then
    // decode entities so the pasted text is always clean plain text.
    const text = raw
      .replace(/<br\s*\/?>/gi,  '\n')    // <br>   → newline
      .replace(/<\/div>/gi,     '\n')    // </div> → newline (contenteditable blocks)
      .replace(/<[^>]*>/g,      '')      // strip all remaining tags
      .replace(/&amp;/g,        '&')     // decode HTML entities
      .replace(/&lt;/g,         '<')
      .replace(/&gt;/g,         '>')
      .replace(/&quot;/g,       '"')
      .replace(/&apos;/g,       "'")
      .replace(/&nbsp;/g,       ' ')
      .replace(/\n{3,}/g,       '\n\n') // collapse runs of blank lines
      .trim();
    incrementUsage(abbr);
    console.log(`[expand] "${abbr}" -> "${text.slice(0, 80)}${text.length > 80 ? '...' : ''}"`);
    typeExpansion(deleteCount, text);
    return;
  }

  // Check built-in date/time resolvers
  const resolver = DEFAULT_RESOLVERS[abbr];
  if (resolver) {
    typeExpansion(deleteCount, resolver());
    return;
  }
}

function typeExpansion(deleteCount, text) {
  // Disable the listener FIRST — before any key synthesis — so our own
  // backspace and paste events are not re-captured by this handler.
  listening = false;
  buf = '';  // clear immediately; the keydown handler's buf='' is a safety net

  // Snapshot the clipboard so we can restore it after pasting.
  const prev = clipboard.readText();
  clipboard.writeText(text);

  // Erase the typed abbreviation + trigger key.
  for (let i = 0; i < deleteCount; i++) {
    uIOhook.keyTap(UiohookKey.Backspace);
  }

  // Paste — Cmd+V on macOS, Ctrl+V on Windows / Linux.
  const modifier = process.platform === 'darwin' ? UiohookKey.Meta : UiohookKey.Ctrl;
  uIOhook.keyTap(UiohookKey.V, [modifier]);

  // Restore the clipboard and re-enable the listener after a conservative
  // delay. 300ms gives slower machines and the Windows hook stack enough
  // time to finish processing the paste before we start capturing again.
  setTimeout(() => {
    clipboard.writeText(prev);
    listening = true;
  }, 300);
}

// ---------------------------------------------------------------------------
// uiohook event handlers
// ---------------------------------------------------------------------------
uIOhook.on('keydown', (e) => {
  if (!listening) return;

  const code = e.keycode;

  // Trigger keys: Space / Enter / Tab — attempt expansion, then always reset.
  if (
    code === UiohookKey.Space ||
    code === UiohookKey.Enter ||
    code === UiohookKey.Tab
  ) {
    expandMacro();
    buf = '';   // safety-net clear (typeExpansion also clears on match)
    return;
  }

  // Backspace — trim the last character from the buffer.
  if (code === UiohookKey.Backspace) {
    buf = buf.slice(0, -1);
    return;
  }

  const ch = KEYCODE_CHAR[code];
  if (ch) {
    // If the character typed IS the current prefix, start a fresh buffer from
    // here. This ensures /abbr works even if the buffer contains garbage from
    // earlier typing — e.g. user types "hello/nate" and we correctly reset to
    // "/nate" the moment '/' is pressed.
    if (ch === (macrosCache.prefix || '/')) {
      buf = ch;
    } else {
      buf += ch;
    }
  } else if (!MODIFIER_KEYS.has(code)) {
    // Any unrecognised non-modifier key (arrow keys, F-keys, Escape, etc.)
    // means the cursor may have moved or the context changed — reset.
    buf = '';
  }
});

// A mouse click means the insertion point has moved; any partial abbreviation
// in the buffer is now stale and must be discarded.
uIOhook.on('mousedown', () => {
  buf = '';
});

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------
ipcMain.handle('macros:load', () => {
  macrosCache = loadMacros();
  return macrosCache;
});

ipcMain.handle('macros:save', (_event, data) => {
  saveMacros(data);
  macrosCache = data;
  return true;
});

ipcMain.handle('macros:getPath', () => MACROS_PATH);

ipcMain.handle('macros:incrementUsage', (_event, abbr) => {
  if (typeof abbr !== 'string' || !abbr) return 0;
  return incrementUsage(abbr);
});

ipcMain.handle('macros:getUsage', () => loadUsage());

ipcMain.handle('macros:listenerStatus', () => listening);

ipcMain.handle('macros:export', async () => {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const { filePath, canceled } = await dialog.showSaveDialog({
    title: 'Export macros',
    defaultPath: `macro-manager-backup-${today}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePath) return { ok: false };
  try {
    const content = fs.readFileSync(MACROS_PATH, 'utf-8');
    fs.writeFileSync(filePath, content, 'utf-8');
    return { ok: true };
  } catch (err) {
    console.error('[export] Failed:', err.message);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('macros:import', async () => {
  const { filePaths, canceled } = await dialog.showOpenDialog({
    title: 'Import macros',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths.length) return { ok: false };
  try {
    const incoming = JSON.parse(fs.readFileSync(filePaths[0], 'utf-8'));
    if (!Array.isArray(incoming.snippets)) {
      return { ok: false, error: 'Invalid file — no snippets array found.' };
    }
    // Merge: skip any abbreviation that already exists in the current data
    const current = loadMacros();
    const existingAbbrs = new Set(current.snippets.map((s) => s.abbr.toLowerCase()));
    const toAdd = incoming.snippets.filter(
      (s) => s.abbr && !existingAbbrs.has(s.abbr.toLowerCase())
    );
    const merged = { ...current, snippets: [...current.snippets, ...toAdd] };
    saveMacros(merged);
    macrosCache = merged;
    console.log(`[import] Added ${toAdd.length} snippets (${incoming.snippets.length - toAdd.length} skipped as duplicates)`);
    return { ok: true, added: toAdd.length, data: merged };
  } catch (err) {
    console.error('[import] Failed:', err.message);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('app:version', () => app.getVersion());

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
let mainWindow;
let tray = null;
let isQuitting = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 640,
    minWidth: 700,
    minHeight: 480,
    backgroundColor: '#1e1e1e',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // required for uiohook preload compatibility
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Hide instead of close — app keeps running in tray
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
      if (process.platform === 'darwin') app.dock.hide();
    }
  });
}

function showWindow() {
  if (!mainWindow) {
    createWindow();
  } else {
    mainWindow.show();
  }
  if (process.platform === 'darwin') app.dock.show();
}

function toggleWindow() {
  if (mainWindow && mainWindow.isVisible()) {
    mainWindow.hide();
    if (process.platform === 'darwin') app.dock.hide();
  } else {
    showWindow();
  }
}

// ---------------------------------------------------------------------------
// Tray
// ---------------------------------------------------------------------------
function createTrayIcon() {
  // 16x16 monochrome "M" icon as a base64 PNG
  // Generated: white M on transparent background
  const iconBase64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAA'
    + 'XklEQVR4nGNgGAWDATAiC/z//5/h////DPgMYEQX+P//P8P///8Z'
    + 'cBnAiMuF/0E0AxZNjMgC/6EYqx5GbIHx////DLhcyIhLgAGJBgBc'
    + 'ZCER2EIB3UtiAACvGyAR3tNGJQAAAABJRU5ErkJggg==';

  let trayImage;
  if (process.platform === 'darwin') {
    trayImage = nativeImage.createFromDataURL(`data:image/png;base64,${iconBase64}`);
    trayImage.setTemplateImage(true);
  } else {
    trayImage = nativeImage.createFromDataURL(`data:image/png;base64,${iconBase64}`);
  }

  tray = new Tray(trayImage);
  tray.setToolTip('Macro Manager');

  // Left-click toggles window
  tray.on('click', () => toggleWindow());

  updateTrayMenu();
}

function updateTrayMenu() {
  const loginEnabled = app.getLoginItemSettings().openAtLogin;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Macro Manager',
      click: () => showWindow(),
    },
    { type: 'separator' },
    {
      label: `Listener: ${listening ? 'Active ✓' : 'Inactive'}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Launch at Login',
      type: 'checkbox',
      checked: loginEnabled,
      click: (menuItem) => {
        app.setLoginItemSettings({ openAtLogin: menuItem.checked });
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  createWindow();
  createTrayIcon();
  uIOhook.start();

  // Global shortcut to toggle window: Cmd+Shift+M (Mac) / Ctrl+Shift+M (Win)
  const shortcut = process.platform === 'darwin' ? 'CommandOrControl+Shift+M' : 'Ctrl+Shift+M';
  globalShortcut.register(shortcut, () => toggleWindow());

  app.on('activate', () => {
    showWindow();
  });
});

// Prevent app from quitting when all windows are closed — it lives in the tray
app.on('window-all-closed', () => {
  // Do nothing — keep running in tray
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  uIOhook.stop();
});
