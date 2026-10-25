const test = require('node:test');
const assert = require('node:assert');
const { buildKeymap, KeyBuffer, abbrProblem } = require('../lib/keys');

// A tiny stand-in for uiohook's UiohookKey table.
const K = { Shift: 1, ShiftRight: 2, Alt: 3, AltRight: 4, Ctrl: 5, CtrlRight: 6, Meta: 7, MetaRight: 8, CapsLock: 9,
  Space: 10, Enter: 11, Tab: 12, Backspace: 13, Slash: 14, Semicolon: 15, Minus: 16, ArrowLeft: 17 };
'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach((c, i) => { K[c] = 100 + i; });
for (let i = 0; i <= 9; i++) K[String(i)] = 200 + i;

const type = (buf, text) => {
  for (const ch of text) {
    if (ch === '/') buf.onKeyDown(K.Slash);
    else if (ch === ':') buf.onKeyDown(K.Semicolon, { shiftKey: true });
    else if (ch === '_') buf.onKeyDown(K.Minus, { shiftKey: true });
    else if (/[A-Z]/.test(ch)) buf.onKeyDown(K[ch], { shiftKey: true });
    else if (/[0-9]/.test(ch)) buf.onKeyDown(K[ch]);
    else buf.onKeyDown(K[ch.toUpperCase()]);
  }
};

test('builds the abbreviation after the prefix', () => {
  const buf = new KeyBuffer(buildKeymap(K), () => '/');
  type(buf, 'hello/Sig');
  assert.strictEqual(buf.pendingAbbr(), 'sig');
  assert.strictEqual(buf.onKeyDown(K.Space), 'trigger');
});

test('backspace edits the buffer, arrows reset it', () => {
  const buf = new KeyBuffer(buildKeymap(K), () => '/');
  type(buf, '/sigx');
  buf.onKeyDown(K.Backspace);
  assert.strictEqual(buf.pendingAbbr(), 'sig');
  buf.onKeyDown(K.ArrowLeft);
  assert.strictEqual(buf.pendingAbbr(), '');
});

test('shifted symbols work as a prefix and inside abbreviations', () => {
  const buf = new KeyBuffer(buildKeymap(K), () => ':');
  type(buf, ':my_sig');
  assert.strictEqual(buf.pendingAbbr(), 'my_sig');
});

test('shortcuts like Ctrl+A clear the buffer', () => {
  const buf = new KeyBuffer(buildKeymap(K), () => '/');
  type(buf, '/sig');
  buf.onKeyDown(K.A, { ctrlKey: true });
  assert.strictEqual(buf.pendingAbbr(), '');
});

test('abbreviation validation', () => {
  assert.strictEqual(abbrProblem('sig', '/'), null);
  assert.match(abbrProblem('my sig', '/'), /spaces/);
  assert.match(abbrProblem('a/b', '/'), /prefix/);
  assert.match(abbrProblem('café', '/'), /can’t be typed/);
});
