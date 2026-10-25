# 2.2 hand test

A test build, not a release: nothing updates by itself and nobody else gets it. Installing it over 2.1 keeps your macros.

**Install.** Sign in to GitHub, open the [run's artifacts](https://github.com/throughnateseyes/macro-manager/actions/runs/40246018880#artifacts), and download **installers-Windows** or **installers-macOS**. Each downloads as a zip; unzip it first.
- **Windows:** run `Macro-Manager-Windows-Setup.exe`. It isn't signed, so Windows says "Windows protected your PC": click **More info → Run anyway**.
- **Mac:** open `Macro-Manager-Mac-arm64.dmg` (Apple Silicon) or `Macro-Manager-Mac-x64.dmg` (Intel) and drag the app to Applications, replacing 2.1. On first launch macOS says it can't verify the developer: open **System Settings → Privacy & Security**, scroll down, click **Open Anyway**. If expansion doesn't work, check **Privacy & Security → Accessibility → Macro Manager** is on.

**Set up once.** In Macro Manager, make a macro with the abbreviation `tourtest`, set **Format** to **Formatted**, and paste this in as its text:

```
Hi {field:Resident name},

Your tour of **unit {field:Unit}** is on {date+2}. *Bring a photo ID.*

- Street parking is free after 6 pm
- [Directions](https://example.com/map)

Thanks!
```

Then click the blue **Unit** chip in Preview, choose **From a list**, and enter `2A`, `4B`, `7C`.

**In each app below:** type `/tourtest` then Space, fill in a name, pick a unit, press Enter.
It should paste with **unit 4B** in bold, the sentence after it in italics, two bullets, a clickable "Directions" link and the blank lines, in that app's own font, with nothing extra at the start or end.

| | Where | What to check | ✓ / ✗ |
|---|---|---|---|
| 1 | **Outlook, Windows, classic** (new email) | Formatted as above. No big gaps between lines. | |
| 2 | **Outlook, Windows, new** | Same | |
| 3 | **Zendesk agent composer** (public reply) | Same | |
| 4 | **Teams** (a chat with yourself) | Same. End the abbreviation with **Space**, not Enter: Enter sends. | |
| 5 | **Gmail** (new message) | Same | |
| 6 | **A terminal** (Windows Terminal or Mac Terminal; don't press Enter after) | Plain text only: no `**`, bullets as `- `, the link as `Directions (https://example.com/map)` | |
| 7 | **Real Windows PC, from another app**: type `/tourtest` + Space in Notepad | The prompt comes up **in front**, already typing into the first box (no click needed). After Enter, the text lands where you were typing and `/tourtest` is gone. | |
| 8 | Same, but press **Esc** in the prompt | The prompt closes and `/tourtest ` is left as you typed it | |
| 9 | **Any plain macro you already use** (e.g. `/sig`) | Expands straight away, no prompt, exactly as in 2.1 | |

**If something's off:** a screenshot of what pasted, plus which app and which version (classic or new Outlook), is all that's needed.
