// ---------------------------------------------------------------------------
// What's new — shown once after an update that has notes
//
// People get updates silently in the background, so the first time they open
// the app afterwards it tells them what changed, especially anything that
// moved (a shortcut). Keyed by major.minor: patch releases don't interrupt.
// Fresh installs skip it (nothing to compare against); Settings → About
// reopens it any time.
//
// Loaded before app.js; reads its globals at call time.
// ---------------------------------------------------------------------------
const SEEN_KEY = 'whatsNewSeen';

const RELEASE_NOTES = {
  '2.2': () => [
    { tile: 'bold', title: 'Formatting that survives the paste', text: `Bold, italics, links and lists now land formatted in Outlook, Zendesk, Gmail and Teams, and as clean text everywhere else. Set a macro’s Format to Formatted, or press ${MOD()}B in it.` },
    { tile: 'field', title: 'Fill-in fields', text: 'Add a field for a name, a unit or anything that changes. When the macro expands, a small window asks for it, with defaults and pick-lists. Macros without fields work exactly as before.' },
  ],
  '2.1': () => {
    const qi = prettyAccel(state.settings.quickInsertShortcut);
    const open = prettyAccel(state.settings.openWindowShortcut);
    return [
      { tile: 'search', title: 'Quick Insert, everywhere', text: `Press ${qi} in any app to search your macros and paste one. The search box in Macro Manager opens it too.` },
      ...(IS_MAC() ? [] : [{ tile: 'keys', title: 'A new shortcut to open Macro Manager', text: `It’s now ${open}. The old Ctrl + Shift + M also muted Microsoft Teams.` }]),
      { tile: 'pin', title: 'Pin your favorites', text: 'Right-click any macro to pin it. Pinned macros stay at the top of the list, in Quick Insert and in the tray.' },
      { tile: 'sky', title: 'Your day at a glance', text: 'The Overview shows today’s count, your streak and the typing you’ve saved. The sky fills in as you go.' },
      { tile: 'braces', title: 'Smarter macros', text: 'Add today’s date, a date next week, your clipboard, or where the cursor should land. Look for Insert in the editor, then try it right below.' },
      { tile: 'undo', title: 'Nothing gets lost', text: 'Deleted something by mistake? Undo it. Your macros are also backed up every day for two weeks.' },
    ];
  },
};

const NOTE_TILES = {
  search: ['#4aa3ff', '#0a6cf0', '<circle cx="9" cy="9" r="3.6" fill="none" stroke="#fff" stroke-width="1.8"/><path d="m11.8 11.8 3 3" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>'],
  keys: ['#a1a1a8', '#6c6c72', '<rect x="4" y="6" width="12" height="8" rx="2" fill="none" stroke="#fff" stroke-width="1.6"/><path d="M7 10h6" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>'],
  pin: ['#ffb340', '#ff8a00', '<path d="M7.5 4.5h5M8.3 4.5v3.6L6.4 10.4v1h7.2v-1L11.7 8.1V4.5Z" fill="#fff"/><path d="M10 11.4v4.1" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>'],
  sky: ['#4aa3ff', '#0a6cf0', '<path fill="#fff" d="M6.2 14.2a3 3 0 0 1-.4-5.97 4.2 4.2 0 0 1 8.05.86A2.6 2.6 0 0 1 13.9 14.2Z"/>'],
  braces: ['#8f8bff', '#5b55e8', '<path d="M8 5c-1.4 0-1.8.6-1.8 1.8v1.4c0 .8-.4 1.3-1.2 1.8.8.5 1.2 1 1.2 1.8v1.4c0 1.2.4 1.8 1.8 1.8M12 5c1.4 0 1.8.6 1.8 1.8v1.4c0 .8.4 1.3 1.2 1.8-.8.5-1.2 1-1.2 1.8v1.4c0 1.2-.4 1.8-1.8 1.8" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>'],
  bold: ['#4aa3ff', '#0a6cf0', '<path d="M7 5h3.6a2.4 2.4 0 0 1 0 4.8H7zM7 9.8h4.1a2.6 2.6 0 0 1 0 5.2H7z" fill="none" stroke="#fff" stroke-width="1.9" stroke-linejoin="round"/>'],
  field: ['#8f8bff', '#5b55e8', '<rect x="4" y="6.5" width="12" height="7" rx="2" fill="none" stroke="#fff" stroke-width="1.6"/><path d="M8 8.5v3" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>'],
  undo: ['#34c759', '#1f9e45', '<path d="M7.5 8.5H12a3 3 0 0 1 0 6H9" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/><path d="m9.5 6-2.5 2.5L9.5 11" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>'],
};

function noteTile(kind) {
  const [top, bottom, glyph] = NOTE_TILES[kind] || NOTE_TILES.sky;
  const id = `wn-${kind}`;
  return `<svg class="tile" viewBox="0 0 20 20" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs><rect width="20" height="20" rx="5.2" fill="url(#${id})"/>${glyph}</svg>`;
}

const minorOf = (v) => String(v || '').split('.').slice(0, 2).join('.');

function showWhatsNew(version = state.version) {
  const notes = RELEASE_NOTES[minorOf(version)];
  if (!notes) return false;
  const mask = skyMask(0.6);
  const sheet = h(`
    <div class="sheet-backdrop" role="dialog" aria-modal="true" aria-labelledby="wn-title">
      <div class="sheet whatsnew">
        <div class="wn-sky"><div class="sky-drift${REDUCED_MOTION() ? ' still' : ''}" style="--sky-mask:url(${mask}); --sky-w:${SKY_W}px"></div>
          <div class="wn-head">
            <p>Version ${esc(minorOf(version))}</p>
            <h2 id="wn-title">What’s new in Macro Manager</h2>
          </div>
        </div>
        <ul class="wn-list">
          ${notes().map((n) => `<li>${noteTile(n.tile)}<div><strong>${esc(n.title)}</strong><span>${esc(n.text)}</span></div></li>`).join('')}
        </ul>
        <div class="sheet-actions"><button class="btn primary" data-close>Got it</button></div>
      </div>
    </div>`);
  const close = () => sheet.remove();
  sheet.querySelector('[data-close]').addEventListener('click', close);
  sheet.addEventListener('mousedown', (e) => { if (e.target === sheet) close(); });
  sheet.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  document.body.append(sheet);
  sheet.querySelector('[data-close]').focus();
  return true;
}

// Called once at startup.
function maybeShowWhatsNew() {
  let seen = null;
  try { seen = localStorage.getItem(SEEN_KEY); } catch { /* storage unavailable */ }
  const current = minorOf(state.version);
  try { localStorage.setItem(SEEN_KEY, current); } catch { /* not remembered */ }
  if (seen === current) return;
  // No record and no macros: a fresh install, not an update.
  if (seen === null && !state.macros.snippets.length) return;
  showWhatsNew();
}
