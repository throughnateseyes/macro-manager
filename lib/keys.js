// ---------------------------------------------------------------------------
// Keystroke → abbreviation buffer.
//
// uiohook reports physical keycodes, not characters, so we rebuild what was
// typed ourselves (US layout). Kept free of native imports so it can be unit
// tested: pass in uiohook's UiohookKey table.
// ---------------------------------------------------------------------------

// Characters an abbreviation or prefix may contain (besides a–z / 0–9).
const PUNCTUATION = "/\\.,;='`[]-!@#$%^&*()_+{}|:\"<>?~";

function buildKeymap(K) {
  // code → [unshifted, shifted]
  const chars = new Map();
  for (const c of 'abcdefghijklmnopqrstuvwxyz') chars.set(K[c.toUpperCase()], [c, c]);

  const digitShift = ')!@#$%^&*(';
  for (let i = 0; i <= 9; i++) chars.set(K[String(i)], [String(i), digitShift[i]]);

  const punct = [
    ['Slash', '/', '?'],   ['Backslash', '\\', '|'], ['Period', '.', '>'],
    ['Comma', ',', '<'],   ['Semicolon', ';', ':'],  ['Equal', '=', '+'],
    ['Minus', '-', '_'],   ['Quote', "'", '"'],      ['Backquote', '`', '~'],
    ['BracketLeft', '[', '{'], ['BracketRight', ']', '}'],
  ];
  for (const [name, plain, shifted] of punct) {
    if (K[name] !== undefined) chars.set(K[name], [plain, shifted]);
  }

  // Numpad digits type the same characters regardless of Shift.
  for (let i = 0; i <= 9; i++) {
    const code = K[`Numpad${i}`];
    if (code !== undefined) chars.set(code, [String(i), String(i)]);
  }

  return {
    chars,
    modifiers: new Set([K.Shift, K.ShiftRight, K.Alt, K.AltRight, K.Ctrl, K.CtrlRight, K.Meta, K.MetaRight, K.CapsLock]),
    triggers:  new Set([K.Space, K.Enter, K.Tab, K.NumpadEnter].filter((c) => c !== undefined)),
    backspace: K.Backspace,
  };
}

// Tracks what's been typed since the last boundary.
//   onKeyDown(code, event) → 'trigger' when Space/Enter/Tab is pressed.
//   buffer is the text typed so far, e.g. "/sig".
// Modifier state comes from the event's own flags (shiftKey, ctrlKey…) so a
// missed key-up can never leave us stuck thinking Shift is held.
class KeyBuffer {
  constructor(keymap, getPrefix) {
    this.k = keymap;
    this.getPrefix = getPrefix;
    this.buffer = '';
  }

  reset() { this.buffer = ''; }

  onKeyDown(code, { shiftKey = false, ctrlKey = false, metaKey = false, altKey = false } = {}) {
    if (this.k.modifiers.has(code)) return null;

    // Ctrl/Cmd/Alt + key is a shortcut (copy, undo, select all…), not typing.
    if (ctrlKey || metaKey || altKey) { this.buffer = ''; return null; }

    if (this.k.triggers.has(code)) return 'trigger';

    if (code === this.k.backspace) {
      this.buffer = this.buffer.slice(0, -1);
      return null;
    }

    const pair = this.k.chars.get(code);
    if (!pair) {
      // Arrows, Escape, F-keys… the caret may have moved, so start over.
      this.buffer = '';
      return null;
    }

    const ch = pair[shiftKey ? 1 : 0];
    // Typing the prefix always starts a fresh abbreviation, so "hello/sig"
    // still expands /sig.
    if (ch === this.getPrefix()) this.buffer = ch;
    else this.buffer = (this.buffer + ch).slice(-64);
    return null;
  }

  // The abbreviation currently typed after the prefix, lower-cased, or ''.
  pendingAbbr() {
    const prefix = this.getPrefix();
    if (!this.buffer.startsWith(prefix)) return '';
    return this.buffer.slice(prefix.length).toLowerCase();
  }
}

// Validation shared with the renderer (duplicated there as plain JS).
function abbrProblem(abbr, prefix) {
  if (!abbr) return 'Add an abbreviation so this macro can expand.';
  if (/\s/.test(abbr)) return 'Abbreviations can’t contain spaces.';
  if (prefix && abbr.includes(prefix)) return `Abbreviations can’t contain the prefix “${prefix}”.`;
  for (const ch of abbr.toLowerCase()) {
    if (!/[a-z0-9]/.test(ch) && !PUNCTUATION.includes(ch)) return `“${ch}” can’t be typed as part of an abbreviation.`;
  }
  return null;
}

module.exports = { buildKeymap, KeyBuffer, abbrProblem, PUNCTUATION };
