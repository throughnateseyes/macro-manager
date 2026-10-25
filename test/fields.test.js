const test = require('node:test');
const assert = require('node:assert');
const F = require('../lib/fields');

test('labels come from the text, in order, once each', () => {
  assert.deepStrictEqual(F.fieldLabels('{field:Name} {field:Unit} {field:name} {field:} {date}'), ['Name', 'Unit']);
});

test('fieldsFor merges stored settings and ignores unused ones', () => {
  const macro = {
    content: 'Hi {field:Name}, unit {field:unit}',
    fields: [{ label: 'Unit', choices: ['2A', '4B'] }, { label: 'Old', default: 'x' }],
  };
  assert.deepStrictEqual(F.fieldsFor(macro), [
    { label: 'Name', key: 'name' },
    { label: 'unit', choices: ['2A', '4B'], key: 'unit' },
  ]);
  assert.strictEqual(F.hasFields(macro), true);
  assert.strictEqual(F.hasFields({ content: 'plain {date}' }), false);
});

test('initial answers: default, or the default/first choice', () => {
  const fields = [
    { key: 'a', label: 'A', default: 'x' },
    { key: 'b', label: 'B', choices: ['1', '2'], default: '2' },
    { key: 'c', label: 'C', choices: ['1', '2'], default: 'nope' },
    { key: 'd', label: 'D' },
  ];
  assert.deepStrictEqual(F.initialValues(fields), { a: 'x', b: '2', c: '1', d: '' });
});

test('stored settings are cleaned', () => {
  assert.deepStrictEqual(F.normalizeFields([
    { label: '  Unit  ', choices: [' 2A ', '', '2A', 4, '4B'] },
    { label: 'unit', default: 'dupe' },
    { label: 'Bad {x}' },
    { label: 'Agent', default: '  Nate ', choices: [] },
    null,
  ]), [{ label: 'Unit', choices: ['2A', '4B'] }, { label: 'Agent', default: 'Nate' }]);
  assert.strictEqual(F.normalizeFields([]), undefined);
  assert.strictEqual(F.normalizeFields('nope'), undefined);
});

test('rename and remove change every token with that label', () => {
  assert.strictEqual(F.renameFieldInContent('{field:Name} and {field:name} {field:Unit}', 'NAME', 'Resident'), '{field:Resident} and {field:Resident} {field:Unit}');
  assert.strictEqual(F.removeFieldFromContent('Hi {field:Name}!', 'name'), 'Hi !');
});

test('answers are remembered newest first, five kept, pick-lists and defaults skipped', () => {
  const fields = [{ key: 'name', label: 'Name' }, { key: 'unit', label: 'Unit', choices: ['2A'] }, { key: 'agent', label: 'Agent', default: 'Nate' }];
  let mem = {};
  for (const n of ['A', 'B', 'C', 'D', 'E', 'F', 'B']) mem = F.rememberValues(mem, fields, { name: n, unit: '2A', agent: 'Nate' });
  assert.deepStrictEqual(mem, { name: ['B', 'F', 'E', 'D', 'C'] });
});

test('readable text for lists: fields in brackets, formatting marks dropped', () => {
  const rich = { format: 'rich', content: 'Hi {field:Name}, **unit 4B**\n- *Bring ID*\n- [Map](https://a.co)\n\\*' };
  assert.strictEqual(F.readableText(rich), 'Hi [Name], unit 4B\nBring ID\nMap\n*');
  assert.strictEqual(F.readableText({ content: '**literal** {field:Name}' }), '**literal** [Name]');
});
