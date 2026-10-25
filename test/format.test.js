const test = require('node:test');
const assert = require('node:assert');
const { renderExpansion } = require('../lib/format');

const now = new Date(2026, 9, 24, 14, 5, 9); // Sat Oct 24 2026 2:05:09 PM
const rich = (content, opts = {}) => renderExpansion(content, { format: 'rich', now, ...opts });

test('plain macros paste text only, exactly as before', () => {
  const r = renderExpansion('Hi **there** {date}', { now });
  assert.deepStrictEqual(r, { text: 'Hi **there** 10/24/2026', html: null, cursorBack: 0 });
});

test('bold, italic and links: HTML for rich apps, clean text for the rest', () => {
  const r = rich('**Bold** and *italic* and [the map](https://example.com/map)');
  assert.strictEqual(r.html, '<strong>Bold</strong> and <em>italic</em> and <a href="https://example.com/map">the map</a>');
  assert.strictEqual(r.text, 'Bold and italic and the map (https://example.com/map)');
});

test('a link whose text is its address is written once', () => {
  assert.strictEqual(rich('[https://a.co](https://a.co)').text, 'https://a.co');
  assert.strictEqual(rich('[me@a.co](mailto:me@a.co)').text, 'me@a.co');
});

test('only web, email and phone links become links', () => {
  const r = rich('[x](javascript:alert(1)) [y](file:///etc)');
  assert.ok(!r.html.includes('<a'));
  assert.strictEqual(r.text, '[x](javascript:alert(1)) [y](file:///etc)');
});

test('the HTML names no font, class or colour', () => {
  const { html } = rich('**a**\n- b\n1. c');
  assert.ok(!/font|class=|color/i.test(html), html);
});

test('lines join with <br>; lists are the only blocks', () => {
  const r = rich('Hi,\n\nThings:\n- one\n- two\n\nThanks');
  assert.strictEqual(r.html, 'Hi,<br><br>Things:<ul style="margin-top:0;margin-bottom:0"><li>one</li><li>two</li></ul><br>Thanks');
  assert.strictEqual(r.text, 'Hi,\n\nThings:\n- one\n- two\n\nThanks');
});

test('a blank line before a list survives', () => {
  assert.strictEqual(rich('Intro\n\n- a').html, 'Intro<br><br><ul style="margin-top:0;margin-bottom:0"><li>a</li></ul>');
});

test('numbered lists keep their starting number in both flavours', () => {
  const r = rich('3. c\n4. d');
  assert.ok(r.html.startsWith('<ol style="margin-top:0;margin-bottom:0" start="3"><li>c</li>'));
  assert.strictEqual(r.text, '3. c\n4. d');
});

test('placeholder values are escaped and never become formatting', () => {
  const r = rich('**{clipboard}** {field:Name}', { clipboard: '*x* <script>a & b</script>', values: { name: '[a](https://evil.example) <b>' } });
  assert.strictEqual(r.html, '<strong>*x* &lt;script&gt;a &amp; b&lt;/script&gt;</strong> [a](https://evil.example) &lt;b&gt;');
  assert.strictEqual(r.text, '*x* <script>a & b</script> [a](https://evil.example) <b>');
});

test('a multi-line clipboard keeps its line breaks in HTML', () => {
  assert.strictEqual(rich('{clipboard}', { clipboard: 'a\nb' }).html, 'a<br>b');
});

test('escaped markers stay literal', () => {
  const r = rich('\\*not italic\\* 2 * 3 * 4');
  assert.strictEqual(r.text, '*not italic* 2 * 3 * 4');
  assert.ok(!r.html.includes('<em>'));
});

test('runs of spaces survive in HTML', () => {
  assert.strictEqual(rich('a   b').html, 'a &nbsp; b');
});

test('{cursor} counts what the rich app shows', () => {
  // "there" + break + "one" + break + "two": list markers aren't characters there.
  assert.strictEqual(rich('Hi {cursor}there\n- one\n- two').cursorBack, 13);
  assert.strictEqual(rich('Dear {cursor}, **thanks**').cursorBack, ', thanks'.length);
  assert.strictEqual(rich('[Map{cursor}](https://a.co) end').cursorBack, ' end'.length);
  assert.strictEqual(rich('**a** b').cursorBack, 0);
});

test('fields fill in by label, case-insensitively, everywhere they appear', () => {
  const r = rich('{field:Resident Name} / {field:resident name}', { values: { 'resident name': 'Jane' } });
  assert.strictEqual(r.text, 'Jane / Jane');
  assert.strictEqual(renderExpansion('Hi {field:Name}', { now, values: { name: 'Jo' } }).text, 'Hi Jo');
});

test('previews show fields as chips and the cursor as a caret', () => {
  const r = renderExpansion('Hi {field:Name}{cursor}!', { now, chips: true, caret: true });
  assert.strictEqual(r.html, 'Hi <span class="field-chip" data-field="Name">Name</span><span class="caret"></span>!');
  const filled = rich('{field:Name}', { chips: true, values: { name: 'Jo' } });
  assert.strictEqual(filled.html, '<span class="field-chip filled" data-field="Name">Jo</span>');
});
