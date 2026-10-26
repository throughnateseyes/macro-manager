const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseAccel, normalizeAccel, sameAccel, shortcutProblem, statKey } = require('../lib/shortcuts');
const { createStore } = require('../lib/store');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mm-shortcuts-'));

test('accelerators parse into modifiers and a key, in one order', () => {
  assert.deepStrictEqual(parseAccel('Alt+Control+T'), { mods: ['Control', 'Alt'], key: 'T' });
  assert.strictEqual(normalizeAccel('Shift+Control+F5'), 'Control+Shift+F5');
  assert.strictEqual(parseAccel('Control+Alt'), null);   // no key
  assert.strictEqual(parseAccel('Hyper+T'), null);       // not a modifier
  assert.strictEqual(normalizeAccel(''), '');
  assert.ok(sameAccel('Alt+Control+T', 'Control+Alt+t'));
  assert.ok(!sameAccel('Control+Alt+T', 'Control+Shift+T'));
  assert.ok(!sameAccel('', ''));
});

test('a macro shortcut needs two modifiers, or one with an F-key', () => {
  assert.strictEqual(shortcutProblem('Control+Alt+T'), null);
  assert.strictEqual(shortcutProblem('Control+Shift+1'), null);
  assert.strictEqual(shortcutProblem('Command+Alt+T'), null);
  assert.strictEqual(shortcutProblem('Shift+F8'), null);
  assert.ok(shortcutProblem('Control+B'));        // would replace Bold everywhere
  assert.strictEqual(shortcutProblem('Shift+Alt+T'), null);
  assert.ok(shortcutProblem('F8'));
  assert.ok(shortcutProblem('nonsense'));
});

test('stats are counted under the abbreviation, else the shortcut', () => {
  assert.strictEqual(statKey({ abbr: 'tour', shortcut: 'Control+Alt+T' }), 'tour');
  assert.strictEqual(statKey({ abbr: '', shortcut: 'Alt+Control+T' }), 'shortcut:Control+Alt+T');
  assert.strictEqual(statKey({ abbr: '' }), '');
});

test('the store keeps a shortcut tidy and drops a blank one', () => {
  const store = createStore(tmp());
  const m = store.saveMacros({ prefix: '/', snippets: [
    { title: 'A', abbr: 'a', content: 'x', shortcut: 'Alt+Control+A' },
    { title: 'B', abbr: 'b', content: 'y', shortcut: '' },
  ] });
  assert.strictEqual(m.snippets[0].shortcut, 'Control+Alt+A');
  assert.ok(!('shortcut' in m.snippets[1]));
});

test('import keeps shortcut-only macros and never doubles a shortcut', () => {
  const store = createStore(tmp());
  store.saveMacros({ prefix: '/', snippets: [{ title: 'Tour', abbr: 'tour', content: 'x', shortcut: 'Control+Alt+T' }] });
  const r = store.mergeImport({ snippets: [
    { title: 'Zoom', abbr: '', content: 'z', shortcut: 'Control+Alt+Z' },     // added
    { title: 'Taken', abbr: 'tk', content: 't', shortcut: 'Alt+Control+T' },  // added, without the shortcut
    { title: 'Nothing', abbr: '', content: 'n', shortcut: 'Control+Alt+T' },  // nothing left to trigger it
  ] });
  assert.strictEqual(r.added, 2);
  const byTitle = Object.fromEntries(r.merged.snippets.map((s) => [s.title, s]));
  assert.strictEqual(byTitle.Zoom.shortcut, 'Control+Alt+Z');
  assert.ok(!('shortcut' in byTitle.Taken));
  assert.ok(!byTitle.Nothing);
});

test('usage moves with the stat key when a shortcut-only macro changes', () => {
  const store = createStore(tmp());
  store.recordExpansion({ abbr: 'shortcut:Control+Alt+Z', chars: 10 });
  const usage = store.renameUsage('shortcut:Control+Alt+Z', 'zoom');
  assert.strictEqual(usage.zoom, 1);
  assert.ok(!('shortcut:Control+Alt+Z' in usage));
  assert.strictEqual(store.loadStats().recent[0].abbr, 'zoom');
});
