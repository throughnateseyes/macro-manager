// ---------------------------------------------------------------------------
// Default snippets — date & time, dynamically generated at render/expansion
// ---------------------------------------------------------------------------
const DEFAULT_SNIPPETS = [
  {
    title: 'Full Timestamp',
    abbr: 'ts',
    desc: 'Current date + time',
    resolve: () => {
      const d = new Date();
      const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      const h = d.getHours(), m = d.getMinutes(), s = d.getSeconds();
      return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    },
  },
  {
    title: 'Short Date',
    abbr: 'date',
    desc: 'MM/DD/YYYY',
    resolve: () => {
      const d = new Date();
      return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;
    },
  },
  {
    title: 'ISO Date',
    abbr: 'isodate',
    desc: 'YYYY-MM-DD',
    resolve: () => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    },
  },
  {
    title: 'Time Only',
    abbr: 'time',
    desc: '24-hour time',
    resolve: () => {
      const d = new Date();
      return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
    },
  },
  {
    title: '12hr Time',
    abbr: 'time12',
    desc: '12-hour format',
    resolve: () => {
      const d = new Date();
      let h = d.getHours(), ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      return `${h}:${String(d.getMinutes()).padStart(2,'0')} ${ampm}`;
    },
  },
  {
    title: 'Day + Date',
    abbr: 'day',
    desc: 'Weekday, Month Day',
    resolve: () => {
      const d = new Date();
      const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
      const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
    },
  },
  {
    title: 'Unix Timestamp',
    abbr: 'unix',
    desc: 'Seconds since epoch',
    resolve: () => String(Math.floor(Date.now() / 1000)),
  },
];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let data = { snippets: [], prefix: '/' };
let selectedIndex = -1;
let isDark = true;          // true = dark mode (default)
let showingDefaults = false;
let settingsOpen = false;

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------
const macroList       = document.getElementById('macro-list');
const searchInput     = document.getElementById('search');
const editorEmpty     = document.getElementById('editor-empty');
const editorForm      = document.getElementById('editor-form');
const defaultsPage    = document.getElementById('defaults-page');
const defaultsPageList = document.getElementById('defaults-page-list');
const editorHeading   = document.getElementById('editor-heading');
const editorSubtitle  = document.getElementById('editor-subtitle');
const fieldTitle      = document.getElementById('field-title');
const fieldAbbr       = document.getElementById('field-abbr');
const fieldContent    = document.getElementById('field-content');
const prefixBadge       = document.getElementById('prefix-badge');
const prefixKey         = document.getElementById('prefix-key');
const btnNew            = document.getElementById('btn-new');
const btnSave           = document.getElementById('btn-save');
const btnDelete         = document.getElementById('btn-delete');
const btnCopy           = document.getElementById('btn-copy');
const btnSettings       = document.getElementById('btn-settings');
const settingsPopover   = document.getElementById('settings-popover');
const settingsThemeTgl  = document.getElementById('settings-theme-toggle');
const settingsVersion   = document.getElementById('settings-version');
const listenerStatus    = document.getElementById('listener-status');
const navDefaults       = document.getElementById('nav-defaults');

// Modals
const prefixModal   = document.getElementById('prefix-modal');
const prefixCancel  = document.getElementById('prefix-cancel');
const deleteModal   = document.getElementById('delete-modal');
const deleteConfirm = document.getElementById('delete-confirm');
const deleteCancel  = document.getElementById('delete-cancel');

// ---------------------------------------------------------------------------
// Show/hide defaults page (replaces right panel)
// ---------------------------------------------------------------------------
function showDefaultsPage() {
  showingDefaults = true;
  selectedIndex = -1;
  navDefaults.classList.add('active');
  editorEmpty.classList.add('hidden');
  editorForm.classList.add('hidden');
  defaultsPage.classList.remove('hidden');
  renderDefaultsPage();
  renderList(searchInput.value);
}

function hideDefaultsPage() {
  showingDefaults = false;
  navDefaults.classList.remove('active');
  defaultsPage.classList.add('hidden');
}

function renderDefaultsPage() {
  const prefix = data.prefix || '/';
  defaultsPageList.innerHTML = '';

  // Category label
  const catLabel = document.createElement('div');
  catLabel.className = 'defaults-category';
  catLabel.textContent = 'Date & Time';
  defaultsPageList.appendChild(catLabel);

  DEFAULT_SNIPPETS.forEach((snippet) => {
    const row = document.createElement('div');
    row.className = 'snippet-row';

    const liveValue = snippet.resolve();

    row.innerHTML = `
      <div class="snippet-info">
        <div class="snippet-name">${escHtml(snippet.title)}</div>
        <div class="snippet-desc">${escHtml(snippet.desc)} &mdash; ${escHtml(liveValue)}</div>
      </div>
      <div class="snippet-right">
        <span class="snippet-abbr">${escHtml(prefix + snippet.abbr)}</span>
        <svg class="snippet-lock" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      </div>
    `;
    defaultsPageList.appendChild(row);
  });
}

// ---------------------------------------------------------------------------
// Render user macro list
// ---------------------------------------------------------------------------
function renderList(filter = '') {
  const q = filter.toLowerCase();
  macroList.innerHTML = '';

  data.snippets.forEach((macro, i) => {
    const matchesFilter =
      !q ||
      macro.title.toLowerCase().includes(q) ||
      macro.abbr.toLowerCase().includes(q) ||
      stripHtml(macro.content).toLowerCase().includes(q);

    if (!matchesFilter) return;

    const li = document.createElement('li');
    li.className = 'macro-item' + (i === selectedIndex ? ' active' : '');

    const preview = stripHtml(macro.content).replace(/\n/g, ' ');
    if (preview.length > 0) {
      li.setAttribute('data-tooltip', preview.length > 60 ? preview.slice(0, 60) + '\u2026' : preview);
    }

    li.innerHTML = `
      <span class="macro-title">${escHtml(macro.title || 'Untitled')}</span>
      <span class="macro-abbr">${escHtml(data.prefix + macro.abbr)}</span>
    `;
    li.addEventListener('click', () => selectMacro(i));
    macroList.appendChild(li);
  });
}

// ---------------------------------------------------------------------------
// Select user macro
// ---------------------------------------------------------------------------
function selectMacro(index) {
  // If defaults page is showing, hide it first
  if (showingDefaults) hideDefaultsPage();

  selectedIndex = index;
  const macro = data.snippets[index];
  if (!macro) return showEmpty();

  editorEmpty.classList.add('hidden');
  editorForm.classList.remove('hidden');
  defaultsPage.classList.add('hidden');

  fieldTitle.value = macro.title;
  fieldAbbr.value = macro.abbr;
  fieldContent.innerHTML = macro.content;
  updatePrefixDisplay();
  updateEditorHeader();

  renderList(searchInput.value);
}

// ---------------------------------------------------------------------------
// Show empty state
// ---------------------------------------------------------------------------
function showEmpty() {
  selectedIndex = -1;
  editorEmpty.classList.remove('hidden');
  editorForm.classList.add('hidden');
  defaultsPage.classList.add('hidden');
  renderList(searchInput.value);
}

function updatePrefixDisplay() {
  const p = data.prefix || '/';
  prefixBadge.textContent = p;
  prefixKey.textContent = p;
}

function updateEditorHeader() {
  if (selectedIndex < 0) return;
  const title = fieldTitle.value.trim() || 'Untitled';
  const abbr = fieldAbbr.value.trim();
  editorHeading.textContent = title;
  editorSubtitle.textContent = (data.prefix || '/') + abbr;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
async function saveCurrent() {
  if (selectedIndex < 0) return;

  data.snippets[selectedIndex] = {
    title: fieldTitle.value.trim() || 'Untitled',
    abbr:  fieldAbbr.value.trim(),
    content: fieldContent.innerHTML,
  };

  await persist();
  updateEditorHeader();
  renderList(searchInput.value);
}

function requestDelete() {
  if (selectedIndex < 0) return;
  deleteModal.classList.remove('hidden');
}

async function confirmDelete() {
  deleteModal.classList.add('hidden');
  if (selectedIndex < 0) return;
  data.snippets.splice(selectedIndex, 1);
  await persist();
  showEmpty();
}

function cancelDelete() {
  deleteModal.classList.add('hidden');
}

function addNew() {
  if (showingDefaults) hideDefaultsPage();
  data.snippets.push({ title: '', abbr: '', content: '' });
  selectMacro(data.snippets.length - 1);
  fieldTitle.focus();
  renderList(searchInput.value);
}

async function persist() {
  await window.macroAPI.save(data);
}

// ---------------------------------------------------------------------------
// Copy button
// ---------------------------------------------------------------------------
function copyContent() {
  const text = stripHtml(fieldContent.innerHTML);
  navigator.clipboard.writeText(text).then(() => {
    btnCopy.classList.add('copied');
    btnCopy.querySelector('.copy-icon').textContent = '\u2713';
    btnCopy.setAttribute('data-tooltip', 'Copied!');

    setTimeout(() => {
      btnCopy.classList.remove('copied');
      btnCopy.querySelector('.copy-icon').textContent = '\u2398';
      btnCopy.setAttribute('data-tooltip', 'Copy');
    }, 1500);
  });
}

// ---------------------------------------------------------------------------
// Prefix change modal
// ---------------------------------------------------------------------------
function openPrefixModal() {
  prefixModal.classList.remove('hidden');
  document.addEventListener('keydown', handlePrefixKey);
}

function closePrefixModal() {
  prefixModal.classList.add('hidden');
  document.removeEventListener('keydown', handlePrefixKey);
}

function handlePrefixKey(e) {
  e.preventDefault();
  e.stopPropagation();

  if (e.key.length !== 1) return;
  if (/[a-zA-Z0-9]/.test(e.key)) return;

  data.prefix = e.key;
  updatePrefixDisplay();
  updateEditorHeader();
  persist();
  renderList(searchInput.value);
  if (showingDefaults) renderDefaultsPage();
  closePrefixModal();
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------
function applyTheme() {
  if (isDark) {
    document.body.classList.remove('light-mode');
    settingsThemeTgl.classList.add('on');
  } else {
    document.body.classList.add('light-mode');
    settingsThemeTgl.classList.remove('on');
  }
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

function toggleTheme() {
  isDark = !isDark;
  applyTheme();
}

function loadTheme() {
  const saved = localStorage.getItem('theme');
  isDark = saved !== 'light'; // default to dark if no preference saved
  applyTheme();
}

// ---------------------------------------------------------------------------
// Settings popover
// ---------------------------------------------------------------------------
function openSettings() {
  const rect = btnSettings.getBoundingClientRect();
  settingsPopover.style.left = rect.left + 'px';
  settingsPopover.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
  settingsPopover.classList.add('open');
  settingsOpen = true;
}

function closeSettings() {
  settingsPopover.classList.remove('open');
  settingsOpen = false;
}

// ---------------------------------------------------------------------------
// Listener status
// ---------------------------------------------------------------------------
async function checkListenerStatus() {
  try {
    const status = await window.macroAPI.getListenerStatus();
    const dot = listenerStatus.querySelector('.listener-dot');
    const label = listenerStatus.querySelector('.listener-label');
    if (status) {
      dot.style.background = 'var(--success)';
      label.textContent = 'Listener active';
    } else {
      dot.style.background = '#e0a030';
      label.textContent = 'Listener inactive';
    }
  } catch {
    // API not available (e.g. running outside Electron)
  }
}

// ---------------------------------------------------------------------------
// Live header update while typing
// ---------------------------------------------------------------------------
fieldTitle.addEventListener('input', updateEditorHeader);
fieldAbbr.addEventListener('input', updateEditorHeader);

// ---------------------------------------------------------------------------
// Toolbar (bold / italic / underline)
// ---------------------------------------------------------------------------
document.querySelectorAll('.tool-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.execCommand(btn.dataset.cmd, false, null);
    fieldContent.focus();
  });
});

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------
searchInput.addEventListener('input', () => renderList(searchInput.value));
btnNew.addEventListener('click', addNew);
btnSave.addEventListener('click', saveCurrent);
btnDelete.addEventListener('click', requestDelete);
btnCopy.addEventListener('click', copyContent);
deleteConfirm.addEventListener('click', confirmDelete);
deleteCancel.addEventListener('click', cancelDelete);

// Settings popover
btnSettings.addEventListener('click', (e) => {
  e.stopPropagation();
  if (settingsOpen) closeSettings(); else openSettings();
});

settingsThemeTgl.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleTheme();
});

// Close settings on outside click
document.addEventListener('click', (e) => {
  if (settingsOpen && !settingsPopover.contains(e.target) && e.target !== btnSettings) {
    closeSettings();
  }
});

// Default Snippets toggle
navDefaults.addEventListener('click', () => {
  if (showingDefaults) {
    hideDefaultsPage();
    showEmpty();
  } else {
    showDefaultsPage();
  }
});

// Prefix button + modal
document.getElementById('btn-prefix').addEventListener('click', openPrefixModal);
prefixCancel.addEventListener('click', closePrefixModal);

// Close modals on overlay click
prefixModal.addEventListener('click', (e) => { if (e.target === prefixModal) closePrefixModal(); });
deleteModal.addEventListener('click', (e) => { if (e.target === deleteModal) cancelDelete(); });

// Close modals / settings on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (settingsOpen) closeSettings();
    if (!prefixModal.classList.contains('hidden')) closePrefixModal();
    if (!deleteModal.classList.contains('hidden')) cancelDelete();
  }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (!prefixModal.classList.contains('hidden')) return;

  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault();
    saveCurrent();
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
    e.preventDefault();
    addNew();
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function stripHtml(html) {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.textContent || d.innerText || '';
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
(async () => {
  // Apply platform class before first paint to avoid layout shift
  if (window.macroAPI.platform !== 'darwin') {
    document.body.classList.add('windows');
  }

  loadTheme();
  data = await window.macroAPI.load();
  updatePrefixDisplay();
  renderList();
  checkListenerStatus();
  setInterval(checkListenerStatus, 5000);

  // Version from main process
  try {
    const v = await window.macroAPI.version();
    settingsVersion.textContent = `Macro Manager v${v}`;
  } catch { /* fallback already set in HTML */ }
})();
