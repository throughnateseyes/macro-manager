const { app, BrowserWindow, ipcMain, clipboard, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { uIOhook, UiohookKey } = require('uiohook-napi');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const DATA_DIR = app.getPath('userData');
const MACROS_PATH = path.join(DATA_DIR, 'macros.json');

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
  // If macros.json doesn't exist yet, try migrating from snippets.json
  if (!fs.existsSync(MACROS_PATH)) {
    if (fs.existsSync(LEGACY_PATH)) {
      try {
        const legacy = JSON.parse(fs.readFileSync(LEGACY_PATH, 'utf-8'));
        fs.writeFileSync(MACROS_PATH, JSON.stringify(legacy, null, 2), 'utf-8');
        return legacy;
      } catch { /* fall through to default */ }
    }
    fs.writeFileSync(MACROS_PATH, JSON.stringify(DEFAULT_DATA, null, 2), 'utf-8');
    return { ...DEFAULT_DATA, snippets: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(MACROS_PATH, 'utf-8'));
  } catch {
    return { ...DEFAULT_DATA, snippets: [] };
  }
}

function saveMacros(data) {
  fs.writeFileSync(MACROS_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// Keyboard listener — abbreviation expansion via uiohook-napi
// ---------------------------------------------------------------------------
let buf = '';
let macrosCache = loadMacros();
let listening = true;

// Map uiohook keycodes → characters (printable ASCII subset)
const KEYCODE_CHAR = {};
'abcdefghijklmnopqrstuvwxyz'.split('').forEach((c, i) => {
  KEYCODE_CHAR[UiohookKey[c.toUpperCase()] ?? UiohookKey[c]] = c;
});
'0123456789'.split('').forEach((c) => {
  KEYCODE_CHAR[UiohookKey[`Num${c}`] ?? UiohookKey[c]] = c;
});
// Common punctuation
const PUNCT_MAP = {
  [UiohookKey.Slash]: '/',
  [UiohookKey.Backslash]: '\\',
  [UiohookKey.Period]: '.',
  [UiohookKey.Comma]: ',',
  [UiohookKey.Semicolon]: ';',
  [UiohookKey.Equal]: '=',
  [UiohookKey.Minus]: '-',
  [UiohookKey.Quote]: "'",
  [UiohookKey.Backquote]: '`',
};
Object.assign(KEYCODE_CHAR, PUNCT_MAP);

// Default snippets — date & time, dynamically generated at expansion time
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

const DEFAULT_RESOLVERS = {
  ts: () => {
    const d = new Date();
    const h = d.getHours(), m = d.getMinutes(), s = d.getSeconds();
    return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
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
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
  },
  time12: () => {
    const d = new Date();
    let h = d.getHours(), ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${String(d.getMinutes()).padStart(2,'0')} ${ampm}`;
  },
  day: () => {
    const d = new Date();
    return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
  },
  unix: () => String(Math.floor(Date.now() / 1000)),
};

function expandMacro() {
  const trimmed = buf.trim();
  const prefix = macrosCache.prefix || '/';

  if (!trimmed.startsWith(prefix)) return;

  const abbr = trimmed.slice(prefix.length).toLowerCase();
  if (!abbr) return;

  const deleteCount = prefix.length + abbr.length + 1;

  // Check user macros first (they take priority)
  const userMatch = macrosCache.snippets.find(
    (s) => s.abbr.toLowerCase() === abbr
  );
  if (userMatch) {
    const text = userMatch.content.replace(/<[^>]*>/g, '');
    typeExpansion(deleteCount, text);
    return;
  }

  // Check default snippet resolvers
  const resolver = DEFAULT_RESOLVERS[abbr];
  if (resolver) {
    typeExpansion(deleteCount, resolver());
    return;
  }
}

function typeExpansion(deleteCount, text) {
  // Briefly stop listening so our own synthetic keys aren't captured
  listening = false;

  // Save clipboard, paste expansion, restore clipboard
  const prev = clipboard.readText();
  clipboard.writeText(text);

  // Delete the typed abbreviation + trigger key via backspaces
  for (let i = 0; i < deleteCount; i++) {
    uIOhook.keyTap(UiohookKey.Backspace);
  }

  // Paste (Cmd+V on Mac, Ctrl+V on Windows/Linux)
  const modifier = process.platform === 'darwin' ? UiohookKey.Meta : UiohookKey.Ctrl;
  uIOhook.keyTap(UiohookKey.V, [modifier]);

  // Restore clipboard after a short delay
  setTimeout(() => {
    clipboard.writeText(prev);
    listening = true;
  }, 100);
}

// Register uiohook events
uIOhook.on('keydown', (e) => {
  if (!listening) return;

  const code = e.keycode;

  // Trigger keys: space, enter, tab
  if (
    code === UiohookKey.Space ||
    code === UiohookKey.Enter ||
    code === UiohookKey.Tab
  ) {
    expandMacro();
    buf = '';
    return;
  }

  // Backspace
  if (code === UiohookKey.Backspace) {
    buf = buf.slice(0, -1);
    return;
  }

  // Printable character
  const ch = KEYCODE_CHAR[code];
  if (ch) {
    buf += ch;
  } else {
    // Non-printable / modifier — reset buffer
    if (
      code !== UiohookKey.Shift &&
      code !== UiohookKey.ShiftRight &&
      code !== UiohookKey.Alt &&
      code !== UiohookKey.AltRight &&
      code !== UiohookKey.Ctrl &&
      code !== UiohookKey.CtrlRight &&
      code !== UiohookKey.Meta &&
      code !== UiohookKey.MetaRight
    ) {
      buf = '';
    }
  }
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

ipcMain.handle('macros:listenerStatus', () => listening);

ipcMain.handle('app:version', () => app.getVersion());

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
let mainWindow;

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
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  createWindow();
  uIOhook.start();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  uIOhook.stop();
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  uIOhook.stop();
});
