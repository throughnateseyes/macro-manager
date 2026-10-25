// ---------------------------------------------------------------------------
// One renderer for every expansion: plain text, and HTML for formatted macros.
//
// Formatted macros (`format: "rich"`) are written in a small Markdown subset:
// **bold**, *italic*, [text](url), "- " and "1. " lists, blank lines. The
// source is parsed first and {placeholders} are resolved inside the parsed
// structure, so nothing a placeholder inserts (your clipboard, a resident's
// name) can turn into formatting or markup. See docs/MACRO-FORMAT.md.
//
// Pure — no Electron — so the main process, the renderer's previews and the
// tests all use the same code.
// ---------------------------------------------------------------------------
// dev/ previews load the lib files as plain <script>s, where placeholders.js's
// names are already globals.
const P = typeof require === 'function'
  ? require('./placeholders')
  : { TOKEN_RE, resolveToken, expandTemplate, normalizeContent };

const LINK_RE = /^(https?:\/\/|mailto:|tel:)\S+$/i;
const ESCAPABLE = '\\*[]()-_#.`';
// Marks {cursor} while rendering. Never in real text: stripped from input.
const CURSOR = '';

const escHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Escaped text as rich apps should show it: line breaks kept, and runs of
// spaces kept (HTML would collapse them).
const textHtml = (s) => escHtml(s).replace(/\n/g, '<br>').replace(/ {2}/g, ' &nbsp;');

// ---- Parsing -----------------------------------------------------------------
// Inline nodes: { t: 'text', v } | { t: 'tok', name } | { t: 'b' | 'i', c: [] }
//             | { t: 'a', href, c: [] }

function tokenAt(src, i) {
  if (src[i] !== '{') return null;
  const re = new RegExp(P.TOKEN_RE.source, 'y');
  re.lastIndex = i;
  return re.exec(src);
}

// Index of the next `marker` at or after `from` that closes a span, skipping
// escapes and {tokens} (a field label may contain *). -1 if none.
function findClose(src, from, marker) {
  for (let j = from; j < src.length; j++) {
    if (src[j] === '\\') { j++; continue; }
    const tok = tokenAt(src, j);
    if (tok) { j += tok[0].length - 1; continue; }
    if (marker === '*') {
      // A single * closes italics; ** inside is bold, so step over it.
      if (src.startsWith('**', j)) { j++; continue; }
      if (src[j] === '*' && src[j - 1] !== ' ') return j;
    } else if (src.startsWith(marker, j) && (marker !== '**' || src[j - 1] !== ' ')) {
      return j;
    }
  }
  return -1;
}

function parseInline(src) {
  const out = [];
  let buf = '';
  const flush = () => { if (buf) { out.push({ t: 'text', v: buf }); buf = ''; } };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\' && ESCAPABLE.includes(src[i + 1] || '')) { buf += src[i + 1]; i += 2; continue; }

    const tok = tokenAt(src, i);
    if (tok) { flush(); out.push({ t: 'tok', name: tok[1] }); i += tok[0].length; continue; }

    if (src.startsWith('**', i) && src[i + 2] && src[i + 2] !== ' ') {
      const end = findClose(src, i + 3, '**');
      if (end !== -1) { flush(); out.push({ t: 'b', c: parseInline(src.slice(i + 2, end)) }); i = end + 2; continue; }
    } else if (c === '*' && src[i + 1] && src[i + 1] !== ' ' && src[i + 1] !== '*') {
      const end = findClose(src, i + 2, '*');
      if (end !== -1) { flush(); out.push({ t: 'i', c: parseInline(src.slice(i + 1, end)) }); i = end + 1; continue; }
    }

    if (c === '[') {
      const mid = findClose(src, i + 1, '](');
      const end = mid === -1 ? -1 : src.indexOf(')', mid + 2);
      const href = end === -1 ? '' : src.slice(mid + 2, end).trim();
      if (mid > i + 1 && LINK_RE.test(href)) {
        flush();
        out.push({ t: 'a', href, c: parseInline(src.slice(i + 1, mid)) });
        i = end + 1;
        continue;
      }
    }

    buf += c;
    i++;
  }
  flush();
  return out;
}

// Blocks: { t: 'line', c } | { t: 'blank' } | { t: 'ul' | 'ol', start, items: [c] }
function parseBlocks(src) {
  const blocks = [];
  for (const line of src.split('\n')) {
    const bullet = line.match(/^\s*- +(.*)$/);
    const number = !bullet && line.match(/^\s*(\d{1,3})[.)] +(.*)$/);
    if (bullet || number) {
      const type = bullet ? 'ul' : 'ol';
      const prev = blocks[blocks.length - 1];
      const item = parseInline(bullet ? bullet[1] : number[2]);
      if (prev && prev.t === type) prev.items.push(item);
      else blocks.push({ t: type, start: number ? Number(number[1]) : 1, items: [item] });
    } else if (!line.trim()) {
      blocks.push({ t: 'blank' });
    } else {
      blocks.push({ t: 'line', c: parseInline(line) });
    }
  }
  return blocks;
}

// ---- Rendering -----------------------------------------------------------------
// Each piece renders three ways at once:
//   text  — what plain-text apps get
//   html  — what rich-text apps get
//   model — the characters a rich app shows, for counting {cursor} arrow presses

function renderInline(nodes, ctx) {
  const r = { text: '', html: '', model: '' };
  for (const n of nodes) {
    if (n.t === 'text') {
      r.text += n.v; r.html += textHtml(n.v); r.model += n.v;
    } else if (n.t === 'tok') {
      if (n.name === 'cursor') {
        if (!ctx.cursorSeen) {
          ctx.cursorSeen = true;
          r.text += CURSOR; r.model += CURSOR;
          if (ctx.caret) r.html += '<span class="caret"></span>';
        }
        continue;
      }
      const v = P.resolveToken(n.name, ctx);
      r.text += v; r.model += v;
      r.html += ctx.chips && n.name.startsWith('field:') ? chipHtml(n.name.slice(6), v) : textHtml(v);
    } else if (n.t === 'a') {
      const inner = renderInline(n.c, ctx);
      const plainHref = n.href.replace(/^mailto:/i, '');
      r.text += inner.text.replace(CURSOR, '') === plainHref || inner.text === n.href ? inner.text : `${inner.text} (${plainHref})`;
      r.html += `<a href="${escHtml(n.href)}">${inner.html}</a>`;
      r.model += inner.model;
    } else {
      const inner = renderInline(n.c, ctx);
      const tag = n.t === 'b' ? 'strong' : 'em';
      r.text += inner.text; r.model += inner.model;
      r.html += `<${tag}>${inner.html}</${tag}>`;
    }
  }
  return r;
}

// A field in the editor's preview: a chip with its label (or its value, once
// there is one), so you can see where answers will go.
function chipHtml(label, value) {
  const clean = label.replace(/\s+/g, ' ').trim();
  return `<span class="field-chip${value ? ' filled' : ''}" data-field="${escHtml(clean)}">${textHtml(value || clean)}</span>`;
}

const LIST_STYLE = 'margin-top:0;margin-bottom:0';

function renderRich(src, ctx) {
  const blocks = parseBlocks(src);
  const text = [], model = [];
  let html = '';
  // Plain lines run together joined by <br>, which pastes inline mid-sentence
  // in every editor we tried; only lists are block elements. A blank line
  // just before a list needs a second <br>: the first only ends the line.
  let run = [];
  const flushRun = (beforeBlock) => {
    if (!run.length) return;
    html += run.join('<br>') + (beforeBlock && run[run.length - 1] === '' ? '<br>' : '');
    run = [];
  };

  for (const b of blocks) {
    if (b.t === 'blank') {
      run.push(''); text.push(''); model.push('');
    } else if (b.t === 'line') {
      const r = renderInline(b.c, ctx);
      run.push(r.html); text.push(r.text); model.push(r.model);
    } else {
      flushRun(true);
      const tag = b.t;
      html += `<${tag} style="${LIST_STYLE}"${tag === 'ol' && b.start !== 1 ? ` start="${b.start}"` : ''}>`;
      b.items.forEach((item, k) => {
        const r = renderInline(item, ctx);
        html += `<li>${r.html}</li>`;
        text.push(`${tag === 'ul' ? '-' : `${b.start + k}.`} ${r.text}`);
        model.push(r.model);
      });
      html += `</${tag}>`;
    }
  }
  flushRun(false);
  return { text: text.join('\n'), html, model: model.join('\n') };
}

// Plain macros: 2.1's expandTemplate, plus HTML only for the editor preview.
function renderPlain(src, ctx) {
  let text = '', html = '';
  let last = 0;
  for (const m of src.matchAll(P.TOKEN_RE)) {
    const before = src.slice(last, m.index);
    text += before; html += textHtml(before);
    last = m.index + m[0].length;
    const r = renderInline([{ t: 'tok', name: m[1] }], ctx);
    text += r.text; html += r.html;
  }
  text += src.slice(last); html += textHtml(src.slice(last));
  return { text, html, model: text };
}

const countAfter = (s) => {
  const at = s.indexOf(CURSOR);
  return at === -1 ? 0 : Array.from(s.slice(at + 1)).length;
};

// renderExpansion(content, { format, values, clipboard, now, chips, caret })
//   → { text, html, cursorBack }
// `html` is null for plain macros unless a preview asks for it (chips/caret),
// so plain macros keep pasting text only, exactly as before.
function renderExpansion(content, opts = {}) {
  const rich = opts.format === 'rich';
  const ctx = { ...opts, cursorSeen: false };
  if (!rich && !opts.chips && !opts.caret) {
    const { text, cursorBack } = P.expandTemplate(content, ctx);
    return { text, html: null, cursorBack };
  }
  const src = P.normalizeContent(content).split(CURSOR).join('');
  const r = rich ? renderRich(src, ctx) : renderPlain(src, ctx);
  return {
    text: r.text.split(CURSOR).join(''),
    html: r.html,
    // A rich app shows the HTML: count what it shows, not the plain text.
    cursorBack: countAfter(rich ? r.model : r.text),
  };
}

if (typeof module === 'object') module.exports = { renderExpansion, parseBlocks, parseInline, LINK_RE };
