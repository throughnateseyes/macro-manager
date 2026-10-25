# Macro Manager audit (v1.0.5 → v2.0.0)

October 2026. This covers everything found in the v1 code, release setup, and UI, plus what v2 did about each item. Severity: **High** = data loss, broken updates, or macros misfiring. **Med** = confusing or fragile. **Low** = polish.

## 1. Shipping and updates

| # | Finding | Sev | v2 |
|---|---|---|---|
| 1.1 | **v1.0.5 was never published.** CI uploaded it to a *draft* release, and the auto-updater can't see drafts. Everyone stayed on v1.0.4. | High | CI now creates one draft, uploads both installers, then publishes it in a final step. |
| 1.2 | **v1.0.4 had no `latest.yml`**, so every installed v1.0.4 checked for updates and silently failed. | High | Each release now carries `latest.yml` / `latest-mac.yml`. v1.0.4 will find v2.0.0 on its own. |
| 1.3 | The Mac and Windows CI jobs could race and create two releases for one tag. | Med | A `draft` job creates the release first; the build jobs only upload to it. |
| 1.4 | Mac builds were unsigned. On Apple Silicon that shows **"Macro Manager is damaged"**, and Squirrel.Mac refuses unsigned updates. | High | The build is ad-hoc signed, so Macs show the normal "unidentified developer" prompt instead of "damaged". The app shows Mac users a **Download** button for updates. Real Mac auto-updates need an Apple Developer ID ($99/yr). See RELEASING.md. |
| 1.5 | Electron 33 had reached end of life and was no longer getting security fixes. | Med | Electron 44, electron-builder 26, electron-updater 6.8. |
| 1.6 | CI recompiled the native keyboard module, which needed a pinned Python 3.11. | Low | `npmRebuild: false` uses the module's prebuilt binaries for all platforms, so no Python pin is needed. |
| 1.7 | Installer file names changed every version, so there was no stable "download latest" link. | Med | Stable names: `Macro-Manager-Windows-Setup.exe`, `Macro-Manager-Mac-arm64.dmg`, `Macro-Manager-Mac-x64.dmg`. |
| 1.8 | Nothing stopped a tag from not matching `package.json`. | Low | CI fails if they differ. `npm run release:patch` bumps, tags, and pushes in one step. |

## 2. Expansion engine

| # | Finding | Sev | v2 |
|---|---|---|---|
| 2.1 | **No single-instance lock.** Opening the app again from the Start menu started a second copy, so every macro expanded twice. | High | `requestSingleInstanceLock`. A second launch just shows the window. |
| 2.2 | Shift wasn't tracked. A prefix like `!` or `:`, or an abbreviation with `_`, could be saved but never matched. | High | Shift-aware key map, using the event's own modifier flags so a missed key-up can't leave it stuck. |
| 2.3 | Ctrl/Cmd shortcuts (copy, undo, select-all) were treated as typing. | Med | Any modifier combination resets the buffer. |
| 2.4 | Restoring the clipboard after an expansion threw away images and rich text. | Med | Text, HTML, RTF, and images are snapshotted and restored. |
| 2.5 | Macros expanded inside Macro Manager's own editor. | Med | Expansion is skipped while one of the app's windows has focus. |
| 2.6 | On macOS, if Accessibility was granted after launch, expansion stayed off until a restart, with no on-screen explanation. | High | The app retries every 3 seconds, shows a permission banner, and has an "Open System Settings" button. |
| 2.7 | The window shortcut `Ctrl+Shift+M` collides with **Microsoft Teams mute** on Windows. | Med | Default is now `Ctrl+Alt+M`. Both shortcuts can be changed in Settings, and conflicts are reported. |
| 2.8 | Windows restored the clipboard too quickly for Outlook and Teams, so a slow app sometimes pasted the old clipboard. | Med | Restore delay is 650 ms on Windows. |

## 3. Data safety

| # | Finding | Sev | v2 |
|---|---|---|---|
| 3.1 | **A corrupt `macros.json` was silently replaced with an empty one**, wiping every macro. | High | The corrupt file is kept and the newest daily backup is restored. |
| 3.2 | Writes weren't atomic, so a crash mid-save could corrupt the file. | High | Writes go to a temp file, then rename. |
| 3.3 | No backups. | High | One snapshot per day, 14 days kept, in `backups/`. |
| 3.4 | The save IPC accepted any shape from the renderer. | Med | `normalizeMacros` validates every write. |
| 3.5 | Renaming an abbreviation orphaned its usage count. | Low | Counts and history move with the rename. |
| 3.6 | "New Macro" left blank, untitled rows behind. | Low | Untouched drafts are discarded when you navigate away. |

**Compatibility:** v2 reads and writes the same `macros.json` shape (`{ prefix, snippets: [{ title, abbr, content }] }`) in the same folder. It only adds optional `folder` and `pinned` fields. Existing macros, prefix, and usage counts carry over untouched.

## 4. UX and functionality

| # | Finding | Sev | v2 |
|---|---|---|---|
| 4.1 | Edits were lost unless you clicked **Save**. There was no unsaved-changes warning. | High | Autosave with a "Saved" indicator. |
| 4.2 | The Bold/Italic/Underline buttons did nothing: content was saved as plain text. | Med | Removed. Replaced with an **Insert** menu for placeholders. |
| 4.3 | The Copy button crashed on click (it referenced a missing element). | Med | Fixed. Copy now copies the filled-in expansion. |
| 4.4 | Duplicate or invalid abbreviations were accepted with no warning. | Med | Inline warnings, plus a dot on the macro in the sidebar. |
| 4.5 | You couldn't search a macro by name from another app. | Med | **Quick Insert** (`⌘⇧Space` / `Ctrl+Alt+Space`) searches all macros and pastes the one you pick. |
| 4.6 | No organisation for long lists. | Med | Folders, three sort orders, keyboard navigation (`↑` `↓`, `⌘F`, `⌘N`, `⌘D`). |
| 4.7 | Static content only. | Med | Placeholders: `{cursor}` `{clipboard}` `{date}` `{date+7}` `{time}` `{day}` and more. |
| 4.8 | Launch at login was off by default, so macros stopped working after a reboot. | Med | Turned on once on first run, starting quietly in the tray. |
| 4.9 | "Your name" setting stored a value nothing used. | Low | Removed. |
| 4.10 | Windows showed a tray balloon every time the window closed. | Low | Shown once. |
| 4.11 | No Pause option. | Low | Pause/Resume in the sidebar, Settings, and tray. |

## 5. Design

| # | Finding | v2 |
|---|---|---|
| 5.1 | Fonts loaded from Google, so text fell back to a default font offline. | System fonts: SF Pro on Mac, Segoe UI Variable on Windows. |
| 5.2 | Dark theme only by default; no "follow system" option. | Follows the OS, with a System / Light / Dark switch. |
| 5.3 | No app icon (it used the default Electron logo) and a blurry 16px tray glyph. | New icon set, a template menu-bar icon on Mac, and a colour tray icon on Windows. |
| 5.4 | The Windows title bar showed an empty File/Edit/View menu. | Frameless with native window controls and theme-matched colours. |
| 5.5 | Tooltips that followed the cursor were noisy. | A content preview line under each macro. |
| 5.6 | Heavy indigo accent and mixed spacing. | Apple-style neutrals, system blue accent, an 8px grid, Notion-style editor properties, and macOS sidebar vibrancy. |

## 6. Gamification and stats (new in v2)

- Lifetime expansions, today's count, day streak (with best streak), and typing time saved, measured from the characters actually saved.
- Milestones (10 → 1M) with a progress bar and earned badges.
- An 8-month activity heatmap.
- Most used for 7 days, 30 days, or all time.
- Per-macro "this week" count and a 30-day sparkline.
- Everything is local (`stats.json`). Earlier usage counts are carried into the lifetime total.

## 7. Post-release fix (v2.0.1)

v2.0.0 crashed on every expansion. Electron 44 replaced the synchronous clipboard API with the asynchronous W3C one, so the clipboard snapshot called a function that no longer existed. It threw inside uiohook's keydown callback, and uiohook-napi treats an uncaught JavaScript exception there as a fatal native error. The CI smoke test only checked that the app launched, so it passed.

2.0.1 rewrites the clipboard code for the async API, catches everything inside the hook handlers, and extends the smoke test: CI now types `/smoke` + Space through the real handler on Windows and macOS, and refuses to publish unless the expansion is recorded and the clipboard comes back unchanged. No Windows user received 2.0.0.

## 8. Right-click audit (2.1)

Before 2.1, right-click did nothing anywhere. Electron ships no context menu, so even a text field had no Cut, Copy, Paste or spelling suggestions. On Windows that's the first thing people try. 2.1 adds native menus everywhere one helps:

| Where | Menu |
|---|---|
| Any text field | Spelling suggestions and Add to Dictionary, Cut, Copy, Paste, Select All |
| The macro body | The above, plus **Insert Placeholder ▸** |
| A macro: sidebar row, Macros-page card, Most used row | Open, Copy Text, Pin/Unpin, Duplicate, **Move to Folder ▸** (existing folders, New Folder…, Remove from Folder), Delete |
| A folder header | New Macro in this folder, Rename Folder…, Remove Folder (keeps the macros, with Undo), Collapse All / Expand All |
| The Pinned header | Unpin All, Collapse All / Expand All |
| Empty space in the sidebar list | New Macro, Collapse All / Expand All |
| A Date & Time row | Copy Value, Copy the abbreviation |
| A Quick Insert result | Insert (or Copy / Open, depending on where it was opened), Copy, Edit, Pin/Unpin |

Every macro command runs through one set of functions (`renderer/actions.js`), so Pin or Delete behaves the same wherever it's used. Delete is immediate, with an 8-second **Undo** toast (or ⌘Z / Ctrl+Z) instead of a confirmation dialog.

## 9. Notes on support-style users

Things noticed while building 2.x for people who answer the same questions all day:

- **Enter sends messages in chat apps.** In Teams or Slack, ending an abbreviation with Enter sends the abbreviation before Macro Manager can replace it. Teach Space or Tab, or add an "expand immediately" option for chat.
- **Programs run as administrator are out of reach.** Windows doesn't let a normal app type into an elevated one. Worth a line in the README if someone's property-management software runs that way.
- **Remote desktop and Citrix** sessions often don't receive pasted keystrokes the way local apps do. That needs testing before telling a team it works there.
- **Most replies are the same message with one or two details changed** (a name, a unit, a date). Fill-in fields and pick-lists would let one macro replace a folder of near-duplicates.
- **Macros contain personal details** (addresses, phone numbers, signatures). Keeping everything on the device is a feature worth stating plainly, especially once it's open source.
- **People switch from TextExpander.** An importer for its CSV export would make switching a one-click move.

## 10. Adding to the total (2.2)

Until 2.2 every count was per-computer, so there was no way to say how much typing Macro Manager has saved everyone. 2.2 adds one setting, **Settings → Your data → Add to the total**, on by default.

| What | How |
|---|---|
| What's sent | `{ id, token, seq, expansions, chars, v }`: a random install ID, a server-issued token, a sequence number, how much `stats.json` grew since the last accepted report, and the app version. The first report also carries everything from before 2.2 (`backfill`). No macro text, abbreviations, days, platform or anything typed. The planned `topAbbreviations` was dropped: an abbreviation name can be personal. |
| Consent | On by default, but nothing is sent until the sidebar notice is answered (**OK** or **Turn Off**). Someone who only ever runs it from the tray never sends anything. |
| Offline | No queue. `report.json` keeps how much the server already has, so the next report is just a bigger difference. A batch is resent unchanged, with the same sequence number, until the server answers, and the server drops a sequence number it has seen, so a lost reply can't count twice. |
| Where it goes | `POST https://www.throughnateseyes.com/api/macro-manager/stats` (code in the portfolio repo, `lib/macroStats.ts`). Upstash Redis adds it up per install and overall. |
| Abuse | The app is open source, so a key inside it would be public. The secret stays on the server instead: an install registers once and gets a token signed with it, registration is limited per IP, each report is capped (2,000 expansions, 5,000 characters each), and each install may report 6 times an hour. Every install keeps its own total on the server, so one bad actor can be subtracted. A larger backlog goes out in pieces a few minutes apart. |
| Turning it off | Stops sending at once. Turning it back on starts from that moment, so use while it was off is never sent. |
| Development | Only a packaged app reports. `npm start` and the CI smoke test never do; `MM_STATS_URL` points a dev build at a local server to test it. |

## 11. Still open

- **Apple Developer ID**: needed for Mac auto-updates and to remove the first-launch prompt. The Accessibility half of this is solved: since 2.0.2, Mac builds are signed with one self-signed certificate, so macOS keeps the permission across updates (ad-hoc builds were identified by their hash and lost it every time).
- **Windows code signing**: removes the SmartScreen "unknown publisher" prompt. Azure Trusted Signing costs about $10/mo.
- **Team stats**: the backend now exists (section 10), but it only knows everyone's total. Per-team totals need a team code. See [RELEASING.md](RELEASING.md#team-stats-next).
- **Non-US keyboard layouts**: abbreviations assume US key positions for symbols.
- **Fill-in fields** (prompt for a name when expanding): a common request in paid expanders.
