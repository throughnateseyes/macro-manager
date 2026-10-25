// Browser-only stand-in for preload.js so the renderer can be previewed
// without Electron:  python3 -m http.server 5180  →  /dev/preview.html
// Add ?platform=win32 to preview the Windows layout, ?empty to start blank.
(() => {
  const params = new URLSearchParams(location.search);
  // ?solid — no native vibrancy in a browser, so paint the sidebar.
  if (params.has('solid')) document.addEventListener('DOMContentLoaded', () => document.body.classList.add('solid'));
  const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const snippets = params.has('empty') ? [] : [
    { title: 'Email Signature', abbr: 'sig', content: 'Best,\nNate Ziehn\nBrick + Timber', pinned: true },
    { title: 'Follow-up', abbr: 'fu', content: 'Hi {cursor}, just following up on my last note. Let me know if you have any questions!' },
    { title: 'Office Address', abbr: 'addr', content: '123 Market St, Suite 400\nSan Francisco, CA 94103', folder: 'Leasing' },
    { title: 'Tour Confirmation', abbr: 'tour', content: 'Thanks for scheduling a tour on {date+2}! Parking is available on the street.', folder: 'Leasing', pinned: true },
    { title: 'Application Received', abbr: 'app', content: 'We received your application on {date} and will be in touch within 2 business days.', folder: 'Leasing' },
    { title: 'Zoom Link', abbr: 'zoom', content: 'https://zoom.us/j/1234567890' },
    { title: 'Maintenance Reply', abbr: 'mr', content: 'Thanks for letting us know — a technician will reach out to schedule a visit.', folder: 'Residents' },
  ];
  const usage = params.has('empty') ? {} : { sig: 342, fu: 231, addr: 112, tour: 458, app: 77, zoom: 41, mr: 196 };

  // Fake ~20 weeks of history with weekday-heavy usage.
  const days = {};
  const abbrs = Object.keys(usage);
  if (!params.has('empty')) {
    const d = new Date();
    for (let i = 0; i < 140; i++) {
      const weekend = d.getDay() === 0 || d.getDay() === 6;
      const total = weekend ? (i % 3 === 0 ? 2 : 0) : Math.round(4 + ((i * 37) % 19) + (i < 30 ? 6 : 0));
      if (total) {
        const macros = {};
        for (let j = 0; j < total; j++) { const a = abbrs[(i + j * 3) % abbrs.length]; macros[a] = (macros[a] || 0) + 1; }
        days[dayKey(d)] = { total, macros };
      }
      d.setDate(d.getDate() - 1);
    }
  }
  const stats = { lifetime: params.has('empty') ? 0 : 1457, charsSaved: params.has('empty') ? 0 : 118400, since: '2026-04-11', days };

  const BUILT_INS = [
    { abbr: 'ts', title: 'Full Timestamp', desc: 'Month D, YYYY H:MM AM/PM' },
    { abbr: 'date', title: 'Short Date', desc: 'MM/DD/YYYY' },
    { abbr: 'isodate', title: 'ISO Date', desc: 'YYYY-MM-DD' },
    { abbr: 'time', title: 'Time', desc: '12-hour time' },
    { abbr: 'time24', title: '24-hour Time', desc: 'HH:MM:SS' },
    { abbr: 'day', title: 'Day + Date', desc: 'Weekday, Month Day' },
    { abbr: 'unix', title: 'Unix Timestamp', desc: 'Seconds since 1970' },
  ];
  const TOKENS = [
    { token: '{cursor}', label: 'Cursor position', desc: 'Where the cursor lands after expanding' },
    { token: '{clipboard}', label: 'Clipboard', desc: 'Whatever you last copied' },
    { token: '{date}', label: 'Date', desc: 'MM/DD/YYYY' },
    { token: '{date+7}', label: 'Date in 7 days', desc: 'Change the number for any offset' },
    { token: '{time}', label: 'Time', desc: '12-hour time' },
  ];

  const fmtDate = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
  function preview(content) {
    let cursorAt = -1;
    const out = content.replace(/\{(cursor|clipboard|date(?:[+-]\d+)?|ts|isodate|time24|time|day|unix)\}/g, (_m, t, off, str) => {
      if (t === 'cursor') { cursorAt = off; return ''; }
      if (t === 'clipboard') return '[clipboard]';
      const d = new Date();
      if (t.startsWith('date') && t.length > 4) d.setDate(d.getDate() + Number(t.slice(4)));
      if (t.startsWith('date')) return fmtDate(d);
      if (t === 'isodate') return d.toISOString().slice(0, 10);
      if (t.startsWith('time')) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      if (t === 'unix') return String(Math.floor(Date.now() / 1000));
      return d.toLocaleString();
    });
    return { text: out, cursorBack: cursorAt === -1 ? 0 : out.length - cursorAt };
  }

  let data = { prefix: '/', snippets };
  let settings = {
    theme: 'system', paused: false, launchAtLogin: true, shortcutErrors: {},
    quickInsertShortcut: params.get('platform') === 'win32' ? 'Control+Alt+Space' : 'Command+Shift+Space',
    openWindowShortcut: params.get('platform') === 'win32' ? 'Control+Alt+M' : 'Command+Shift+M',
  };
  const noop = () => () => {};
  window.macroAPI = {
    getState: async () => ({
      macros: data, usage, stats, today: dayKey(new Date()), settings,
      version: '2.0.0', platform: params.get('platform') || 'darwin',
      dataPath: params.get('platform') === 'win32' ? 'C:\\Users\\you\\AppData\\Roaming\\macro-manager\\macros.json' : '~/Library/Application Support/macro-manager/macros.json',
      accessibility: !params.has('noax'), update: { status: params.get('update') || 'idle', version: '2.0.1', percent: 40 },
      builtIns: BUILT_INS, tokens: TOKENS,
    }),
    saveMacros: async (d) => { data = JSON.parse(JSON.stringify(d)); return data; },
    confirmDelete: async (t) => confirm(`Delete “${t}”?`),
    renameUsage: async () => usage,
    deleteUsage: async () => usage,
    previewTemplate: async (c) => preview(c),
    setSettings: async (p) => { if (!('__suspendShortcuts' in p)) settings = { ...settings, ...p }; return settings; },
    exportMacros: async () => ({ ok: true, count: data.snippets.length }),
    importMacros: async () => ({ ok: false }),
    openDataFolder: async () => {}, openReleases: async () => {},
    checkForUpdates: async () => {}, installUpdate: async () => {},
    requestAccessibility: async () => true, showPalette: async () => {},
    paletteInsert: async () => {}, paletteClose: async () => {}, paletteCopied: async () => {}, paletteOpenMacro: async () => {},
    onMacrosChanged: noop, onStatsChanged: noop, onSettingsChanged: noop, onUpdateState: noop,
    onNavigate: noop, onAccessibility: noop,
    onPaletteOpen: (cb) => { setTimeout(() => cb({ mode: params.get('mode') || 'insert' }), 50); return () => {}; },
  };
})();
