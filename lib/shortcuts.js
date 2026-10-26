// ---------------------------------------------------------------------------
// Macro shortcuts: a key combination that pastes one macro, as well as (or
// instead of) its abbreviation. Stored as an Electron accelerator on the
// macro, e.g. { shortcut: "Control+Alt+T" }.
//
// Pure, like fields.js: the main process, the store and both windows share it.
// ---------------------------------------------------------------------------
const SHORTCUT_MODIFIERS = ['Command', 'Super', 'Control', 'Alt', 'Shift'];

// Modifiers in a fixed order and the key, or null when it isn't one.
function parseAccel(accel) {
  if (typeof accel !== 'string' || !accel.trim()) return null;
  const parts = accel.split('+').filter(Boolean);
  const key = parts.pop();
  if (!key || SHORTCUT_MODIFIERS.includes(key)) return null;
  const mods = SHORTCUT_MODIFIERS.filter((m) => parts.includes(m));
  if (mods.length !== parts.length) return null;
  return { mods, key };
}

// One spelling per combination, so "Alt+Control+T" and "Control+Alt+T" match.
function normalizeAccel(accel) {
  const p = parseAccel(accel);
  return p ? [...p.mods, p.key].join('+') : '';
}

const sameAccel = (a, b) => Boolean(a) && normalizeAccel(a).toLowerCase() === normalizeAccel(b).toLowerCase();

// Why a combination can't be a macro shortcut, or null. A shortcut takes its
// keys over in every app, so it needs two modifiers: Ctrl+B alone would stop
// Bold working in Word and Outlook. F-keys are rarely taken, so one will do.
function shortcutProblem(accel) {
  const p = parseAccel(accel);
  if (!p) return 'That shortcut isn’t supported.';
  const fKey = /^F\d{1,2}$/.test(p.key);
  const real = p.mods.filter((m) => m !== 'Shift').length;
  if (fKey ? p.mods.length < 1 : p.mods.length < 2 || real < 1) {
    return fKey
      ? 'Add Ctrl, Alt or Shift so the key still works on its own.'
      : 'Use two modifier keys, like Ctrl + Alt + a key, so it doesn’t replace a shortcut other apps use.';
  }
  return null;
}

// What usage and stats are counted under: the abbreviation, or for a macro
// that only has a shortcut, the shortcut. Changing either renames the counts.
function statKey(m) {
  if (!m) return '';
  if (m.abbr) return m.abbr;
  return m.shortcut ? `shortcut:${normalizeAccel(m.shortcut)}` : '';
}

if (typeof module === 'object') module.exports = { SHORTCUT_MODIFIERS, parseAccel, normalizeAccel, sameAccel, shortcutProblem, statKey };
