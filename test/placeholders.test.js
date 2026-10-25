const test = require('node:test');
const assert = require('node:assert');
const { expandTemplate, normalizeContent, resolveBuiltIn } = require('../lib/placeholders');

const now = new Date(2026, 9, 24, 14, 5, 9); // Sat Oct 24 2026 2:05:09 PM

test('plain text passes through untouched', () => {
  assert.deepStrictEqual(expandTemplate('Best,\nNate', { now }), { text: 'Best,\nNate', cursorBack: 0 });
});

test('dates, offsets and clipboard', () => {
  const { text } = expandTemplate('{date} → {date+7} / {date-1} [{clipboard}] {weekday}', { now, clipboard: 'X' });
  assert.strictEqual(text, '10/24/2026 → 10/31/2026 / 10/23/2026 [X] Saturday');
});

test('{cursor} reports how far to move back', () => {
  const r = expandTemplate('Hi {cursor}, thanks!', { now });
  assert.strictEqual(r.text, 'Hi , thanks!');
  assert.strictEqual(r.cursorBack, ', thanks!'.length);
});

test('unknown braces are left alone', () => {
  assert.strictEqual(expandTemplate('{name} {date}', { now }).text, '{name} 10/24/2026');
});

test('legacy HTML content is converted to text', () => {
  assert.strictEqual(normalizeContent('Hi<br>there &amp; you<div>x</div>'), 'Hi\nthere & you\nx');
  assert.strictEqual(normalizeContent('a < b'), 'a < b');
});

test('built-ins resolve', () => {
  assert.strictEqual(resolveBuiltIn('ts', now), 'October 24, 2026 2:05 PM');
  assert.strictEqual(resolveBuiltIn('nope', now), null);
});

test('{field:…} takes its answer; with none it is empty', () => {
  assert.strictEqual(expandTemplate('Hi {field:Resident  name}!', { now, values: { 'resident name': 'Jane' } }).text, 'Hi Jane!');
  assert.strictEqual(expandTemplate('Hi {field:Name}!', { now }).text, 'Hi !');
});
