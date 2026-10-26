// ---------------------------------------------------------------------------
// Macro actions and right-click menus
//
// Every place a macro appears (sidebar row, Macros-page card, Most used row,
// Quick Insert result) offers the same right-click menu, and every command in
// it runs through the functions here, so "Pin" or "Delete" means the same
// thing wherever you do it. Menus are native (see popupMenu in main.js).
//
// Loaded before app.js and called from it, so this reads app.js's globals
// (state, go, render, toast…) at call time.
// ---------------------------------------------------------------------------

// Structural changes (delete, move, duplicate) must not race the editor's
// pending autosave, and must keep the editor pointing at the same macro.
async function settleEditor() {
  if (state.view === 'editor' && saveTimer) await flushSave();
}

async function persistAll() {
  // Saved without replacing state.macros: an open editor holds references
  // into it.
  await api.saveMacros(state.macros);
}

function shiftSelectionAfterRemoval(index) {
  if (state.view !== 'editor') return;
  if (index === state.selected) { state.view = 'overview'; state.selected = -1; }
  else if (index < state.selected) state.selected -= 1;
}

// ---- Picking several macros (⌘/Ctrl-click, Shift-click) ----------------------
// Kept as the macro objects themselves, so it survives sorting and deletes
// above it. The sidebar and the Macros page share one selection.
let pickAnchor = null;

const plural = (n, word = 'macro') => `${n} ${word}${n === 1 ? '' : 's'}`;

function pickedIndices() {
  return state.macros.snippets.flatMap((m, i) => (state.picked.has(m) ? [i] : []));
}

function prunePicked() {
  for (const m of state.picked) if (!state.macros.snippets.includes(m)) state.picked.delete(m);
}

function clearPicked() {
  pickAnchor = null;
  if (!state.picked.size) return false;
  state.picked.clear();
  refreshPicked();
  return true;
}

// A click on a macro row. Returns true when it picked rather than opened.
// `order` is the indices in the order that list shows them, for Shift ranges.
function pickClick(i, e, order) {
  if (!(e.shiftKey || e.metaKey || e.ctrlKey)) return false;
  const s = state.macros.snippets;
  // Starting a selection while a macro is open includes the open one.
  if (!state.picked.size && state.view === 'editor' && s[state.selected] && state.selected !== i) {
    state.picked.add(s[state.selected]);
    pickAnchor = s[state.selected];
  }
  const from = order.indexOf(s.indexOf(pickAnchor));
  const to = order.indexOf(i);
  if (e.shiftKey && from !== -1 && to !== -1) {
    for (const j of order.slice(Math.min(from, to), Math.max(from, to) + 1)) state.picked.add(s[j]);
  } else {
    if (state.picked.has(s[i])) state.picked.delete(s[i]); else state.picked.add(s[i]);
    pickAnchor = s[i];
  }
  refreshPicked();
  return true;
}

function pickAll(indices) {
  for (const i of indices) state.picked.add(state.macros.snippets[i]);
  refreshPicked();
}

// ---- Delete, with Undo instead of "Are you sure?" ----------------------------
let pendingDelete = null; // { items: [{ macro, index }], timer }

function finalizeDelete() {
  if (!pendingDelete) return;
  clearTimeout(pendingDelete.timer);
  const { items } = pendingDelete;
  pendingDelete = null;
  // Usage history goes only once the delete is final, so Undo restores it.
  for (const { macro } of items) {
    const key = statKey(macro);
    if (key && !state.macros.snippets.some((s) => statKey(s) === key)) {
      api.deleteUsage(key).then((u) => { state.usage = u; });
    }
  }
}

async function deleteMacro(index = state.selected) {
  return deleteMacros([index]);
}

async function deleteMacros(indices) {
  const s = state.macros.snippets;
  const list = [...new Set(indices)].filter((i) => s[i]).sort((a, b) => a - b);
  if (!list.length) return;
  await settleEditor();
  if (state.view === 'editor' && list.includes(state.selected)) { clearTimeout(saveTimer); saveTimer = null; }
  finalizeDelete();
  const items = list.map((index) => ({ macro: s[index], index }));
  // Highest first, so the lower indices still point at the right macros.
  for (const { index } of [...items].reverse()) {
    s.splice(index, 1);
    shiftSelectionAfterRemoval(index);
  }
  prunePicked();
  await persistAll();
  render();
  const real = items.filter(({ macro: m }) => m.title || m.abbr || m.shortcut || m.content);
  if (!real.length) return;
  const UNDO_MS = 8000;
  pendingDelete = { items, timer: setTimeout(finalizeDelete, UNDO_MS) };
  const what = items.length === 1 ? `“${items[0].macro.title || 'Untitled'}”` : plural(items.length);
  toast(`Deleted ${what}`, { action: 'Undo', onAction: undoDelete, duration: UNDO_MS });
}

async function undoDelete() {
  if (!pendingDelete) return;
  clearTimeout(pendingDelete.timer);
  const { items } = pendingDelete;
  pendingDelete = null;
  await settleEditor();
  // Lowest first puts each one back exactly where it was.
  for (const { macro, index } of items) {
    const at = Math.min(index, state.macros.snippets.length);
    state.macros.snippets.splice(at, 0, macro);
    if (state.view === 'editor' && at <= state.selected) state.selected += 1;
  }
  await persistAll();
  hideToast();
  if (items.length === 1) await go('editor', state.macros.snippets.indexOf(items[0].macro));
  else render();
  toast('Restored');
}

// ---- The rest of the macro commands -------------------------------------------
async function duplicateMacro(index = state.selected) {
  const m = state.macros.snippets[index];
  if (!m) return;
  await settleEditor();
  let abbr = m.abbr ? `${m.abbr}2` : '';
  for (let n = 3; abbr && state.macros.snippets.some((s) => s.abbr.toLowerCase() === abbr.toLowerCase()); n++) abbr = `${m.abbr}${n}`;
  const copy = { ...m, title: `${m.title || 'Untitled'} copy`, abbr };
  delete copy.pinned;
  delete copy.shortcut; // one set of keys can only paste one macro
  state.macros.snippets.splice(index + 1, 0, copy);
  if (state.view === 'editor' && index + 1 <= state.selected) state.selected += 1;
  await persistAll();
  await go('editor', index + 1);
  toast('Duplicated');
}

async function togglePin(index) {
  const m = state.macros.snippets[index];
  if (!m) return;
  return setPinned([index], !m.pinned);
}

async function setPinned(indices, pinned) {
  const list = indices.map((i) => state.macros.snippets[i]).filter(Boolean);
  if (!list.length) return;
  await settleEditor();
  for (const m of list) { if (pinned) m.pinned = true; else delete m.pinned; }
  await persistAll();
  render();
  toast(pinned ? 'Pinned to the top' : 'Unpinned');
}

async function moveToFolder(indices, folder) {
  const list = [].concat(indices).map((i) => state.macros.snippets[i]).filter(Boolean);
  if (!list.length) return;
  await settleEditor();
  for (const m of list) { if (folder) m.folder = folder; else delete m.folder; }
  await persistAll();
  render();
  const what = list.length === 1 ? '' : `${plural(list.length)} `;
  toast(folder ? `Moved ${what}to ${folder}` : `Removed ${what}from folder`);
}

// ---- Sharing: export a file, import one -------------------------------------------
// One macro, a few, a folder, or (no indices) everything as a backup. Shares
// leave out pinning; see buildExport in lib/store.js.
async function exportMacros(indices, name) {
  await settleEditor();
  const s = state.macros.snippets;
  const r = await api.exportMacros(indices ? { snippets: indices.map((i) => s[i]).filter(Boolean), name: name || exportName(indices) } : {});
  if (r.ok) toast(`Exported ${plural(r.count)}${r.file ? ` to “${r.file}”` : ''}`, { duration: 3000 });
  else if (r.error) toast(r.error);
}

function exportName(indices) {
  const s = state.macros.snippets;
  if (indices.length === 1) return s[indices[0]].title || s[indices[0]].abbr || 'Macro';
  const f = s[indices[0]]?.folder;
  if (f && indices.every((i) => s[i].folder === f)) return `${f} macros`;
  return plural(indices.length);
}

const folderIndices = (name) => state.macros.snippets.flatMap((m, i) => (m.folder === name ? [i] : []));
const pinnedIndices = () => state.macros.snippets.flatMap((m, i) => (m.pinned ? [i] : []));

function importToast(r) {
  if (r.ok) {
    const skipped = r.skipped ? ` · ${r.skipped} you already had` : '';
    toast(r.added ? `Added ${plural(r.added)}${skipped}` : 'You already have all of these', { duration: 3000 });
  } else if (r.error) {
    toast(r.error, { duration: 3000 });
  }
}

async function importMacros() {
  await settleEditor();
  importToast(await api.importMacros());
}

// Files dropped on the window. Several at once add up into one message.
async function importDropped(files) {
  const json = files.filter((f) => /\.json$/i.test(f.name));
  if (!json.length) { toast('Drop a .json file exported from Macro Manager.', { duration: 3000 }); return; }
  await settleEditor();
  let added = 0, skipped = 0, error = null;
  for (const f of json) {
    const r = await api.importMacroText(await f.text());
    if (r.ok) { added += r.added; skipped += r.skipped; } else error = `${f.name}: ${r.error}`;
  }
  if (error && !added) importToast({ ok: false, error });
  else importToast({ ok: true, added, skipped });
}

// Copies the way it would paste (both flavours when formatted). Fields get
// their default, or their name in brackets to fill in by hand.
async function copyMacroText(index) {
  const m = state.macros.snippets[index];
  if (!m) return;
  const fields = fieldsFor(m);
  const values = initialValues(fields);
  for (const f of fields) if (!values[f.key]) values[f.key] = `[${f.label}]`;
  await api.copyExpansion({ content: m.content, format: m.format, fields: m.fields, values });
  toast('Copied');
}

// ---- Folders ------------------------------------------------------------------
async function renameFolder(from) {
  const to = (await askText({ title: 'Rename folder', value: from, confirm: 'Rename' }))?.trim();
  if (!to || to === from) return;
  await settleEditor();
  for (const m of state.macros.snippets) if (m.folder === from) m.folder = to;
  if (state.collapsed.delete(from)) state.collapsed.add(to);
  writeLocal('collapsed', [...state.collapsed]);
  await persistAll();
  render();
}

async function removeFolder(name) {
  await settleEditor();
  const members = state.macros.snippets.filter((m) => m.folder === name);
  for (const m of members) delete m.folder;
  await persistAll();
  render();
  toast(`Removed “${name}”. Its ${members.length} macro${members.length === 1 ? '' : 's'} stayed.`, {
    action: 'Undo',
    duration: 6000,
    onAction: async () => {
      for (const m of members) m.folder = name;
      await persistAll();
      render();
    },
  });
}

async function newFolderFor(index) {
  const name = (await askText({ title: 'New folder', placeholder: 'Leasing', confirm: 'Create' }))?.trim();
  if (name) await moveToFolder(index, name);
}

function setAllCollapsed(collapsed) {
  const keys = [PINNED_KEY, ...folders()];
  for (const k of keys) { if (collapsed) state.collapsed.add(k); else state.collapsed.delete(k); }
  writeLocal('collapsed', [...state.collapsed]);
  renderList();
}

// ---- Menus ----------------------------------------------------------------------
async function showMacroMenu(index, e) {
  e.preventDefault();
  e.stopPropagation();
  const m = state.macros.snippets[index];
  if (!m) return;
  // Right-clicking one of several picked macros acts on all of them.
  if (state.picked.size > 1 && state.picked.has(m)) return showPickedMenu();
  if (state.picked.size && !state.picked.has(m)) clearPicked();
  const choice = await api.popupMenu([
    { id: 'open', label: 'Open' },
    { id: 'copy', label: 'Copy Text', enabled: Boolean(m.content.trim()) },
    { id: 'export', label: 'Export to Share…' },
    { type: 'separator' },
    { id: 'pin', label: m.pinned ? 'Unpin' : 'Pin to Top' },
    { id: 'dup', label: 'Duplicate' },
    folderSubmenu([m]),
    { type: 'separator' },
    { id: 'delete', label: 'Delete' },
  ]);
  if (!choice) return;
  if (choice === 'open') return go('editor', index);
  if (choice === 'copy') return copyMacroText(index);
  if (choice === 'export') return exportMacros([index]);
  if (choice === 'pin') return togglePin(index);
  if (choice === 'dup') return duplicateMacro(index);
  if (choice === 'newfolder') return newFolderFor(index);
  if (choice.startsWith('move:')) return moveToFolder(index, choice.slice(5));
  if (choice === 'delete') return deleteMacro(index);
}

function folderSubmenu(list) {
  const shared = list.every((m) => m.folder === list[0].folder) ? list[0].folder : undefined;
  const others = folders().filter((f) => f !== shared);
  return {
    label: 'Move to Folder',
    submenu: [
      ...others.map((f) => ({ id: `move:${f}`, label: f })),
      ...(others.length ? [{ type: 'separator' }] : []),
      { id: 'newfolder', label: 'New Folder…' },
      ...(list.some((m) => m.folder) ? [{ id: 'move:', label: 'Remove from Folder' }] : []),
    ],
  };
}

// The commands for everything picked: from a right-click on a picked row,
// the sidebar's selection bar, or the Macros page toolbar.
async function showPickedMenu() {
  const indices = pickedIndices();
  const list = indices.map((i) => state.macros.snippets[i]);
  if (!list.length) return;
  const n = list.length;
  const allPinned = list.every((m) => m.pinned);
  const choice = await api.popupMenu([
    { id: 'export', label: `Export ${plural(n)} to Share…` },
    { type: 'separator' },
    { id: 'pin', label: allPinned ? 'Unpin' : 'Pin to Top' },
    folderSubmenu(list),
    { type: 'separator' },
    { id: 'none', label: 'Deselect All' },
    { id: 'delete', label: `Delete ${plural(n)}` },
  ]);
  if (!choice) return;
  if (choice === 'export') return exportMacros(indices);
  if (choice === 'pin') return setPinned(indices, !allPinned);
  if (choice === 'newfolder') return newFolderFor(indices);
  if (choice.startsWith('move:')) return moveToFolder(indices, choice.slice(5));
  if (choice === 'none') return clearPicked();
  if (choice === 'delete') return deleteMacros(indices);
}

// `collapseAll` lets the Macros page reuse this menu for its own groups.
async function showFolderMenu(key, e, { collapseAll = setAllCollapsed } = {}) {
  e.preventDefault();
  e.stopPropagation();
  const isPinned = key === PINNED_KEY;
  const choice = await api.popupMenu([
    ...(isPinned
      ? [
          { id: 'export', label: 'Export Pinned to Share…' },
          { type: 'separator' },
          { id: 'unpinAll', label: 'Unpin All' },
        ]
      : [
          { id: 'new', label: `New Macro in “${key}”` },
          { id: 'export', label: 'Export Folder to Share…' },
          { id: 'pick', label: 'Select All in Folder' },
          { type: 'separator' },
          { id: 'rename', label: 'Rename Folder…' },
          { id: 'remove', label: 'Remove Folder' },
        ]),
    { type: 'separator' },
    { id: 'collapse', label: 'Collapse All' },
    { id: 'expand', label: 'Expand All' },
  ]);
  if (choice === 'new') return newMacro(key);
  if (choice === 'export') return isPinned ? exportMacros(pinnedIndices(), 'Pinned macros') : exportMacros(folderIndices(key));
  if (choice === 'pick') return pickAll(folderIndices(key));
  if (choice === 'rename') return renameFolder(key);
  if (choice === 'remove') return removeFolder(key);
  if (choice === 'collapse') return collapseAll(true);
  if (choice === 'expand') return collapseAll(false);
  if (choice === 'unpinAll') {
    await settleEditor();
    for (const m of state.macros.snippets) delete m.pinned;
    await persistAll();
    render();
  }
}

async function showListMenu(e) {
  e.preventDefault();
  const choice = await api.popupMenu([
    { id: 'new', label: 'New Macro' },
    { type: 'separator' },
    { id: 'import', label: 'Import Macros…' },
    { id: 'exportAll', label: 'Export All Macros…', enabled: state.macros.snippets.length > 0 },
    { type: 'separator' },
    { id: 'collapse', label: 'Collapse All' },
    { id: 'expand', label: 'Expand All' },
  ]);
  if (choice === 'new') newMacro();
  if (choice === 'import') importMacros();
  if (choice === 'exportAll') exportMacros();
  if (choice === 'collapse') setAllCollapsed(true);
  if (choice === 'expand') setAllCollapsed(false);
}

// ---- A small text prompt (Electron has no window.prompt) ---------------------------
function askText({ title, value = '', placeholder = '', confirm = 'Save' }) {
  return new Promise((resolve) => {
    const sheet = h(`
      <div class="sheet-backdrop" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <form class="sheet ask">
          <h2>${esc(title)}</h2>
          <input type="text" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false" />
          <div class="sheet-actions">
            <button type="button" class="btn" data-cancel>Cancel</button>
            <button type="submit" class="btn primary">${esc(confirm)}</button>
          </div>
        </form>
      </div>`);
    const input = sheet.querySelector('input');
    const done = (val) => { sheet.remove(); resolve(val); };
    sheet.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); done(input.value); });
    sheet.querySelector('[data-cancel]').addEventListener('click', () => done(null));
    sheet.addEventListener('mousedown', (e) => { if (e.target === sheet) done(null); });
    sheet.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } });
    document.body.append(sheet);
    input.focus();
    input.select();
  });
}
