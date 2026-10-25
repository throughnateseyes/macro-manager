// ---------------------------------------------------------------------------
// Macros — every macro at once, as cards
//
// The sidebar list is for jumping between macros while editing; this page is
// for seeing the whole library: what each macro types, how often it's used,
// and when it was last used. Pinned first, then recently used, then folders.
// Search and the filter chips narrow it down. Loaded before app.js and called
// from it, so it reads app.js's globals at call time.
// ---------------------------------------------------------------------------
let libFilter = 'all';   // 'all' | 'pinned' | 'recent' | 'folder:<name>' | 'unfiled'
let libQuery = '';

const RECENT_SHOWN = 6;

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

// The library's groups for the current filter, as [{ title, indices }].
function librarySections() {
  const s = state.macros.snippets;
  const idx = s.map((_, i) => i).filter((i) => s[i].title || s[i].abbr || s[i].content);
  const last = lastUsedMap();
  const q = libQuery.trim().toLowerCase();

  if (q) {
    const hits = idx.map((i) => [i, searchScore(s[i], q)]).filter(([, sc]) => sc > 0)
      .sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([i]) => i);
    return [{ title: `${hits.length} result${hits.length === 1 ? '' : 's'}`, indices: hits, plain: true }];
  }

  const pinned = sortedIndices(idx.filter((i) => s[i].pinned));
  const recent = idx.filter((i) => last[s[i].abbr]).sort((a, b) => last[s[b].abbr] - last[s[a].abbr]);

  if (libFilter === 'pinned') return [{ title: 'Pinned', indices: pinned }];
  if (libFilter === 'recent') return [{ title: 'Recently used', indices: recent }];
  if (libFilter === 'unfiled') return [{ title: 'No folder', indices: sortedIndices(idx.filter((i) => !s[i].folder)) }];
  if (libFilter.startsWith('folder:')) {
    const name = libFilter.slice(7);
    return [{ title: name, indices: sortedIndices(idx.filter((i) => s[i].folder === name)) }];
  }

  const sections = [];
  if (pinned.length) sections.push({ title: 'Pinned', indices: pinned });
  const recentShown = recent.filter((i) => !s[i].pinned).slice(0, RECENT_SHOWN);
  if (recentShown.length) sections.push({ title: 'Recently used', indices: recentShown });
  for (const name of folders()) {
    const members = sortedIndices(idx.filter((i) => s[i].folder === name && !s[i].pinned));
    if (members.length) sections.push({ title: name, indices: members });
  }
  const loose = sortedIndices(idx.filter((i) => !s[i].folder && !s[i].pinned));
  if (loose.length) sections.push({ title: folders().length ? 'No folder' : 'Everything else', indices: loose });
  return sections;
}

function macroCard(i, last) {
  const m = state.macros.snippets[i];
  const uses = state.usage[m.abbr] || 0;
  const when = last[m.abbr];
  const card = h(`
    <button class="card" data-i="${i}">
      <span class="card-top">
        <span class="card-title${m.title ? '' : ' untitled'}">${esc(m.title || 'Untitled')}</span>
        ${m.abbr ? `<span class="chip">${esc(state.macros.prefix + m.abbr)}</span>` : ''}
      </span>
      <span class="card-body">${esc(m.content.trim()) || '<em>Empty</em>'}</span>
      <span class="card-meta">
        <span>${uses ? `${uses.toLocaleString()} use${uses === 1 ? '' : 's'}` : 'Not used yet'}</span>
        ${when ? `<span>${esc(timeAgo(when))}</span>` : ''}
      </span>
    </button>`);
  card.addEventListener('click', () => go('editor', i));
  card.addEventListener('contextmenu', (e) => showMacroMenu(i, e));
  return card;
}

function renderLibraryGrid(box) {
  box.innerHTML = '';
  const last = lastUsedMap();
  const sections = librarySections();
  const shown = sections.filter((sec) => sec.indices.length);
  if (!shown.length) {
    const msg = libQuery.trim()
      ? `No macros match “${esc(libQuery.trim())}”.`
      : libFilter === 'recent' ? 'Macros you use show up here.' : libFilter === 'pinned' ? 'Pin a macro from its editor to keep it here.' : 'Nothing here yet.';
    box.append(h(`<p class="lib-empty">${msg}</p>`));
    return;
  }
  for (const sec of shown) {
    const section = h(`<section class="lib-section"><h2 class="lib-h">${esc(sec.title)}${sec.plain ? '' : ` <span class="count">${sec.indices.length}</span>`}</h2><div class="cards"></div></section>`);
    const grid = section.querySelector('.cards');
    sec.indices.forEach((i) => grid.append(macroCard(i, last)));
    box.append(section);
  }
}

function renderLibrary() {
  const add = h(`<button class="btn primary">${ICON.plus}New Macro</button>`);
  add.addEventListener('click', newMacro);
  setToolbar('', [add]);

  const s = state.macros.snippets;
  const page = h(`
    <div class="page lib">
      <div class="lib-head">
        <h1>Macros <span class="count">${s.length}</span></h1>
        <label class="lib-search">
          ${ICON.search}
          <input id="lib-q" type="text" placeholder="Search titles, abbreviations and text" autocomplete="off" spellcheck="false" />
        </label>
      </div>
      <div class="lib-filters" role="group" aria-label="Show"></div>
      <div class="lib-grid"></div>
    </div>`);

  const filters = page.querySelector('.lib-filters');
  const opts = [['all', 'All'], ['pinned', 'Pinned'], ['recent', 'Recent'], ...folders().map((f) => [`folder:${f}`, f])];
  if (folders().length && s.some((m) => !m.folder)) opts.push(['unfiled', 'No folder']);
  if (!opts.some(([k]) => k === libFilter)) libFilter = 'all';
  for (const [k, label] of opts) {
    const b = h(`<button class="filter" aria-pressed="${libFilter === k}">${esc(label)}</button>`);
    b.addEventListener('click', () => {
      libFilter = k;
      filters.querySelectorAll('.filter').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      renderLibraryGrid(grid);
    });
    filters.append(b);
  }

  const grid = page.querySelector('.lib-grid');
  const input = page.querySelector('#lib-q');
  input.value = libQuery;
  input.addEventListener('input', () => {
    libQuery = input.value;
    filters.classList.toggle('dim', Boolean(libQuery.trim()));
    renderLibraryGrid(grid);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && input.value) { e.stopPropagation(); input.value = ''; input.dispatchEvent(new Event('input')); }
    if (e.key === 'Enter') grid.querySelector('.card')?.click();
  });

  if (!s.length) {
    grid.append(emptyOverview());
  } else {
    renderLibraryGrid(grid);
  }
  el.view.append(page);
}
