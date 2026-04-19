// ---------------------------------------------------------------------------
// Default snippets — date & time, dynamically generated at render/expansion
// ---------------------------------------------------------------------------
const DEFAULT_SNIPPETS = [
  {
    title: 'Full Timestamp',
    abbr: 'ts',
    desc: 'Month D, YYYY H:MM AM/PM',
    resolve: () => {
      const d = new Date();
      const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      let h = d.getHours(), ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} ${h}:${String(d.getMinutes()).padStart(2,'0')} ${ampm}`;
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
    title: 'Time',
    abbr: 'time',
    desc: '12-hour time',
    resolve: () => {
      const d = new Date();
      let h = d.getHours(), ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      return `${h}:${String(d.getMinutes()).padStart(2,'0')} ${ampm}`;
    },
  },
  {
    title: '24hr Time',
    abbr: 'time24',
    desc: '24-hour time',
    resolve: () => {
      const d = new Date();
      return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
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

// Shared JS-driven tooltip — one element reused for all macro list items
const tooltip = document.createElement('div');
tooltip.className = 'macro-preview-tooltip';
document.body.appendChild(tooltip);

// Global cursor-following logic for the shared tooltip
// When tooltip.dataset.fixed is set, positioning is handled by the caller instead
document.addEventListener('mousemove', (e) => {
  if (!tooltip.classList.contains('visible')) return;
  if (tooltip.dataset.fixed) return;
  const margin = 12;
  let x = e.clientX + 16;
  let y = e.clientY - 8;
  // Clamp so it never escapes the viewport
  const tw = tooltip.offsetWidth;
  const th = tooltip.offsetHeight;
  if (x + tw > window.innerWidth  - margin) x = e.clientX - tw - 16;
  if (y - th < margin)                       y = e.clientY + 24;
  tooltip.style.left      = x + 'px';
  tooltip.style.top       = y + 'px';
  tooltip.style.transform = 'translateY(-100%)';
});

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
const btnHome           = document.getElementById('btn-home');
const btnHomeDefaults   = document.getElementById('btn-home-defaults');
const btnSave           = document.getElementById('btn-save');
const btnDelete         = document.getElementById('btn-delete');
const btnCopy           = document.getElementById('btn-copy');
const btnSettings       = document.getElementById('btn-settings');
const settingsPopover   = document.getElementById('settings-popover');
const settingsThemeTgl  = document.getElementById('settings-theme-toggle');
const settingsVersion   = document.getElementById('settings-version');
const btnExport         = document.getElementById('btn-export');
const btnExportLabel    = document.getElementById('btn-export-label');
const btnImport         = document.getElementById('btn-import');
const btnImportLabel    = document.getElementById('btn-import-label');
const navDefaults       = document.getElementById('nav-defaults');

// Modals
const prefixModal   = document.getElementById('prefix-modal');
const prefixCancel  = document.getElementById('prefix-cancel');
const deleteModal   = document.getElementById('delete-modal');
const deleteConfirm = document.getElementById('delete-confirm');
const deleteCancel  = document.getElementById('delete-cancel');

// ---------------------------------------------------------------------------
// Home button visibility
// ---------------------------------------------------------------------------
function setHomeButtonVisible(visible) {
  [btnHome, btnHomeDefaults].forEach((btn) => {
    if (!btn) return;
    if (visible) btn.classList.remove('hidden');
    else         btn.classList.add('hidden');
  });
}

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
  setHomeButtonVisible(true);
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
  catLabel.textContent = 'Date & Time'; // intentional mixed-case section label
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

  // Update section label — filtered count when searching, total otherwise
  let visibleCount = 0;
  data.snippets.forEach((macro) => {
    const matches =
      !q ||
      macro.title.toLowerCase().includes(q) ||
      macro.abbr.toLowerCase().includes(q) ||
      stripHtml(macro.content).toLowerCase().includes(q);
    if (matches) visibleCount++;
  });
  const sectionLabel = document.querySelector('.section-label');
  if (sectionLabel) {
    sectionLabel.textContent = q
      ? `My Macros · ${visibleCount} of ${data.snippets.length}`
      : `My Macros · ${data.snippets.length}`;
  }

  data.snippets.forEach((macro, i) => {
    const matchesFilter =
      !q ||
      macro.title.toLowerCase().includes(q) ||
      macro.abbr.toLowerCase().includes(q) ||
      stripHtml(macro.content).toLowerCase().includes(q);

    if (!matchesFilter) return;

    const preview = stripHtml(macro.content).replace(/\n/g, ' ').trim();
    const tooltipText = preview.length > 80
      ? preview.slice(0, 80) + '\u2026'
      : preview;

    const li = document.createElement('li');
    li.className = 'macro-item' + (i === selectedIndex ? ' active' : '');
    li.innerHTML = `
      <span class="macro-title">${escHtml(macro.title || 'Untitled')}</span>
      <span class="macro-abbr">${escHtml(data.prefix + macro.abbr)}</span>
    `;

    if (tooltipText) {
      li.addEventListener('mouseenter', () => {
        tooltip.textContent = tooltipText;
        tooltip.classList.add('visible');
      });
      li.addEventListener('mouseleave', () => {
        tooltip.classList.remove('visible');
      });
    }

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
  setHomeButtonVisible(true);

  fieldTitle.value = macro.title;
  fieldAbbr.value = macro.abbr;
  fieldContent.innerHTML = macro.content;
  updatePrefixDisplay();
  updateEditorHeader();

  renderList(searchInput.value);
}

// ---------------------------------------------------------------------------
// Show empty state (home screen)
// ---------------------------------------------------------------------------
function showEmpty() {
  selectedIndex = -1;
  editorEmpty.classList.remove('hidden');
  editorForm.classList.add('hidden');
  defaultsPage.classList.add('hidden');
  setHomeButtonVisible(false);
  renderList(searchInput.value);
  renderHomeScreen();
}

// ---------------------------------------------------------------------------
// Home screen
// ---------------------------------------------------------------------------
async function renderHomeScreen() {
  // Workspace header
  document.getElementById('home-date').textContent = 'Your Workspace';

  // Usage data
  let usage = {};
  try { usage = await window.macroAPI.getUsage(); } catch { /* not in Electron */ }

  // Card 1 — Times Expanded
  const totalExp = Object.values(usage).reduce((sum, n) => sum + n, 0);
  document.getElementById('stat-expansions').textContent = totalExp.toLocaleString();

  // Card 2 — Most Used (prefix + abbr)
  let topAbbr = null, topCount = 0;
  for (const [abbr, count] of Object.entries(usage)) {
    if (count > topCount) { topCount = count; topAbbr = abbr; }
  }
  const topMacro = topAbbr ? data.snippets.find((s) => s.abbr === topAbbr) : null;
  document.getElementById('stat-top-name').textContent = topMacro
    ? (data.prefix || '/') + topMacro.abbr
    : '—';

  // Card 3 — Time Saved (30 sec per expansion)
  const savedSeconds = totalExp * 30;
  const savedMinutes = savedSeconds / 60;
  let timeSavedText;
  if (savedMinutes < 60) {
    timeSavedText = Math.round(savedMinutes) + ' min';
  } else {
    timeSavedText = (savedMinutes / 60).toFixed(1) + ' hrs';
  }
  document.getElementById('stat-time-saved').textContent = totalExp > 0 ? timeSavedText : '—';

  // Donut chart
  renderDonutChart(usage, data.snippets);

  // Quick access cards: /ts, /date, /time
  const quickRow = document.getElementById('home-quick-row');
  quickRow.innerHTML = '';
  ['ts', 'date', 'time'].forEach((abbr) => {
    const snippet = DEFAULT_SNIPPETS.find((s) => s.abbr === abbr);
    if (!snippet) return;
    const value = snippet.resolve();
    const card = document.createElement('button');
    card.className = 'quick-card';
    card.innerHTML = `
      <div class="quick-card-label">${escHtml((data.prefix || '/') + abbr)}</div>
      <div class="quick-card-value">${escHtml(value)}</div>
    `;
    card.addEventListener('click', () => {
      navigator.clipboard.writeText(value).then(() => {
        card.classList.add('copied');
        setTimeout(() => card.classList.remove('copied'), 1200);
      });
    });

    card.addEventListener('mouseenter', () => {
      tooltip.textContent = snippet.resolve();
      tooltip.classList.add('visible');
    });
    card.addEventListener('mouseleave', () => tooltip.classList.remove('visible'));

    quickRow.appendChild(card);
  });
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
    content: fieldContent.innerText || fieldContent.textContent,
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
const COPY_ICON_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M17 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>';
const CHECK_ICON_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

function copyContent() {
  const text = stripHtml(fieldContent.innerHTML);
  navigator.clipboard.writeText(text).then(() => {
    btnCopy.classList.add('copied');
    btnCopy.querySelector('.copy-icon').innerHTML = CHECK_ICON_SVG;
    btnCopy.querySelector('.copy-label').textContent = 'Copied!';

    setTimeout(() => {
      btnCopy.classList.remove('copied');
      btnCopy.querySelector('.copy-icon').innerHTML = COPY_ICON_SVG;
      btnCopy.querySelector('.copy-label').textContent = 'Copy';
    }, 1500);
  });
}

// ---------------------------------------------------------------------------
// Prefix change modal
// ---------------------------------------------------------------------------
function openPrefixModal() {
  document.getElementById('modal-prefix-display').textContent = data.prefix || '/';
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

  // Show the new prefix in the badge before closing
  document.getElementById('modal-prefix-display').textContent = e.key;

  data.prefix = e.key;
  updatePrefixDisplay();
  updateEditorHeader();
  persist();
  renderList(searchInput.value);
  if (showingDefaults) renderDefaultsPage();

  // Brief pause so the badge update is visible before the modal exits
  setTimeout(closePrefixModal, 160);
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

// Export / Import
function flashSettingsBtn(btn, labelEl, message, isError = false) {
  const original = labelEl.textContent;
  btn.classList.add(isError ? 'error' : 'success');
  labelEl.textContent = message;
  setTimeout(() => {
    btn.classList.remove('error', 'success');
    labelEl.textContent = original;
  }, 2500);
}

btnExport.addEventListener('click', async (e) => {
  e.stopPropagation();
  const result = await window.macroAPI.exportMacros();
  if (result.ok) {
    flashSettingsBtn(btnExport, btnExportLabel, 'Exported!');
  } else if (result.error) {
    flashSettingsBtn(btnExport, btnExportLabel, 'Export failed', true);
  }
  // canceled: do nothing
});

btnImport.addEventListener('click', async (e) => {
  e.stopPropagation();
  const result = await window.macroAPI.importMacros();
  if (result.ok) {
    // Refresh local data and re-render immediately
    data = result.data;
    renderList(searchInput.value);
    renderHomeScreen();
    const msg = result.added === 1 ? 'Imported 1 macro!' : `Imported ${result.added} macros!`;
    flashSettingsBtn(btnImport, btnImportLabel, msg);
  } else if (result.error) {
    flashSettingsBtn(btnImport, btnImportLabel, result.error.slice(0, 32), true);
  }
  // canceled: do nothing
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

// Home buttons
btnHome.addEventListener('click', () => showEmpty());
if (btnHomeDefaults) btnHomeDefaults.addEventListener('click', () => showEmpty());

// Close modals / settings on Escape; navigate home if on a sub-page
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    // Modals and popovers take priority
    if (settingsOpen) { closeSettings(); return; }
    if (!prefixModal.classList.contains('hidden')) { closePrefixModal(); return; }
    if (!deleteModal.classList.contains('hidden')) { cancelDelete(); return; }
    // Navigate home if a macro or defaults page is showing
    if (!editorForm.classList.contains('hidden') || !defaultsPage.classList.contains('hidden')) {
      showEmpty();
    }
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
// Donut chart
// ---------------------------------------------------------------------------
function describeArc(cx, cy, outerR, innerR, startAngle, endAngle) {
  const toRad = (deg) => (deg - 90) * Math.PI / 180;
  const s = toRad(startAngle);
  const e = toRad(endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  const p = (n) => n.toFixed(3);
  const ox1 = cx + outerR * Math.cos(s), oy1 = cy + outerR * Math.sin(s);
  const ox2 = cx + outerR * Math.cos(e), oy2 = cy + outerR * Math.sin(e);
  const ix1 = cx + innerR * Math.cos(s), iy1 = cy + innerR * Math.sin(s);
  const ix2 = cx + innerR * Math.cos(e), iy2 = cy + innerR * Math.sin(e);
  return `M ${p(ox1)} ${p(oy1)} A ${outerR} ${outerR} 0 ${largeArc} 1 ${p(ox2)} ${p(oy2)} L ${p(ix2)} ${p(iy2)} A ${innerR} ${innerR} 0 ${largeArc} 0 ${p(ix1)} ${p(iy1)} Z`;
}

function renderDonutChart(usage, snippets) {
  const container = document.getElementById('home-top-macros');
  container.innerHTML = '';

  const COLORS = ['#5c5fef', '#4caf82', '#f59e0b', '#8b5cf6', '#ef4444', '#6b7280'];
  const NS = 'http://www.w3.org/2000/svg';
  const CX = 100, CY = 100, OR = 88, IR = 55, GAP = 2; // IR = 62% of OR

  const allSorted = Object.entries(usage).sort(([, a], [, b]) => b - a);
  const total = allSorted.reduce((s, [, n]) => s + n, 0);

  // Empty state
  if (total === 0) {
    const card = document.createElement('div');
    card.className = 'donut-wrapper donut-empty-state';
    // Ghost ring: midpoint radius = (88+55)/2 = 71.5, thickness = 33
    card.innerHTML = `
      <svg width="200" height="200" viewBox="0 0 200 200" class="donut-svg">
        <circle cx="100" cy="100" r="71.5" fill="none" stroke="currentColor"
          stroke-width="33" stroke-dasharray="6 5" opacity="0.12"/>
      </svg>
      <p class="donut-empty-text">Start using macros to see your stats here</p>
    `;
    container.appendChild(card);
    return;
  }

  const top5 = allSorted.slice(0, 5);
  const restCount = allSorted.slice(5).reduce((s, [, n]) => s + n, 0);
  const segments = top5.map(([abbr, count], i) => {
    const macro = snippets.find((s) => s.abbr === abbr);
    const pct   = Math.round((count / total) * 100);
    return { abbr, count, pct, macro, color: COLORS[i], title: macro ? (macro.title || abbr) : abbr };
  });
  if (restCount > 0) {
    const pct = Math.round((restCount / total) * 100);
    segments.push({ abbr: null, count: restCount, pct, macro: null, color: COLORS[5], title: 'Other' });
  }

  // Wrapper card
  const wrapper = document.createElement('div');
  wrapper.className = 'donut-wrapper';

  // SVG
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 200 200');
  svg.setAttribute('width', '200');
  svg.setAttribute('height', '200');
  svg.classList.add('donut-svg');

  // Center text — 3 lines: top (title), mid (abbr/count), bot (label/pct)
  const mkText = (x, y, cls) => {
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', String(x));
    t.setAttribute('y', String(y));
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('dominant-baseline', 'middle');
    t.classList.add(cls);
    return t;
  };
  const centerTop = mkText(100, 84,  'donut-center-top');
  const centerMid = mkText(100, 97,  'donut-center-mid');
  const centerBot = mkText(100, 111, 'donut-center-bot');

  const resetCenter = () => {
    centerTop.textContent = '';
    centerMid.setAttribute('y', '97');
    centerMid.style.fill = '';
    centerMid.textContent = total.toLocaleString();
    centerBot.setAttribute('y', '111');
    centerBot.textContent = 'expansions';
  };
  resetCenter();

  const setHoverCenter = (seg) => {
    const prefix    = data.prefix || '/';
    const abbrLabel = seg.abbr ? prefix + seg.abbr : 'Other';
    const showTitle = seg.abbr && seg.title && seg.title.length <= 10;
    if (showTitle) {
      centerTop.textContent = seg.title;
      centerMid.setAttribute('y', '99');
      centerBot.setAttribute('y', '113');
    } else {
      centerTop.textContent = '';
      centerMid.setAttribute('y', '97');
      centerBot.setAttribute('y', '111');
    }
    centerMid.style.fill = '#5c5fef';
    centerMid.textContent = abbrLabel;
    centerBot.textContent = seg.pct + '%';
  };

  // Shared helpers
  const highlightSegs = (i) => {
    pathEls.forEach((p, j) => {
      p.style.opacity   = j === i ? '1' : '0.3';
      p.style.transform = j === i ? 'scale(1.05)' : 'scale(1)';
    });
  };
  const resetSegs = () => {
    pathEls.forEach((p) => { p.style.opacity = '1'; p.style.transform = 'scale(1)'; });
  };

  // Build segments
  const pathEls = [];
  let startAngle = 0;
  const numSegs = segments.length;

  segments.forEach((seg, i) => {
    const sliceDeg = (seg.count / total) * 360;
    const halfGap  = numSegs > 1 ? GAP / 2 : 0;
    const arcStart = startAngle + halfGap;
    const arcEnd   = startAngle + sliceDeg - halfGap;
    startAngle += sliceDeg;

    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', describeArc(CX, CY, OR, IR, arcStart, arcEnd));
    path.setAttribute('fill', seg.color);
    path.style.transformOrigin = '100px 100px';
    path.style.transition = 'opacity 180ms ease, transform 180ms ease';
    path.style.animation  = `donutIn 420ms cubic-bezier(.34,1.26,.64,1) ${i * 70}ms both`;
    if (seg.macro) path.style.cursor = 'pointer';

    // Segment hover: update center only — no tooltip
    path.addEventListener('mouseenter', () => { highlightSegs(i); setHoverCenter(seg); });
    path.addEventListener('mouseleave', () => { resetSegs(); resetCenter(); });

    if (seg.macro) {
      path.addEventListener('click', () => {
        const idx = snippets.findIndex((s) => s.abbr === seg.abbr);
        if (idx !== -1) selectMacro(idx);
      });
    }

    svg.appendChild(path);
    pathEls.push(path);
  });

  svg.appendChild(centerTop);
  svg.appendChild(centerMid);
  svg.appendChild(centerBot);

  // Legend
  const legend = document.createElement('div');
  legend.className = 'donut-legend';

  segments.forEach((seg, i) => {
    const item = document.createElement('div');
    item.className = 'donut-legend-item' + (seg.macro ? ' donut-legend-item--clickable' : '');
    item.innerHTML = `
      <span class="donut-legend-pct" style="color:${seg.color}">${seg.pct}%</span>
      <span class="donut-legend-dot" style="background:${seg.color}"></span>
      <span class="donut-legend-title">${escHtml(seg.title)}</span>
      <span class="donut-legend-count">${seg.count}</span>
    `;

    item.addEventListener('mouseenter', () => {
      highlightSegs(i);
      setHoverCenter(seg);
      // Tooltip above the row — fixed positioning (not cursor-following)
      if (seg.macro && seg.macro.content) {
        const preview = stripHtml(seg.macro.content).replace(/\n/g, ' ').trim();
        const text = preview.length > 80 ? preview.slice(0, 80) + '\u2026' : preview;
        if (text) {
          tooltip.textContent = text;
          tooltip.dataset.fixed = '1';
          const rect = item.getBoundingClientRect();
          tooltip.style.top       = (rect.top - 12) + 'px';
          tooltip.style.left      = (rect.left + rect.width / 2) + 'px';
          tooltip.style.transform = 'translate(-50%, -100%)';
          tooltip.classList.add('visible');
        }
      }
    });
    item.addEventListener('mouseleave', () => {
      resetSegs();
      resetCenter();
      tooltip.classList.remove('visible');
      delete tooltip.dataset.fixed;
      tooltip.style.transform = '';
    });
    if (seg.macro) {
      item.addEventListener('click', () => {
        const idx = snippets.findIndex((s) => s.abbr === seg.abbr);
        if (idx !== -1) selectMacro(idx);
      });
    }
    legend.appendChild(item);
  });

  const chartArea = document.createElement('div');
  chartArea.className = 'donut-chart-area';
  chartArea.appendChild(svg);
  wrapper.appendChild(chartArea);
  wrapper.appendChild(legend);
  container.appendChild(wrapper);
}

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

  // Home screen — render after data is loaded
  renderHomeScreen();

  // Settings: name input
  const nameInput = document.getElementById('settings-name-input');
  if (nameInput) {
    nameInput.value = localStorage.getItem('userName') || '';
    nameInput.addEventListener('input', () => {
      const val = nameInput.value.trim();
      if (val) localStorage.setItem('userName', val);
      else localStorage.removeItem('userName');
    });
  }

  // Version from main process
  try {
    const v = await window.macroAPI.version();
    settingsVersion.textContent = `Macro Manager v${v}`;
  } catch { /* fallback already set in HTML */ }

  // Auto-update notifications
  function showUpdateBanner(message, showRestart) {
    // Remove any existing banner first
    document.querySelector('.update-banner')?.remove();

    const banner = document.createElement('div');
    banner.className = 'update-banner';
    banner.innerHTML = `
      <span>${message}</span>
      ${showRestart ? '<button id="restart-btn">Restart Now</button>' : ''}
    `;
    document.body.appendChild(banner);

    if (showRestart) {
      document.getElementById('restart-btn').addEventListener('click', () => {
        window.macroAPI.installUpdate();
      });
    }
  }

  window.macroAPI.onUpdateAvailable((version) => {
    showUpdateBanner(`Update v${version} downloading...`, false);
  });

  window.macroAPI.onUpdateDownloaded((version) => {
    showUpdateBanner(`v${version} ready \u2014 restart to update`, true);
  });
})();
