# Macro Manager

A cross-platform text expansion desktop app built with Electron. Define short abbreviations that expand into full text snippets — works system-wide in any application.

Migrated from an earlier Python/Tkinter version. Runs on Mac and Windows.

---

## Running in development

```bash
npm install
npm start
```

**Mac:** No sudo or elevated privileges required. The global keyboard listener uses `uiohook-napi`, which works with standard user permissions on macOS.

**Windows:** You may need to run as Administrator for the global keyboard hook to function. If macros aren't expanding, try right-clicking the terminal and selecting "Run as administrator" before running `npm start`.

---

## How it works

1. Open Macro Manager and create a macro with a title, abbreviation, and content.
2. In any application, type the trigger prefix followed by the abbreviation.
3. Press **Space**, **Enter**, or **Tab** to trigger expansion.
4. The typed abbreviation is deleted and replaced with the macro's full content via clipboard paste.

The default trigger prefix is `/` — typing `/abbr` then Space expands to the macro with abbreviation `abbr`. The prefix can be changed in the app.

---

## Features

- **My Macros** — create, edit, and delete custom text macros with optional bold/italic/underline formatting
- **Default Snippets** — built-in read-only date/time macros that generate dynamic values at expansion time:
  - `/ts` → full timestamp (e.g. `January 1, 2025 14:32:05`)
  - `/date` → short date (`MM/DD/YYYY`)
  - `/isodate` → ISO date (`YYYY-MM-DD`)
  - `/time` → 24-hour time
  - `/time12` → 12-hour time with AM/PM
  - `/day` → weekday and date (e.g. `Wednesday, January 1`)
  - `/unix` → Unix timestamp (seconds since epoch)
- **Change trigger prefix** — set any non-alphanumeric character as the expansion trigger
- **Dark/light mode** — toggle via the Settings (⚙) button in the sidebar
- **Global keyboard listener** — expansions work in any app, not just Macro Manager

### Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd/Ctrl+S | Save current macro |
| Cmd/Ctrl+N | New macro |

---

## Data storage

Macros are saved to a JSON file in the OS user data directory. The file persists across app updates and reinstalls.

| Platform | Path |
|----------|------|
| Mac      | `~/Library/Application Support/macro-manager/macros.json` |
| Windows  | `%APPDATA%\macro-manager\macros.json` |

The format is compatible with the original Python app's `snippets.json`. On first launch, if a `snippets.json` is found in the parent directory, it is automatically migrated.

```json
{
  "snippets": [
    { "title": "My Macro", "abbr": "mm", "content": "expanded text here" }
  ],
  "prefix": "/"
}
```

---

## Building for distribution

```bash
npm run build:mac   # produces a .dmg in dist/
npm run build:win   # produces a .exe installer in dist/
```

To include a custom app icon, add the following files before building:

- `build/icon.icns` — Mac (512×512 recommended)
- `build/icon.ico` — Windows (multi-size ICO)

If icon files are absent the build will succeed using the default Electron icon.

---

## Project structure

```
macro-manager/
├── main.js          # Electron main process — window, file I/O, keyboard listener
├── preload.js       # contextBridge IPC bridge between main and renderer
├── renderer/
│   ├── index.html   # App shell and UI structure
│   ├── style.css    # All styles, dark/light themes, platform overrides
│   └── app.js       # Renderer logic — macro CRUD, UI state, theme, settings
├── package.json     # Dependencies and electron-builder config
└── README.md
```

**Not committed to git:**
- `node_modules/` — install with `npm install`
- `macros.json` — lives in OS user data directory, not the project folder
