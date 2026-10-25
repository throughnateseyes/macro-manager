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

// ---- Delete, with Undo instead of "Are you sure?" ----------------------------
let pendingDelete = null; // { macro, index, timer }

function finalizeDelete() {
  if (!pendingDelete) return;
  clearTimeout(pendingDelete.timer);
  const { macro } = pendingDelete;
  pendingDelete = null;
  // Usage history goes only once the delete is final, so Undo restores it.
  if (macro.abbr && !state.macros.snippets.some((s) => s.abbr === macro.abbr)) {
    api.deleteUsage(macro.abbr).then((u) => { state.usage = u; });
  }
}

async function deleteMacro(index = state.selected) {
  const m = state.macros.snippets[index];
  if (!m) return;
  await settleEditor();
  if (state.view === 'editor' && index === state.selected) { clearTimeout(saveTimer); saveTimer = null; }
  finalizeDelete();
  state.macros.snippets.splice(index, 1);
  await persistAll();
  shiftSelectionAfterRemoval(index);
  render();
  const empty = !m.title && !m.abbr && !m.content;
  if (empty) return;
  const UNDO_MS = 8000;
  pendingDelete = { macro: m, index, timer: setTimeout(finalizeDelete, UNDO_MS) };
  toast(`Deleted “${m.title || 'Untitled'}”`, { action: 'Undo', onAction: undoDelete, duration: UNDO_MS });
}

async function undoDelete() {
  if (!pendingDelete) return;
  clearTimeout(pendingDelete.timer);
  const { macro, index } = pendingDelete;
  pendingDelete = null;
  await settleEditor();
  const at = Math.min(index, state.macros.snippets.length);
  state.macros.snippets.splice(at, 0, macro);
  if (state.view === 'editor' && at <= state.selected) state.selected += 1;
  await persistAll();
  hideToast();
  await go('editor', at);
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
  state.macros.snippets.splice(index + 1, 0, copy);
  if (state.view === 'editor' && index + 1 <= state.selected) state.selected += 1;
  await persistAll();
  await go('editor', index + 1);
  toast('Duplicated');
}

async function togglePin(index) {
  const m = state.macros.snippets[index];
  if (!m) return;
  await settleEditor();
  if (m.pinned) delete m.pinned; else m.pinned = true;
  await persistAll();
  render();
  toast(m.pinned ? 'Pinned to the top' : 'Unpinned');
}

async function moveToFolder(index, folder) {
  const m = state.macros.snippets[index];
  if (!m) return;
  await settleEditor();
  if (folder) m.folder = folder; else delete m.folder;
  await persistAll();
  render();
  toast(folder ? `Moved to ${folder}` : 'Removed from folder');
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
  const others = folders().filter((f) => f !== m.folder);
  const choice = await api.popupMenu([
    { id: 'open', label: 'Open' },
    { id: 'copy', label: 'Copy Text', enabled: Boolean(m.content.trim()) },
    { type: 'separator' },
    { id: 'pin', label: m.pinned ? 'Unpin' : 'Pin to Top' },
    { id: 'dup', label: 'Duplicate' },
    {
      label: 'Move to Folder',
      submenu: [
        ...others.map((f) => ({ id: `move:${f}`, label: f })),
        ...(others.length ? [{ type: 'separator' }] : []),
        { id: 'newfolder', label: 'New Folder…' },
        ...(m.folder ? [{ id: 'move:', label: 'Remove from Folder' }] : []),
      ],
    },
    { type: 'separator' },
    { id: 'delete', label: 'Delete' },
  ]);
  if (!choice) return;
  if (choice === 'open') return go('editor', index);
  if (choice === 'copy') return copyMacroText(index);
  if (choice === 'pin') return togglePin(index);
  if (choice === 'dup') return duplicateMacro(index);
  if (choice === 'newfolder') return newFolderFor(index);
  if (choice.startsWith('move:')) return moveToFolder(index, choice.slice(5));
  if (choice === 'delete') return deleteMacro(index);
}

async function showFolderMenu(key, e) {
  e.preventDefault();
  e.stopPropagation();
  const isPinned = key === PINNED_KEY;
  const choice = await api.popupMenu([
    ...(isPinned
      ? [{ id: 'unpinAll', label: 'Unpin All' }]
      : [
          { id: 'new', label: `New Macro in “${key}”` },
          { type: 'separator' },
          { id: 'rename', label: 'Rename Folder…' },
          { id: 'remove', label: 'Remove Folder' },
        ]),
    { type: 'separator' },
    { id: 'collapse', label: 'Collapse All' },
    { id: 'expand', label: 'Expand All' },
  ]);
  if (choice === 'new') return newMacro(key);
  if (choice === 'rename') return renameFolder(key);
  if (choice === 'remove') return removeFolder(key);
  if (choice === 'collapse') return setAllCollapsed(true);
  if (choice === 'expand') return setAllCollapsed(false);
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
    { id: 'collapse', label: 'Collapse All' },
    { id: 'expand', label: 'Expand All' },
  ]);
  if (choice === 'new') newMacro();
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
