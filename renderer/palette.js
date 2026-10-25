// ---------------------------------------------------------------------------
// Quick Insert — search every macro and paste it into the app you were in.
// ---------------------------------------------------------------------------
const api = window.macroAPI;
const q = document.getElementById('q');
const results = document.getElementById('results');

let state = { macros: { prefix: '/', snippets: [] }, usage: {}, builtIns: [], stats: { lifetime: 0, days: {} }, today: '' };
let items = [];
let active = 0;
let mode = 'insert'; // 'insert' pastes into the previous app, 'tray' copies

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

function build() {
  const query = q.value.trim().toLowerCase();
  const mine = state.macros.snippets
    .map((m, index) => ({ ...m, index, uses: state.usage[m.abbr] || 0 }))
    .filter((m) => m.abbr && m.content.trim());
  const builtIns = state.builtIns
    .filter((b) => !mine.some((m) => m.abbr.toLowerCase() === b.abbr))
    .map((b) => ({ title: b.title, abbr: b.abbr, content: `{${b.abbr}}`, sub: b.desc, builtIn: true, uses: 0 }));

  items = [...mine, ...builtIns]
    .map((it) => ({ ...it, s: score(it, query) }))
    .filter((it) => it.s > 0)
    .sort((a, b) => (query ? b.s - a.s : 0) || Number(a.builtIn || 0) - Number(b.builtIn || 0) || Number(b.pinned || 0) - Number(a.pinned || 0) || b.uses - a.uses || a.title.localeCompare(b.title));
  active = 0;
  render();
}

function render() {
  results.innerHTML = '';
  if (!items.length) {
    results.innerHTML = `<div class="empty">${q.value.trim() ? 'No matching macros' : 'No macros yet — create one in Macro Manager.'}</div>`;
    return;
  }
  let shownBuiltInHeader = false;
  items.forEach((it, i) => {
    if (it.builtIn && !shownBuiltInHeader && i > 0) {
      results.insertAdjacentHTML('beforeend', '<div class="group">Date &amp; Time</div>');
      shownBuiltInHeader = true;
    }
    const row = document.createElement('button');
    row.className = `result${i === active ? ' active' : ''}`;
    row.setAttribute('role', 'option');
    row.innerHTML = `
      <div class="main">
        <div class="title">${esc(it.title || 'Untitled')}${it.pinned ? ' <span class="pin">●</span>' : ''}</div>
        <div class="sub">${esc(it.builtIn ? it.sub : oneLine(it.content).slice(0, 120))}</div>
      </div>
      <span class="chip">${esc(state.macros.prefix + it.abbr)}</span>`;
    row.addEventListener('mousemove', () => { if (active !== i) { active = i; paintActive(); } });
    row.addEventListener('click', () => insert(i));
    results.appendChild(row);
  });
}

function paintActive() {
  results.querySelectorAll('.result').forEach((r, i) => r.classList.toggle('active', i === active));
  results.querySelectorAll('.result')[active]?.scrollIntoView({ block: 'nearest' });
}

function insert(i = active) {
  const it = items[i];
  if (!it) return;
  if (mode === 'tray') return copy(i);
  api.paletteInsert({ content: it.content, abbr: it.builtIn ? null : it.abbr });
}

async function copy(i = active) {
  const it = items[i];
  if (!it) return;
  const { text } = await api.previewTemplate(it.content);
  await navigator.clipboard.writeText(text);
  api.paletteCopied({ abbr: it.builtIn ? null : it.abbr, chars: Array.from(text).length });
  api.paletteClose();
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
  const tray = mode === 'tray';
  document.getElementById('tray-head').classList.toggle('hidden', !tray);
  document.getElementById('enter-label').textContent = tray ? 'Copy' : 'Insert';
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
  state = { macros: s.macros, usage: s.usage, builtIns: s.builtIns, stats: s.stats };
  document.body.classList.add(s.platform === 'darwin' ? 'mac' : 'win');
  if (s.platform !== 'darwin') {
    document.getElementById('k-copy').textContent = 'Ctrl+C';
    document.getElementById('k-edit').textContent = 'Ctrl+E';
  }
}

api.onPaletteOpen(async (opts) => {
  mode = opts?.mode || 'insert';
  await refresh();
  renderMode();
  q.value = '';
  build();
  q.focus();
});
api.onMacrosChanged((macros) => { state.macros = macros; });
api.onStatsChanged(({ usage, stats }) => { state.usage = usage; state.stats = stats; });

refresh().then(build);
