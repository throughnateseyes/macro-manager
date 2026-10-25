<p align="center">
  <img src="build/icon.png" width="96" alt="Macro Manager icon" />
</p>

<h1 align="center">Macro Manager</h1>

<p align="center">
  Type a short abbreviation anywhere and it expands into your saved text, in every app, on Mac and Windows.<br/>
  Built for and used daily by my team at Brick + Timber.
</p>

<p align="center">
  <a href="https://github.com/throughnateseyes/macro-manager/releases/latest/download/Macro-Manager-Windows-Setup.exe"><b>Download for Windows</b></a> ·
  <a href="https://github.com/throughnateseyes/macro-manager/releases/latest/download/Macro-Manager-Mac-arm64.dmg"><b>Mac (Apple Silicon)</b></a> ·
  <a href="https://github.com/throughnateseyes/macro-manager/releases/latest/download/Macro-Manager-Mac-x64.dmg"><b>Mac (Intel)</b></a>
</p>

![Overview](docs/screenshots/overview-light.png)

## What it does

Type `/sig` then Space, and it becomes your full email signature. Type `/tour` and a tour confirmation appears with the date already filled in. It works in Outlook, Teams, Chrome, Slack, Excel: anywhere you can type.

| | |
|---|---|
| ![Editor](docs/screenshots/editor-light.png) | ![Quick Insert](docs/screenshots/quick-insert-dark.png) |
| **Notion-style editor** with autosave, folders, and live preview | **Quick Insert**: search every macro from any app and paste it |
| ![Settings on Windows](docs/screenshots/settings-windows.png) | ![Tray flyout](docs/screenshots/tray-flyout-windows.png) |
| **Native on Windows** with theme-matched title bar controls | **Tray flyout**: today's count, streak, and one-click copy |

### Features

- **System-wide expansion**: `prefix + abbreviation`, then Space, Tab, or Enter
- **Smart placeholders**: `{cursor}` `{clipboard}` `{date}` `{date+7}` `{time}` `{day}` `{weekday}` and more
- **Quick Insert**: `⌘⇧Space` on Mac, `Ctrl+Alt+Space` on Windows. One shortcut everywhere, including the search box inside the app, with Pinned and Recent at the top
- **Macros library**: every macro as a card, with what it types, how often it's used and when, grouped by Pinned, Recent and folder
- **Stats that make it a habit**: lifetime expansions, day streaks, milestones, an activity heatmap, and typing time saved
- **Pinned macros** in the tray or menu bar for one-click copy
- **Folders, search, and sorting**, all keyboard-driven
- **Safe by default**: atomic saves, 14 days of daily backups, and recovery from a corrupt file
- **Updates itself** on Windows. Mac shows a one-click download.
- **Light, dark, or system** theme, with native vibrancy on macOS

### Built-in date and time

| Type | Gets |
|---|---|
| `/ts` | October 24, 2026 2:30 PM |
| `/date` | 10/24/2026 |
| `/isodate` | 2026-10-24 |
| `/time` | 2:30 PM |
| `/time24` | 14:30:00 |
| `/day` | Saturday, October 24 |
| `/unix` | 1792880000 |

## Installing

### Windows

1. Download **[Macro-Manager-Windows-Setup.exe](https://github.com/throughnateseyes/macro-manager/releases/latest/download/Macro-Manager-Windows-Setup.exe)**.
2. If Windows says **"Windows protected your PC"**, click **More info → Run anyway**. The app isn't code-signed yet, so this appears once.
3. Follow the installer. Macro Manager starts in the **system tray** near the clock. Click the icon for quick access; right-click it for the menu.

Updates download in the background. When one is ready you'll see **Restart & Update**.

### Mac

1. Download the [Apple Silicon](https://github.com/throughnateseyes/macro-manager/releases/latest/download/Macro-Manager-Mac-arm64.dmg) or [Intel](https://github.com/throughnateseyes/macro-manager/releases/latest/download/Macro-Manager-Mac-x64.dmg) build. Not sure which you have? Apple menu → **About This Mac** → look for "Apple M…" or "Intel".
2. Open the DMG and drag **Macro Manager** into **Applications**.
3. On first launch, macOS will say it can't verify the developer. Open **System Settings → Privacy & Security**, scroll down, and click **Open Anyway**.
4. Allow **Accessibility** access when the app asks (**System Settings → Privacy & Security → Accessibility → Macro Manager**). macOS requires this before any app can type into other apps.

When an update is available, the app shows a **Download** button.

## Your data

Everything stays on your computer. Nothing is sent anywhere.

| | Location |
|---|---|
| Mac | `~/Library/Application Support/macro-manager/` |
| Windows | `%APPDATA%\macro-manager\` |

`macros.json` holds your macros, `stats.json` your history, and `backups/` daily copies. **Settings → Export** makes a file you can import on another computer.

## Development

```bash
npm install
npm start               # run the app (uses your real macros)
npm run start:clean     # run with a throwaway data folder
npm run preview         # UI in a browser with sample data → http://127.0.0.1:5180/dev/preview.html
npm test                # unit tests (keyboard buffer, placeholders, storage)
npm run build:all       # build Mac + Windows installers into release/
```

```
main.js            Electron main: windows, tray, shortcuts, updates, IPC
preload.js         The only bridge between UI and system (contextIsolation, sandbox)
lib/expander.js    Global keyboard hook → backspace → paste → restore clipboard
lib/keys.js        Keycode → character buffer (Shift-aware, unit-tested)
lib/placeholders.js  {date} / {cursor} / built-ins
lib/store.js       Atomic JSON storage, daily backups, stats history
renderer/          Main window + Quick Insert palette (vanilla JS, no framework)
```

Releasing is covered in **[docs/RELEASING.md](docs/RELEASING.md)**, and the v1 → v2 review in **[docs/AUDIT.md](docs/AUDIT.md)**.

Built with Electron and [uiohook-napi](https://github.com/SnosMe/uiohook-napi). MIT licensed.
