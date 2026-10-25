// ---------------------------------------------------------------------------
// System-wide abbreviation expansion.
//
// Listens to every keystroke via uiohook-napi. When the user types
// <prefix><abbr> followed by Space / Enter / Tab, the typed text is erased
// with Backspace and the expansion is pasted through the clipboard (fast and
// layout-independent), after which the user's clipboard is put back.
// ---------------------------------------------------------------------------
const { clipboard } = require('electron');
const { uIOhook, UiohookKey } = require('uiohook-napi');
const { buildKeymap, KeyBuffer } = require('./keys');
const { expandTemplate, resolveBuiltIn } = require('./placeholders');

const IS_MAC = process.platform === 'darwin';
const PASTE_MODIFIER = IS_MAC ? UiohookKey.Meta : UiohookKey.Ctrl;

// Give the OS pasteboard a moment before Cmd/Ctrl+V, and the target app a
// moment to read it before we restore the user's clipboard. Windows apps
// (Outlook, Teams) are noticeably slower to consume a paste.
const PASTE_DELAY_MS   = 50;
const RESTORE_DELAY_MS = IS_MAC ? 400 : 650;

function snapshotClipboard() {
  const formats = clipboard.availableFormats();
  return {
    text:  clipboard.readText(),
    html:  formats.some((f) => f.includes('html')) ? clipboard.readHTML() : '',
    rtf:   formats.some((f) => f.includes('rtf'))  ? clipboard.readRTF()  : '',
    image: formats.some((f) => f.startsWith('image/')) ? clipboard.readImage() : null,
  };
}

function restoreClipboard(snap) {
  const data = {};
  if (snap.text) data.text = snap.text;
  if (snap.html) data.html = snap.html;
  if (snap.rtf)  data.rtf  = snap.rtf;
  if (snap.image && !snap.image.isEmpty()) data.image = snap.image;
  if (Object.keys(data).length) clipboard.write(data);
  else clipboard.clear();
}

// getMacros()       → { prefix, snippets }
// isPaused()        → boolean
// isAppFocused()    → true while one of our own windows has focus
// onExpanded({ abbr, chars }) → after each expansion; abbr is null for
//                               built-ins, chars is how many keystrokes it saved
function createExpander({ getMacros, isPaused, isAppFocused, onExpanded }) {
  const keymap = buildKeymap(UiohookKey);
  const buf = new KeyBuffer(keymap, () => getMacros().prefix || '/');
  let busy = false;

  // Erase `deleteCount` characters, paste `content`, park the caret at
  // {cursor}, then restore the clipboard. Returns once the paste is queued.
  function paste(content, deleteCount = 0) {
    busy = true;
    buf.reset();

    const prev = snapshotClipboard();
    const { text, cursorBack } = expandTemplate(content, { clipboard: prev.text });
    clipboard.writeText(text);

    setTimeout(() => {
      for (let i = 0; i < deleteCount; i++) uIOhook.keyTap(UiohookKey.Backspace);
      uIOhook.keyTap(UiohookKey.V, [PASTE_MODIFIER]);

      setTimeout(() => {
        for (let i = 0; i < cursorBack; i++) uIOhook.keyTap(UiohookKey.ArrowLeft);
      }, 40);

      setTimeout(() => {
        restoreClipboard(prev);
        busy = false;
      }, RESTORE_DELAY_MS + cursorBack * 4);
    }, PASTE_DELAY_MS);

    // Keystrokes saved: what got pasted minus what the user typed.
    return Array.from(text).length - deleteCount;
  }

  function tryExpand() {
    const abbr = buf.pendingAbbr();
    if (!abbr) return;
    // Everything typed + the trigger key that just fired.
    const deleteCount = buf.buffer.length + 1;
    const { snippets } = getMacros();

    // User macros win over built-ins.
    const match = snippets.find((s) => s.abbr && s.abbr.toLowerCase() === abbr);
    if (match) {
      if (!match.content || !match.content.trim()) return;
      const chars = paste(match.content, deleteCount);
      onExpanded({ abbr: match.abbr, chars });
      return;
    }

    const builtIn = resolveBuiltIn(abbr);
    if (builtIn !== null) onExpanded({ abbr: null, chars: paste(builtIn, deleteCount) });
  }

  uIOhook.on('keydown', (e) => {
    if (busy) return;
    // Don't expand while editing macros inside Macro Manager itself.
    if (isPaused() || isAppFocused()) { buf.reset(); return; }

    if (buf.onKeyDown(e.keycode, e) === 'trigger') {
      tryExpand();
      buf.reset();
    }
  });

  // A click moves the caret, so whatever was being typed is stale.
  uIOhook.on('mousedown', () => buf.reset());

  return {
    start: () => uIOhook.start(),
    stop:  () => uIOhook.stop(),
    paste,
  };
}

module.exports = { createExpander };
