// ---------------------------------------------------------------------------
// Macros — the whole library as one compact list
//
// The sidebar is for jumping between macros while editing; this page is for
// looking after the library: finding one, seeing what's used and what isn't,
// tidying folders, and picking a few to share. One line per macro so a
// screen holds dozens, grouped by folder like the sidebar (pinned first, each
// macro once), with columns you can sort by. Loaded before app.js and called
// from it, so it reads app.js's globals at call time.
// ---------------------------------------------------------------------------
let libFilter = 'all';   // 'all' | 'pinned' | 'recent' | 'folder:<name>' | 'unfiled'
let libQuery = '';
let libSort = null;      // 'name' | 'uses' | 'last', read from storage on first render
let libCollapsed = null; // group keys folded shut on this page

const LOOSE_KEY = '\u0000loose';

function timeAgo(ms) {
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function lastUsedMap() {
  const map = {};
  for (const r of state.stats.recent || []) map[r.abbr] = r.at;
  return map;
}

function libSorted(indices, last) {
  const s = state.macros.snippets;
  const byTitle = (a, b) => (s[a].title || '￿').localeCompare(s[b].title || '￿', undefined, { sensitivity: 'base' });
  const uses = (i) => state.usage[statKey(s[i])] || 0;
  const when = (i) => last[statKey(s[i])] || 0;
  if (libSort === 'uses') return indices.sort((a, b) => uses(b) - uses(a) || byTitle(a, b));
  if (libSort === 'last') return indices.sort((a, b) => when(b) - when(a) || byTitle(a, b));
  return indices.sort(byTitle);
}

// The page's groups for the current filter, as [{ key, title, indices }]. A
// group without a key is shown without a header (a filtered or flat view).
function librarySections(last) {
  const s = state.macros.snippets;
  const idx = s.map((_, i) => i).filter((i) => s[i].title || s[i].abbr || s[i].shortcut || s[i].content);
  const q = libQuery.trim().toLowerCase();

  if (q) {
    const hits = idx.map((i) => [i, searchScore(s[i], q)]).filter(([, sc]) => sc > 0)
      .sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([i]) => i);
    return [{ indices: hits }];
  }
  if (libFilter === 'pinned') return [{ indices: libSorted(idx.filter((i) => s[i].pinned), last) }];
  if (libFilter === 'recent') {
    return [{ indices: idx.filter((i) => last[statKey(s[i])]).sort((a, b) => last[statKey(s[b])] - last[statKey(s[a])]) }];
  }
  if (libFilter === 'unfiled') return [{ indices: libSorted(idx.filter((i) => !s[i].folder), last) }];
  if (libFilter.startsWith('folder:')) {
    const name = libFilter.slice(7);
    return [{ indices: libSorted(idx.filter((i) => s[i].folder === name), last) }];
  }

  const sections = [];
  const pinned = idx.filter((i) => s[i].pinned);
  if (pinned.length) sections.push({ key: PINNED_KEY, title: 'Pinned', indices: libSorted(pinned, last) });
  for (const name of folders()) {
    const members = idx.filter((i) => s[i].folder === name && !s[i].pinned);
    if (members.length) sections.push({ key: name, title: name, indices: libSorted(members, last) });
  }
  const loose = idx.filter((i) => !s[i].folder && !s[i].pinned);
  // With no folders and nothing pinned, it's just the list.
  if (loose.length) sections.push({ key: sections.length ? LOOSE_KEY : null, title: 'No folder', indices: libSorted(loose, last) });
  return sections;
}

function libRow(i, last, { showFolder }) {
  const m = state.macros.snippets[i];
  const uses = state.usage[statKey(m)] || 0;
  const when = last[statKey(m)];
  const picked = state.picked.has(m);
  const q = libQuery.trim().toLowerCase();
  const chips = [
    m.abbr ? `<span class="chip">${highlight(state.macros.prefix + m.abbr, q)}</span>` : '',
    m.shortcut ? `<span class="chip keys">${esc(shortAccel(m.shortcut))}</span>` : '',
  ].join('');
  const row = h(`
    <div class="lrow${picked ? ' picked' : ''}" role="option" tabindex="-1" data-i="${i}" aria-selected="${picked}">
      <span class="pick" role="checkbox" aria-checked="${picked}" aria-label="Select" title="Select">${ICON.check}</span>
      <span class="lname">
        <span class="ltitle${m.title ? '' : ' untitled'}">${m.title ? highlight(m.title, q) : 'Untitled'}</span>
        ${macroIssues(i).warn ? '<span class="warn-dot" title="Needs attention. Open it to see why."></span>' : ''}
        ${showFolder && m.folder ? `<span class="lfolder">${esc(m.folder)}</span>` : ''}
        <span class="lprev">${esc(preview(readableText(m), 160))}</span>
      </span>
      <span class="ltrig">${chips}</span>
      <span class="lnum">${uses ? uses.toLocaleString() : '<span class="none">—</span>'}</span>
      <span class="lwhen">${when ? esc(timeAgo(when)) : '<span class="none">Never</span>'}</span>
    </div>`);
  row.querySelector('.pick').addEventListener('click', (e) => {
    e.stopPropagation();
    // The box always toggles, as if ⌘/Ctrl were held; Shift still extends.
    pickClick(i, { shiftKey: e.shiftKey, ctrlKey: true }, libraryOrder());
  });
  row.addEventListener('click', (e) => {
    if (pickClick(i, e, libraryOrder())) return;
    // While picking, a plain click on a row adds or removes it, like the box.
    if (state.picked.size) { pickClick(i, { ctrlKey: true }, libraryOrder()); return; }
    go('editor', i);
  });
  row.addEventListener('keydown', (e) => { if (e.key === 'Enter') go('editor', i); });
  row.addEventListener('contextmenu', (e) => showMacroMenu(i, e));
  return row;
}

function libGroupHeader(sec, collapsed, onToggle) {
  const head = h(`
    <div class="lgroup${collapsed ? ' collapsed' : ''}">
      <button class="lgroup-toggle" aria-expanded="${!collapsed}">${ICON.chevron}<span>${esc(sec.title)}</span><span class="count">${sec.indices.length}</span></button>
      <span class="lgroup-acts"></span>
    </div>`);
  head.querySelector('.lgroup-toggle').addEventListener('click', onToggle);
  const acts = head.querySelector('.lgroup-acts');
  // A folder's export takes the whole folder, pinned members included.
  const all = sec.key === PINNED_KEY ? pinnedIndices() : sec.key === LOOSE_KEY ? sec.indices : folderIndices(sec.key);
  const name = sec.key === PINNED_KEY ? 'Pinned macros' : sec.key === LOOSE_KEY ? undefined : `${sec.key} macros`;
  acts.append(toolButton(ICON.share, sec.key === LOOSE_KEY ? 'Export these to share' : `Export “${sec.title}” to share`, () => exportMacros(all, name)));
  if (sec.key !== LOOSE_KEY) {
    const more = toolButton(ICON.more, 'More', (e) => showFolderMenu(sec.key, e, { collapseAll: setLibCollapsedAll }));
    acts.append(more);
    head.addEventListener('contextmenu', (e) => showFolderMenu(sec.key, e, { collapseAll: setLibCollapsedAll }));
  }
  return head;
}

function setLibCollapsedAll(collapsed) {
  for (const k of [PINNED_KEY, LOOSE_KEY, ...folders()]) { if (collapsed) libCollapsed.add(k); else libCollapsed.delete(k); }
  writeLocal('libCollapsed', [...libCollapsed]);
  const box = $('.lib-rows');
  if (box) renderLibraryRows(box);
}

function renderLibraryRows(box) {
  box.innerHTML = '';
  const last = lastUsedMap();
  const sections = librarySections(last).filter((sec) => sec.indices.length);
  const q = libQuery.trim();
  $('.lib-results')?.replaceChildren(q ? `${sections[0]?.indices.length || 0} found` : '');
  if (!sections.length) {
    const msg = q
      ? `No macros match “${esc(q)}”.`
      : libFilter === 'recent' ? 'Macros you use show up here.' : libFilter === 'pinned' ? 'Right-click a macro and choose Pin to Top to keep it here.' : 'Nothing here yet.';
    box.append(h(`<p class="lib-empty">${msg}</p>`));
    return;
  }
  // Folder names are worth repeating on each row only where rows from
  // different folders mix.
  const showFolder = Boolean(q) || libFilter === 'pinned' || libFilter === 'recent';
  for (const sec of sections) {
    const group = h('<div class="lgroup-wrap" role="group"></div>');
    const collapsed = sec.key && libCollapsed.has(sec.key);
    if (sec.key) {
      group.append(libGroupHeader(sec, collapsed, () => {
        if (collapsed) libCollapsed.delete(sec.key); else libCollapsed.add(sec.key);
        writeLocal('libCollapsed', [...libCollapsed]);
        renderLibraryRows(box);
      }));
    }
    if (!collapsed) sec.indices.forEach((i) => group.append(libRow(i, last, { showFolder })));
    box.append(group);
  }
}

// The macros as this page shows them right now, for Shift ranges and ⌘/Ctrl+A.
function libraryOrder() {
  return [...document.querySelectorAll('.lib-rows .lrow')].map((r) => Number(r.dataset.i));
}

// The picked set changed: restyle the rows in place (no re-render, so
// nothing jumps) and swap the toolbar.
function updateLibraryPicks() {
  document.querySelectorAll('.lib-rows .lrow').forEach((r) => {
    const on = state.picked.has(state.macros.snippets[Number(r.dataset.i)]);
    r.classList.toggle('picked', on);
    r.setAttribute('aria-selected', String(on));
    r.querySelector('.pick').setAttribute('aria-checked', String(on));
  });
  $('.lib-table')?.classList.toggle('picking', state.picked.size > 0);
  libraryToolbar();
}

function libraryToolbar() {
  const n = state.picked.size;
  if (n) {
    setToolbar(`<span class="tb-picked">${n} selected</span>`, [
      button('Deselect', () => clearPicked(), 'small'),
      toolButton(ICON.more, 'Pin, move or delete', () => showPickedMenu()),
      button(`${ICON.share}Export ${n === 1 ? '' : `${n} `}to Share…`, () => exportMacros(pickedIndices()), 'primary'),
    ]);
    return;
  }
  const add = h(`<button class="btn primary">${ICON.plus}New Macro</button>`);
  add.addEventListener('click', () => newMacro());
  const file = toolButton(ICON.more, 'Import or export', async () => {
    const choice = await api.popupMenu([
      { id: 'import', label: 'Import Macros…' },
      { id: 'export', label: 'Export All Macros…', enabled: state.macros.snippets.length > 0 },
    ]);
    if (choice === 'import') importMacros();
    if (choice === 'export') exportMacros();
  });
  setToolbar('', [file, add]);
}

function renderLibrary() {
  if (!libSort) libSort = readLocal('libSort', 'name');
  if (!libCollapsed) libCollapsed = new Set(readLocal('libCollapsed', []));
  libraryToolbar();

  const s = state.macros.snippets;
  const page = h(`
    <div class="page lib">
      <div class="lib-head">
        <h1>Macros <span class="count">${s.length}</span></h1>
        <label class="lib-search">
          ${ICON.search}
          <input id="lib-q" type="text" placeholder="Search titles, abbreviations and text" autocomplete="off" spellcheck="false" />
          <span class="lib-results"></span>
        </label>
      </div>
      <div class="lib-filters" role="group" aria-label="Show"></div>
      <div class="lib-table${state.picked.size ? ' picking' : ''}">
        <div class="lhead" role="presentation">
          <span></span>
          <button data-sort="name">Name</button>
          <span>Type</span>
          <button data-sort="uses" class="num">Uses</button>
          <button data-sort="last" class="num">Last used</button>
        </div>
        <div class="lib-rows" role="listbox" aria-multiselectable="true" aria-label="Macros"></div>
      </div>
      <p class="lib-tip"></p>
    </div>`);

  const rows = page.querySelector('.lib-rows');
  const filters = page.querySelector('.lib-filters');
  const opts = [['all', 'All'], ['pinned', 'Pinned'], ['recent', 'Recent'], ...folders().map((f) => [`folder:${f}`, f])];
  if (folders().length && s.some((m) => !m.folder)) opts.push(['unfiled', 'No folder']);
  if (!opts.some(([k]) => k === libFilter)) libFilter = 'all';
  for (const [k, label] of opts) {
    const b = h(`<button class="filter" aria-pressed="${libFilter === k}">${esc(label)}</button>`);
    b.addEventListener('click', () => {
      libFilter = k;
      filters.querySelectorAll('.filter').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      renderLibraryRows(rows);
    });
    filters.append(b);
  }

  const head = page.querySelector('.lhead');
  const markSort = () => head.querySelectorAll('[data-sort]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.sort === libSort));
    b.innerHTML = `${esc(b.textContent)}${b.dataset.sort === libSort ? ICON.chevron : ''}`;
  });
  head.querySelectorAll('[data-sort]').forEach((b) => b.addEventListener('click', () => {
    libSort = b.dataset.sort;
    writeLocal('libSort', libSort);
    markSort();
    renderLibraryRows(rows);
  }));
  markSort();

  page.querySelector('.lib-tip').textContent =
    `${IS_MAC() ? '⌘-click' : 'Ctrl+click'} or Shift-click to pick several macros to share, move or delete. ` +
    'To add macros someone sent you, drop their file on this window.';

  const input = page.querySelector('#lib-q');
  input.value = libQuery;
  filters.classList.toggle('dim', Boolean(libQuery.trim()));
  input.addEventListener('input', () => {
    libQuery = input.value;
    filters.classList.toggle('dim', Boolean(libQuery.trim()));
    renderLibraryRows(rows);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && input.value) { e.stopPropagation(); input.value = ''; input.dispatchEvent(new Event('input')); }
    if (e.key === 'Enter') rows.querySelector('.lrow')?.click();
    if (e.key === 'ArrowDown') { e.preventDefault(); rows.querySelector('.lrow')?.focus(); }
  });
  rows.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    // Stay on this page instead of the sidebar's ↑/↓, which opens macros.
    e.preventDefault();
    e.stopPropagation();
    const list = [...rows.querySelectorAll('.lrow')];
    const at = list.indexOf(document.activeElement);
    (list[at + (e.key === 'ArrowDown' ? 1 : -1)] || (at <= 0 && e.key === 'ArrowUp' ? input : null))?.focus();
  });

  if (!s.length) {
    page.querySelector('.lib-table').replaceWith(emptyOverview());
    filters.remove();
    page.querySelector('.lib-tip').remove();
  } else {
    renderLibraryRows(rows);
  }
  el.view.append(page);
}
