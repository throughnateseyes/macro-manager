# Shipping updates

## How it works

```
 you: npm run release:patch
        │  bumps package.json 2.0.0 → 2.0.1, commits, tags v2.0.1, pushes
        ▼
 GitHub Actions (.github/workflows/release.yml)
        │  1. runs the tests
        │  2. creates a draft release "Macro Manager 2.0.1"
        │  3. builds the Windows installer (on Windows) and Mac DMGs (on macOS)
        │  4. launches each packaged app and types a test macro through it (smoke test)
        │  5. uploads the installers, then publishes the release
        ▼
 github.com/throughnateseyes/macro-manager/releases/latest
        │
        ├── Windows app: checks at launch and every 4 hours → downloads quietly →
        │                "Restart & Update" button (or installs the next time it quits)
        └── Mac app:     shows "Update available → Download"
```

You never build installers by hand. Building on your Mac produces the Windows installer in CI on a real Windows machine.

## Releasing a new version

From the project folder, on `main`, with everything committed:

```bash
npm run release:patch    # bug fixes        2.0.0 → 2.0.1
npm run release:minor    # new features     2.0.1 → 2.1.0
npm run release:major    # big changes      2.1.0 → 3.0.0
```

Then watch it under **GitHub → Actions → Build & Release** (about 4 minutes). If the smoke test fails on either platform, nothing is uploaded and nobody gets the build. When it's green, the release is live and installed copies will start updating within a few hours, or on their next launch.

To edit the release notes: **GitHub → Releases → the new version → Edit**. They're pre-filled from your commit messages.

### Trying a build without releasing it

**GitHub → Actions → Build & Release → Run workflow.** It builds both installers and attaches them to the run as downloadable artifacts, but publishes nothing. Locally, `npm run build:all` writes them to `release/`.

### If a release goes wrong

Publish a fixed version with a higher number (`npm run release:patch`). The updater only moves forward, so don't try to "un-release". If you need to stop people downloading a bad build right now, edit the release on GitHub and mark it as a **pre-release**: the updater ignores pre-releases.

## Mac: re-allow Accessibility after each update

The Mac build is ad-hoc signed, so macOS treats every new version as a new app and the Accessibility switch stops applying. After updating: **System Settings → Privacy & Security → Accessibility**, select Macro Manager, click **−**, then use the app's **Open System Settings** banner and turn the new entry on. Windows has no equivalent step.

## Getting your coworker onto v2

He's on **v1.0.4**. That version already contains the auto-updater, but it never found anything, because v1.0.4 was published without the `latest.yml` file the updater reads, and v1.0.5 was stuck as a draft. Once v2.0.0 is published by the workflow:

1. **He doesn't need to do anything.** Within a few hours, or the next time he opens the app, v1.0.4 downloads the latest v2 release in the background and shows **"Update Ready → Restart Now"**. If he clicks Later, it installs the next time the app quits.
2. **His macros, prefix, and usage counts carry over.** v2 reads the same `%APPDATA%\macro-manager\macros.json`, and his v1 usage counts are added to his lifetime total.
3. **If he wants it immediately**, send him the direct link below. The installer upgrades in place (same app ID), with no uninstall needed.
4. **Belt and braces:** before the update, have him use **Settings (gear) → Export macros** in v1. v2 also keeps daily backups from then on.

What's different for him:

- The **"show window" shortcut is now `Ctrl+Alt+M`.** The old `Ctrl+Shift+M` also muted Microsoft Teams. Change it in Settings if he prefers.
- **Clicking the tray icon** opens a quick-access panel. Double-click opens the full app; right-click shows the menu.
- **Launch at login** is switched on once, so macros work after a reboot. Off switch: Settings.

## Download links (always the latest version)

These never change, so they're safe to put on your portfolio or in Slack:

| | |
|---|---|
| Windows | `https://github.com/throughnateseyes/macro-manager/releases/latest/download/Macro-Manager-Windows-Setup.exe` |
| Mac (Apple Silicon) | `https://github.com/throughnateseyes/macro-manager/releases/latest/download/Macro-Manager-Mac-arm64.dmg` |
| Mac (Intel) | `https://github.com/throughnateseyes/macro-manager/releases/latest/download/Macro-Manager-Mac-x64.dmg` |
| Release page | `https://github.com/throughnateseyes/macro-manager/releases/latest` |

## The two warnings users see, and how to remove them

| Warning | Why | Fix | Cost |
|---|---|---|---|
| Windows: "Windows protected your PC" | The installer isn't code-signed | [Azure Trusted Signing](https://learn.microsoft.com/azure/trusted-signing/), then add the secrets to CI | ~$10/month |
| Mac: "Apple could not verify…" | No Apple Developer ID | [Apple Developer Program](https://developer.apple.com/programs/), then set `mac.identity` and notarize in CI | $99/year |

The Developer ID also turns on **automatic updates for Mac** (Apple requires signed apps for that). Until then, Mac users click **Download** in the app.

## Team stats (next)

Everything today is per-computer. A team total ("Brick + Timber has saved 331 hours") needs one shared place to add up counts. Local-first stays the rule: the app works fully offline and only sends **numbers**, never macro text or anything you type.

1. **Settings → Team**: paste a team code (opt-in, off by default).
2. The app queues `{ day, expansions, charsSaved, topAbbreviations }` locally and sends it once an hour when online. If it's offline, the queue waits.
3. A small serverless endpoint (Vercel function + a Postgres or KV store) adds it up per team.
4. A **Team** page in the app, plus a public read-only page for your portfolio, shows the team total, weekly leaders, team milestones, and the most-used shared macros.
5. Later: **shared macro folders**, so a team lead publishes "Leasing replies" once and everyone gets them.
