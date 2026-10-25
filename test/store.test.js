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

test('recent uses are newest first, deduped, and capped', () => {
  const dir = tmp();
  const store = createStore(dir);
  store.saveMacros({ prefix: '/', snippets: [{ title: 'S', abbr: 'sig', content: 'x' }] });
  store.recordExpansion({ abbr: 'sig', chars: 1 });
  store.recordExpansion({ abbr: 'fu', chars: 1 });
  store.recordExpansion({ abbr: null, chars: 1 }); // built-ins aren't recents
  store.recordExpansion({ abbr: 'sig', chars: 1 });
  const recent = store.loadStats().recent;
  assert.deepStrictEqual(recent.map((r) => r.abbr), ['sig', 'fu']);
  assert.ok(recent[0].at >= recent[1].at && Number.isFinite(recent[0].at));
  for (let i = 0; i < 30; i++) store.recordExpansion({ abbr: `m${i}`, chars: 1 });
  const capped = store.loadStats().recent;
  assert.strictEqual(capped.length, 20);
  assert.strictEqual(capped[0].abbr, 'm29');
});

test('recents keep the stats and usage files readable by older versions', () => {
  const dir = tmp();
  const store = createStore(dir);
  store.recordExpansion({ abbr: 'sig', chars: 1 });
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(store.paths.usage, 'utf-8')), { sig: 1 });
  const onDisk = JSON.parse(fs.readFileSync(store.paths.stats, 'utf-8'));
  assert.strictEqual(onDisk.lifetime, 1);
  assert.strictEqual(onDisk.days[store.localDay()].macros.sig, 1);
  // A stats.json from before recents existed just starts an empty list.
  delete onDisk.recent;
  fs.writeFileSync(store.paths.stats, JSON.stringify(onDisk));
  store.recordExpansion({ abbr: 'fu', chars: 1 });
  assert.deepStrictEqual(store.loadStats().recent.map((r) => r.abbr), ['fu']);
});

test('renaming moves a recent and deleting forgets it', () => {
  const dir = tmp();
  const store = createStore(dir);
  store.recordExpansion({ abbr: 'sig', chars: 1 });
  store.recordExpansion({ abbr: 'fu', chars: 1 });
  store.recordExpansion({ abbr: 'addr', chars: 1 });
  store.renameUsage('fu', 'followup');
  assert.deepStrictEqual(store.loadStats().recent.map((r) => r.abbr), ['addr', 'followup', 'sig']);
  store.renameUsage('sig', 'addr'); // merging into a newer recent keeps one entry
  assert.deepStrictEqual(store.loadStats().recent.map((r) => r.abbr), ['addr', 'followup']);
  store.deleteUsage('followup');
  assert.deepStrictEqual(store.loadStats().recent.map((r) => r.abbr), ['addr']);
});

test('format and fields are kept, cleaned, or dropped', () => {
  const dir = tmp();
  const store = createStore(dir);
  const saved = store.saveMacros({ prefix: '/', snippets: [
    { title: 'Rich', abbr: 'r', content: '**hi** {field:Unit}', format: 'rich', fields: [{ label: 'Unit', choices: ['2A', ''] }] },
    { title: 'Odd', abbr: 'o', content: 'x', format: 'html', fields: [] },
  ] });
  assert.deepStrictEqual(saved.snippets[0], { title: 'Rich', abbr: 'r', content: '**hi** {field:Unit}', format: 'rich', fields: [{ label: 'Unit', choices: ['2A'] }] });
  assert.deepStrictEqual(saved.snippets[1], { title: 'Odd', abbr: 'o', content: 'x' });
});

test('fill-in answers are remembered in fields.json', () => {
  const dir = tmp();
  const store = createStore(dir);
  assert.deepStrictEqual(store.loadFieldMemory(), {});
  store.rememberFields([{ key: 'name', label: 'Name' }], { name: 'Jane' });
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'fields.json'), 'utf-8')), { name: ['Jane'] });
});
