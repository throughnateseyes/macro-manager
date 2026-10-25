// ---------------------------------------------------------------------------
// System-wide abbreviation expansion.
//
// Listens to every keystroke via uiohook-napi. When the user types
// <prefix><abbr> followed by Space / Enter / Tab, the typed text is erased
// with Backspace and the expansion is pasted through the clipboard (fast and
// layout-independent), after which the user's clipboard is put back.
//
// A macro with fill-in fields doesn't paste straight away: onNeedsFields opens
// the prompt, and the paste happens (erasing what was typed) once it's filled.
// ---------------------------------------------------------------------------
const { clipboard, ClipboardItem } = require('electron');
const { uIOhook, UiohookKey } = require('uiohook-napi');
const { buildKeymap, KeyBuffer } = require('./keys');
const { resolveBuiltIn } = require('./placeholders');
const { renderExpansion } = require('./format');
const { hasFields } = require('./fields');

const IS_MAC = process.platform === 'darwin';
const PASTE_MODIFIER = IS_MAC ? UiohookKey.Meta : UiohookKey.Ctrl;

// Give the OS pasteboard a moment before Cmd/Ctrl+V, and the target app a
// moment to read it before we restore the user's clipboard. Windows apps
// (Outlook, Teams) are noticeably slower to consume a paste.
const PASTE_DELAY_MS   = 50;
const RESTORE_DELAY_MS = IS_MAC ? 400 : 650;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Electron's clipboard is asynchronous (the W3C model) since Electron 44.
// read() lists every format on the clipboard; we copy each payload out right
// away (the items are live views of a clipboard we're about to overwrite) and
// later write them back as fresh ClipboardItems — text, rich text, images.
async function snapshotClipboard() {
  const saved = [];
  let text = '';
  try {
    for (const item of await clipboard.read()) {
      const payload = {};
      for (const type of item.types) {
        try { payload[type] = await item.getType(type); } catch { /* format went away */ }
      }
      if (Object.keys(payload).length) saved.push(payload);
    }
  } catch { /* empty or unreadable */ }
  try { text = await clipboard.readText(); } catch { /* no text */ }
  return { saved, text };
}

async function restoreClipboard(snap) {
  try {
    if (snap.saved.length) await clipboard.write(snap.saved.map((p) => new ClipboardItem(p)));
    else clipboard.clear();
  } catch (err) {
    // Some formats can't be written back; plain text is the one that matters.
    console.warn('[expander] clipboard restore fell back to text:', err.message);
    if (snap.text) await clipboard.writeText(snap.text).catch(() => {});
  }
}

// Put an expansion on the clipboard. A formatted macro goes on as ONE item
// with two flavours: rich-text apps (Outlook, Zendesk, Gmail, Word) take the
// HTML, plain ones (terminals, Excel, plain inputs) take the text.
async function writeExpansion({ text, html }) {
  if (html) await clipboard.write([new ClipboardItem({ 'text/plain': text, 'text/html': html })]);
  else await clipboard.writeText(text);
}

// getMacros()       → { prefix, snippets }
// isPaused()        → boolean
// isAppFocused()    → true while one of our own windows has focus
// onExpanded({ abbr, chars }) → after each expansion; abbr is null for
//                               built-ins, chars is how many keystrokes it saved
// onNeedsFields({ macro, deleteCount }) → a macro with fields was typed; ask
//                               for them, then call paste(…, deleteCount, …)
function createExpander({ getMacros, isPaused, isAppFocused, onExpanded, onNeedsFields }) {
  const keymap = buildKeymap(UiohookKey);
  const buf = new KeyBuffer(keymap, () => getMacros().prefix || '/');
  let busy = false;

  // Erase `deleteCount` characters, paste `content`, park the caret at
  // {cursor}, then restore the clipboard. Resolves with the keystrokes saved.
  // `format` and `values` (fill-in answers) come from the macro.
  async function paste(content, deleteCount = 0, { format, values } = {}) {
    busy = true;
    buf.reset();
    try {
      const prev = await snapshotClipboard();
      const { text, html, cursorBack } = renderExpansion(content, { format, values, clipboard: prev.text });
      await writeExpansion({ text, html });
      await sleep(PASTE_DELAY_MS);

      for (let i = 0; i < deleteCount; i++) uIOhook.keyTap(UiohookKey.Backspace);
      uIOhook.keyTap(UiohookKey.V, [PASTE_MODIFIER]);
      if (cursorBack) {
        await sleep(40);
        for (let i = 0; i < cursorBack; i++) uIOhook.keyTap(UiohookKey.ArrowLeft);
      }

      await sleep(RESTORE_DELAY_MS + cursorBack * 4);
      await restoreClipboard(prev);
      // Keystrokes saved: what got pasted minus what the user typed.
      return Array.from(text).length - deleteCount;
    } finally {
      busy = false;
    }
  }

  function tryExpand() {
    const abbr = buf.pendingAbbr();
    if (!abbr) return;
    // Everything typed + the trigger key that just fired.
    const deleteCount = buf.buffer.length + 1;
    const { snippets } = getMacros();

    // User macros win over built-ins.
    const match = snippets.find((s) => s.abbr && s.abbr.toLowerCase() === abbr);
    const content = match ? match.content : resolveBuiltIn(abbr);
    if (content === null || (match && !content.trim())) return;

    // Leave what was typed in place until the fields are filled in; Esc in
    // the prompt then leaves it alone entirely.
    if (match && onNeedsFields && hasFields(match)) {
      onNeedsFields({ macro: match, deleteCount });
      return;
    }

    paste(content, deleteCount, { format: match && match.format })
      .then((chars) => onExpanded({ abbr: match ? match.abbr : null, chars }))
      .catch((err) => console.error('[expander] expansion failed:', err));
  }

  // ⚠️ NOTHING MAY THROW OUT OF THIS HANDLER. uiohook-napi calls it from its
  // hook thread, and an exception escaping it is a fatal native error that
  // kills the whole app (v2.0.0 crashed on every expansion this way).
  uIOhook.on('keydown', (e) => {
    try {
      if (busy) return;
      // Don't expand while editing macros inside Macro Manager itself.
      if (isPaused() || isAppFocused()) { buf.reset(); return; }

      if (buf.onKeyDown(e.keycode, e) === 'trigger') {
        tryExpand();
        buf.reset();
      }
    } catch (err) {
      console.error('[expander] keydown handler error:', err);
      buf.reset();
    }
  });

  // A click moves the caret, so whatever was being typed is stale.
  uIOhook.on('mousedown', () => {
    try { buf.reset(); } catch { /* never throw from the hook thread */ }
  });

  return {
    start: () => uIOhook.start(),
    stop:  () => uIOhook.stop(),
    paste,
  };
}

module.exports = { createExpander, writeExpansion };
