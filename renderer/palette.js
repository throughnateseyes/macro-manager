// ---------------------------------------------------------------------------
// Quick Insert — search every macro and paste it into the app you were in.
// ---------------------------------------------------------------------------
const api = window.macroAPI;
const q = document.getElementById('q');
const results = document.getElementById('results');

let state = { macros: { prefix: '/', snippets: [] }, usage: {}, builtIns: [], stats: { lifetime: 0, days: {} }, today: '', fieldMemory: {} };
let items = [];
let active = 0;
let mode = 'insert'; // 'insert' pastes into the previous app, 'tray' copies, 'app' opens the macro
// While the fill-in prompt shows: { macro, action: 'insert' | 'copy', fromList }.
// fromList: picked here in Quick Insert (Esc goes back to the list) rather
// than typed in another app (Esc closes and leaves the typing alone).
let fill = null;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const oneLine = (s) => String(s || '').replace(/\s+/g, ' ').trim();

function score(item, query) {
  const abbr = item.abbr.toLowerCase();
  const title = item.title.toLowerCase();
  if (!query) return 1;
  if (abbr === query) return 100;
  if (abbr.startsWith(query)) return 80;
  if (title.startsWith(query)) return 70;
  if (title.split(/\s+/).some((w) => w.startsWith(query))) return 60;
  if (title.includes(query) || abbr.includes(query)) return 40;
  if ((item.folder || '').toLowerCase().includes(query)) return 30;
  if (item.content.toLowerCase().includes(query)) return 20;
  return 0;
}

const RECENT_SHOWN = 5;

// How a result is triggered: its abbreviation, or for a macro that only has
// a shortcut, the shortcut (Ctrl+Alt+T, ⌃⌥T on a Mac).
function triggerLabel(it) {
  if (it.abbr) return state.macros.prefix + it.abbr;
  const p = parseAccel(it.shortcut);
  if (!p) return '';
  if (state.platform !== 'darwin') return [...p.mods.map((m) => (m === 'Control' ? 'Ctrl' : m === 'Super' ? 'Win' : m)), p.key].join('+');
  const sym = { Command: '⌘', Super: '⌘', Control: '⌃', Alt: '⌥', Shift: '⇧' };
  return p.mods.map((m) => sym[m]).join('') + p.key;
}
const SECTION_LABELS = { pinned: 'Pinned', recent: 'Recent', all: 'All macros', builtin: 'Date &amp; Time' };

// Newest first, one entry per abbreviation (stats.json → recent).
function recentUses() {
  const list = Array.isArray(state.stats?.recent) ? state.stats.recent : [];
  return list.filter((r) => r && typeof r.abbr === 'string' && Number.isFinite(r.at));
}

const byUsage = (a, b) => b.uses - a.uses || a.title.localeCompare(b.title);

function build() {
  const query = q.value.trim().toLowerCase();
  const recent = recentUses();
  const recentRank = new Map();
  recent.forEach((r, i) => { if (!recentRank.has(r.abbr)) recentRank.set(r.abbr, i); });

  // `key` is what usage and recents are counted under (lib/shortcuts.js).
  const mine = state.macros.snippets
    .map((m, index) => ({ ...m, index, key: statKey(m), uses: state.usage[statKey(m)] || 0 }))
    .filter((m) => m.key && m.content.trim());
  const builtIns = state.builtIns
    .filter((b) => !mine.some((m) => m.abbr.toLowerCase() === b.abbr))
    .map((b) => ({ title: b.title, abbr: b.abbr, content: `{${b.abbr}}`, sub: b.desc, builtIn: true, uses: 0, section: 'builtin' }));

  if (query) {
    // Ranked search. Pinned and recently used macros win ties within the same
    // match tier; the boost (at most 5) never jumps a tier (gaps of 10+).
    const boost = (it) => {
      if (it.builtIn) return 0;
      const r = recentRank.get(it.key);
      return (it.pinned ? 3 : 0) + (r === undefined ? 0 : 2 * (1 - r / Math.max(recent.length, 1)));
    };
    items = [...mine, ...builtIns]
      .map((it) => {
        const s = score(it, query);
        return { ...it, s: s && s + boost(it) };
      })
      .filter((it) => it.s > 0)
      .sort((a, b) => b.s - a.s || Number(a.builtIn || 0) - Number(b.builtIn || 0) || Number(b.pinned || 0) - Number(a.pinned || 0) || byUsage(a, b));
  } else {
    // Empty query: Pinned, then Recent, then everything else. Each macro
    // appears once; `active` still indexes this one flat list.
    const pinned = mine.filter((m) => m.pinned).sort(byUsage).map((m) => ({ ...m, section: 'pinned' }));
    const taken = new Set(pinned.map((m) => m.index));
    const recents = [];
    for (const r of recent) {
      if (recents.length >= RECENT_SHOWN) break;
      const m = mine.find((x) => x.key === r.abbr && !x.pinned && !taken.has(x.index));
      if (!m) continue;
      taken.add(m.index);
      recents.push({ ...m, section: 'recent', at: r.at });
    }
    const rest = mine.filter((m) => !taken.has(m.index)).sort(byUsage).map((m) => ({ ...m, section: 'all' }));
    items = [...pinned, ...recents, ...rest, ...builtIns];
  }
  active = 0;
  render();
}

// Quiet relative time for the Recent section: Now, 2m, 1h, Yesterday, Oct 20.
function ago(at, now = new Date()) {
  const mins = Math.floor((now - at) / 60000);
  if (mins < 1) return 'Now';
  if (mins < 60) return `${mins}m`;
  const then = new Date(at);
  const hours = Math.floor(mins / 60);
  if (hours < 6 || dayKey(then) === dayKey(now)) return `${hours}h`;
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (dayKey(then) === dayKey(yesterday)) return 'Yesterday';
  const opts = { month: 'short', day: 'numeric' };
  if (then.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return then.toLocaleDateString(undefined, opts);
}

function render() {
  results.innerHTML = '';
  if (!items.length) {
    results.innerHTML = `<div class="empty">${q.value.trim() ? 'No matching macros' : 'No macros yet — create one in Macro Manager.'}</div>`;
    return;
  }
  const query = q.value.trim();
  // With an empty query every section gets a header, except "All macros"
  // when nothing sits above it. Search results only label the built-ins.
  let lastSection = null;
  let shownBuiltInHeader = false;
  const now = new Date();
  items.forEach((it, i) => {
    if (!query && it.section !== lastSection && (i > 0 || it.section === 'pinned' || it.section === 'recent')) {
      results.insertAdjacentHTML('beforeend', `<div class="group">${SECTION_LABELS[it.section]}</div>`);
    } else if (query && it.builtIn && !shownBuiltInHeader && i > 0) {
      results.insertAdjacentHTML('beforeend', `<div class="group">${SECTION_LABELS.builtin}</div>`);
      shownBuiltInHeader = true;
    }
    lastSection = it.section;
    const row = document.createElement('button');
    row.className = `result${i === active ? ' active' : ''}`;
    row.setAttribute('role', 'option');
    const when = it.section === 'recent'
      ? `<span class="when" title="${esc(new Date(it.at).toLocaleString())}">${esc(ago(it.at, now))}</span>`
      : '';
    row.innerHTML = `
      <div class="main">
        <div class="title">${esc(it.title || 'Untitled')}${it.pinned ? ' <span class="pin">●</span>' : ''}</div>
        <div class="sub">${esc(it.builtIn ? it.sub : oneLine(readableText(it)).slice(0, 120))}</div>
      </div>
      ${when}<span class="chip">${esc(triggerLabel(it))}</span>`;
    row.addEventListener('mousemove', () => { if (active !== i) { active = i; paintActive(); } });
    row.addEventListener('click', () => insert(i));
    row.addEventListener('contextmenu', (e) => resultMenu(i, e));
    results.appendChild(row);
  });
}

function paintActive() {
  const rows = results.querySelectorAll('.result');
  rows.forEach((r, i) => r.classList.toggle('active', i === active));
  const row = rows[active];
  if (!row) return;
  if (active === 0) { results.scrollTop = 0; return; }
  row.scrollIntoView({ block: 'nearest' });
  // Moving up onto the first row of a section: keep its header in view too.
  const head = row.previousElementSibling;
  if (head?.classList.contains('group')) {
    const above = results.getBoundingClientRect().top - head.getBoundingClientRect().top;
    if (above > 0) results.scrollTop -= above;
  }
}

function insert(i = active) {
  const it = items[i];
  if (!it) return;
  if (mode === 'tray') return copy(i);
  if (mode === 'app') return it.builtIn ? copy(i) : api.paletteOpenMacro(it.index);
  if (!it.builtIn && fieldsFor(it).length) return showFill(it, { action: 'insert', fromList: true });
  api.paletteInsert({ content: it.content, abbr: it.builtIn ? null : it.abbr, shortcut: it.shortcut, format: it.format });
}

// Right-click a result: the same verbs as the footer, plus pinning.
async function resultMenu(i, e) {
  e.preventDefault();
  const it = items[i];
  if (!it) return;
  active = i;
  paintActive();
  const enter = mode === 'tray' ? 'Copy' : mode === 'app' ? 'Open' : 'Insert';
  const choice = await api.popupMenu([
    { id: 'enter', label: enter },
    ...(enter !== 'Copy' ? [{ id: 'copy', label: 'Copy' }] : []),
    ...(it.builtIn ? [] : [
      { id: 'edit', label: 'Edit in Macro Manager', enabled: mode !== 'app' },
      { type: 'separator' },
      { id: 'pin', label: it.pinned ? 'Unpin' : 'Pin to Top' },
    ]),
  ]);
  if (choice === 'enter') insert(i);
  if (choice === 'copy') copy(i);
  if (choice === 'edit') api.paletteOpenMacro(it.index);
  if (choice === 'pin') {
    const m = state.macros.snippets[it.index];
    if (m.pinned) delete m.pinned; else m.pinned = true;
    state.macros = await api.saveMacros(state.macros);
    build();
    q.focus();
  }
}

async function copy(i = active) {
  const it = items[i];
  if (!it) return;
  if (!it.builtIn && fieldsFor(it).length) return showFill(it, { action: 'copy', fromList: true });
  await copyMacro(it);
}

// Both flavours for a formatted macro, like a paste.
async function copyMacro(m, values) {
  const { text } = await api.copyExpansion({ content: m.content, format: m.format, fields: m.fields, values, remember: Boolean(values) });
  api.paletteCopied({ abbr: m.builtIn ? null : statKey(m), chars: Array.from(text).length });
  api.paletteClose();
}

// ---- Fill-in prompt ----------------------------------------------------------
let previewSeq = 0;
async function showFillPreview(values) {
  const seq = ++previewSeq;
  const { html } = await api.previewTemplate(fill.macro.content, { format: fill.macro.format, values, chips: true });
  if (seq === previewSeq) document.getElementById('fill-preview').innerHTML = html;
}

function showFill(macro, { action, fromList }) {
  fill = { macro, action, fromList };
  const form = createFillForm({
    macro,
    memory: state.fieldMemory,
    onChange: showFillPreview,
    onSubmit: submitFill,
    onCancel: cancelFill,
  });
  document.getElementById('fill-title').textContent = macro.title || 'Untitled';
  document.getElementById('fill-abbr').textContent = triggerLabel(macro);
  document.getElementById('fill-fields').replaceChildren(form.el);
  renderMode();
  showFillPreview(form.values());
  form.focus();
}

async function submitFill(values) {
  if (!fill) return;
  const { macro, action, fromList } = fill;
  if (!fromList) return api.paletteFill(values);
  if (action === 'copy') return copyMacro(macro, values);
  api.paletteInsert({ content: macro.content, abbr: macro.abbr, shortcut: macro.shortcut, format: macro.format, fields: macro.fields, values });
}

function cancelFill() {
  const back = fill && fill.fromList;
  fill = null;
  renderMode();
  if (!back) { api.paletteClose(); return; }
  q.focus();
}

function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function streak() {
  const total = (d) => state.stats.days[dayKey(d)]?.total || 0;
  const d = new Date();
  if (!total(d)) d.setDate(d.getDate() - 1);
  let n = 0;
  while (total(d) > 0) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

function renderMode() {
  const tray = mode === 'tray' && !fill;
  document.getElementById('tray-head').classList.toggle('hidden', !tray);
  document.querySelector('.field').classList.toggle('hidden', Boolean(fill));
  results.classList.toggle('hidden', Boolean(fill));
  document.getElementById('fill').classList.toggle('hidden', !fill);
  document.getElementById('edit-hint').classList.toggle('hidden', Boolean(fill));
  document.getElementById('tab-hint').classList.toggle('hidden', !fill);
  document.getElementById('esc-label').textContent = !fill ? 'Close' : fill.fromList ? 'Back' : 'Cancel';
  if (fill) {
    document.getElementById('enter-label').textContent = fill.action === 'copy' ? 'Copy' : 'Insert';
    document.getElementById('copy-hint').classList.add('hidden');
    return;
  }
  document.getElementById('enter-label').textContent = tray || mode === 'tray' ? 'Copy' : mode === 'app' ? 'Open' : 'Insert';
  document.getElementById('copy-hint').classList.toggle('hidden', tray);
  if (tray) {
    document.getElementById('t-today').textContent = (state.stats.days[dayKey(new Date())]?.total || 0).toLocaleString();
    document.getElementById('t-streak').textContent = streak();
    document.getElementById('t-life').textContent = (state.stats.lifetime || 0).toLocaleString();
  }
}

document.getElementById('t-open').addEventListener('click', () => api.paletteOpenMacro(-1));

q.addEventListener('input', build);

document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  // The fill-in form handles its own keys; this only catches Esc elsewhere.
  if (fill) { if (e.key === 'Escape') { e.preventDefault(); cancelFill(); } return; }
  if (e.key === 'Escape') { e.preventDefault(); api.paletteClose(); return; }
  if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) { e.preventDefault(); active = Math.min(items.length - 1, active + 1); paintActive(); return; }
  if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) { e.preventDefault(); active = Math.max(0, active - 1); paintActive(); return; }
  if (e.key === 'Enter') { e.preventDefault(); insert(); return; }
  if (mod && e.key.toLowerCase() === 'c' && !window.getSelection().toString()) { e.preventDefault(); copy(); return; }
  if (mod && e.key.toLowerCase() === 'e') {
    e.preventDefault();
    const it = items[active];
    if (it && !it.builtIn) api.paletteOpenMacro(it.index);
  }
});

async function refresh() {
  const s = await api.getState();
  state = { macros: s.macros, usage: s.usage, builtIns: s.builtIns, stats: s.stats, fieldMemory: s.fieldMemory || {}, platform: s.platform };
  document.body.classList.add(s.platform === 'darwin' ? 'mac' : 'win');
  if (s.platform !== 'darwin') {
    document.getElementById('k-copy').textContent = 'Ctrl+C';
    document.getElementById('k-edit').textContent = 'Ctrl+E';
  }
}

api.onPaletteOpen(async (opts) => {
  mode = opts?.mode || 'insert';
  fill = null;
  // The window keeps its last page while hidden, and is already on screen by
  // now. Clear the last prompt before the await, or it shows (and takes an
  // Enter that goes nowhere) until refresh() comes back.
  renderMode();
  await refresh();
  q.value = '';
  build();
  // A macro with fields was typed in another app: straight to its prompt.
  if (mode === 'fill' && opts.fill) {
    showFill(opts.fill.macro, { action: opts.fill.action === 'copy' ? 'copy' : 'insert', fromList: false });
    return;
  }
  renderMode();
  q.focus();
});
api.onMacrosChanged((macros) => { state.macros = macros; });
api.onStatsChanged(({ usage, stats }) => { state.usage = usage; state.stats = stats; });

refresh().then(build);
