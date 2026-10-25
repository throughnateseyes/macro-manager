const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createStore } = require('../lib/store');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mm-store-'));

test('reads data written by v1 and keeps its shape', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'macros.json'), JSON.stringify({ prefix: ';', snippets: [{ title: 'Sig', abbr: 'sig', content: 'Best<br>Nate' }] }));
  const store = createStore(dir);
  const m = store.loadMacros();
  assert.strictEqual(m.prefix, ';');
  assert.deepStrictEqual(m.snippets[0], { title: 'Sig', abbr: 'sig', content: 'Best\nNate' });
});

test('a corrupt file is kept and the latest backup restored', () => {
  const dir = tmp();
  const store = createStore(dir);
  store.saveMacros({ prefix: '/', snippets: [{ title: 'A', abbr: 'a', content: 'one' }] });
  store.saveMacros({ prefix: '/', snippets: [{ title: 'A', abbr: 'a', content: 'two' }] }); // backup holds "one"
  fs.writeFileSync(path.join(dir, 'macros.json'), '{ not json');
  const m = store.loadMacros();
  assert.strictEqual(m.snippets[0].content, 'one');
  assert.ok(fs.readdirSync(dir).some((f) => f.startsWith('macros.corrupt-')));
});

test('stats seed from existing usage and record new expansions', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'macros.json'), JSON.stringify({ prefix: '/', snippets: [{ title: 'Sig', abbr: 'sig', content: '0123456789' }] }));
  fs.writeFileSync(path.join(dir, 'usage.json'), JSON.stringify({ sig: 5 }));
  const store = createStore(dir);
  assert.strictEqual(store.loadStats().lifetime, 5);
  const { stats, usage } = store.recordExpansion({ abbr: 'sig', chars: 6 });
  assert.strictEqual(stats.lifetime, 6);
  assert.strictEqual(usage.sig, 6);
  assert.strictEqual(stats.days[store.localDay()].macros.sig, 1);
  store.recordExpansion({ abbr: null, chars: 3 }); // built-in
  assert.strictEqual(store.loadStats().lifetime, 7);
});

test('renaming an abbreviation carries its counts', () => {
  const dir = tmp();
  const store = createStore(dir);
  store.saveMacros({ prefix: '/', snippets: [{ title: 'S', abbr: 'sig', content: 'x' }] });
  store.recordExpansion({ abbr: 'sig', chars: 1 });
  store.renameUsage('sig', 'signature');
  assert.strictEqual(store.loadUsage().signature, 1);
  assert.strictEqual(store.loadStats().days[store.localDay()].macros.signature, 1);
});

test('import skips abbreviations that already exist', () => {
  const dir = tmp();
  const store = createStore(dir);
  store.saveMacros({ prefix: '/', snippets: [{ title: 'S', abbr: 'sig', content: 'x' }] });
  const r = store.mergeImport({ snippets: [{ title: 'S2', abbr: 'SIG', content: 'y' }, { title: 'F', abbr: 'fu', content: 'z' }] });
  assert.strictEqual(r.added, 1);
  assert.strictEqual(r.merged.snippets.length, 2);
});
