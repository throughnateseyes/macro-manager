// ---------------------------------------------------------------------------
// On-disk data: macros.json, usage.json, settings.json, daily backups.
//
// macros.json keeps the exact shape every earlier version wrote
//   { prefix: "/", snippets: [{ title, abbr, content }] }
// plus an optional `folder` per snippet, so older builds can still read it.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const { normalizeContent } = require('./placeholders');

const BACKUPS_KEPT = 14;

const DEFAULT_SETTINGS = {
  theme: 'system',            // 'system' | 'light' | 'dark'
  paused: false,
  quickInsertShortcut: process.platform === 'darwin' ? 'Command+Shift+Space' : 'Control+Alt+Space',
  openWindowShortcut:  process.platform === 'darwin' ? 'Command+Shift+M'     : 'Control+Alt+M',
  launchAtLoginInitialized: false,
  trayHintShown: false,
};

function createStore(dir) {
  const MACROS_PATH   = path.join(dir, 'macros.json');
  const USAGE_PATH    = path.join(dir, 'usage.json');
  const SETTINGS_PATH = path.join(dir, 'settings.json');
  const STATS_PATH    = path.join(dir, 'stats.json');
  const BACKUP_DIR    = path.join(dir, 'backups');

  fs.mkdirSync(dir, { recursive: true });

  // Write to a temp file then rename, so a crash or power loss mid-write can
  // never leave a half-written macros.json behind.
  function writeJsonAtomic(file, value) {
    const tmp = `${file}.tmp`;
    const json = JSON.stringify(value, null, 2);
    try {
      fs.writeFileSync(tmp, json, 'utf-8');
      fs.renameSync(tmp, file);
    } catch (err) {
      // Antivirus on Windows occasionally locks the target during rename.
      console.warn('[store] atomic write failed, writing directly:', err.message);
      fs.writeFileSync(file, json, 'utf-8');
      try { fs.unlinkSync(tmp); } catch { /* already gone */ }
    }
  }

  function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  }

  // ---- Macros --------------------------------------------------------------
  function normalizeMacros(raw) {
    const out = { ...(raw && typeof raw === 'object' ? raw : {}) };
    out.prefix = typeof out.prefix === 'string' && out.prefix.length === 1 ? out.prefix : '/';
    out.snippets = (Array.isArray(out.snippets) ? out.snippets : [])
      .filter((s) => s && typeof s === 'object')
      .map((s) => {
        const clean = {
          ...s,
          title:   typeof s.title === 'string' ? s.title : '',
          abbr:    typeof s.abbr === 'string' ? s.abbr.trim() : '',
          content: normalizeContent(s.content),
        };
        if (typeof clean.folder !== 'string' || !clean.folder.trim()) delete clean.folder;
        else clean.folder = clean.folder.trim();
        return clean;
      });
    return out;
  }

  function latestBackup() {
    try {
      const files = fs.readdirSync(BACKUP_DIR).filter((f) => /^macros-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
      return files.length ? path.join(BACKUP_DIR, files[files.length - 1]) : null;
    } catch { return null; }
  }

  function loadMacros() {
    if (!fs.existsSync(MACROS_PATH)) {
      const fresh = normalizeMacros({});
      writeJsonAtomic(MACROS_PATH, fresh);
      return fresh;
    }
    try {
      return normalizeMacros(readJson(MACROS_PATH));
    } catch (err) {
      // Never silently wipe someone's macros: keep the broken file and fall
      // back to the newest backup.
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const kept = path.join(dir, `macros.corrupt-${stamp}.json`);
      try { fs.copyFileSync(MACROS_PATH, kept); } catch { /* best effort */ }
      console.error('[store] macros.json unreadable, kept copy at', kept, err.message);

      const backup = latestBackup();
      if (backup) {
        try {
          const restored = normalizeMacros(readJson(backup));
          writeJsonAtomic(MACROS_PATH, restored);
          console.log('[store] restored macros from', backup);
          return restored;
        } catch { /* fall through */ }
      }
      const fresh = normalizeMacros({});
      writeJsonAtomic(MACROS_PATH, fresh);
      return fresh;
    }
  }

  // One snapshot per day, taken before the first change of that day.
  function backupToday() {
    if (!fs.existsSync(MACROS_PATH)) return;
    const today = new Date().toISOString().slice(0, 10);
    const target = path.join(BACKUP_DIR, `macros-${today}.json`);
    if (fs.existsSync(target)) return;
    try {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
      fs.copyFileSync(MACROS_PATH, target);
      const old = fs.readdirSync(BACKUP_DIR).filter((f) => f.startsWith('macros-')).sort();
      for (const f of old.slice(0, Math.max(0, old.length - BACKUPS_KEPT))) {
        fs.unlinkSync(path.join(BACKUP_DIR, f));
      }
    } catch (err) {
      console.warn('[store] backup failed:', err.message);
    }
  }

  function saveMacros(data) {
    const clean = normalizeMacros(data);
    backupToday();
    writeJsonAtomic(MACROS_PATH, clean);
    return clean;
  }

  // ---- Usage  { abbr: count } ---------------------------------------------
  function loadUsage() {
    try {
      const parsed = readJson(USAGE_PATH);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch { /* missing or unreadable */ }
    return {};
  }

  function saveUsage(usage) { writeJsonAtomic(USAGE_PATH, usage); }

  function incrementUsage(abbr) {
    const usage = loadUsage();
    usage[abbr] = (usage[abbr] || 0) + 1;
    saveUsage(usage);
    return usage;
  }

  function renameUsage(from, to) {
    const usage = loadUsage();
    if (!from || !to || from === to) return usage;
    renameInStats(from, to);
    if (!usage[from]) return usage;
    usage[to] = (usage[to] || 0) + usage[from];
    delete usage[from];
    saveUsage(usage);
    return usage;
  }

  function deleteUsage(abbr) {
    const usage = loadUsage();
    delete usage[abbr];
    saveUsage(usage);
    return usage;
  }

  // ---- Stats ----------------------------------------------------------------
  // Lifetime totals plus a per-day history, so the app can show streaks,
  // a calendar heatmap and "this week" counts. usage.json stays the
  // all-time per-macro count (older versions read it too).
  //   { lifetime, charsSaved, since, days: { "YYYY-MM-DD": { total, macros: { abbr: n } } } }
  const DAYS_KEPT = 400;

  function localDay(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function loadStats() {
    try {
      const parsed = readJson(STATS_PATH);
      if (parsed && typeof parsed === 'object' && parsed.days) return parsed;
    } catch { /* first run on v2 */ }

    // Carry over counts from before stats existed so nobody starts at zero.
    const usage = loadUsage();
    const macros = loadMacros().snippets;
    let lifetime = 0, charsSaved = 0;
    for (const [abbr, n] of Object.entries(usage)) {
      lifetime += n;
      const m = macros.find((s) => s.abbr === abbr);
      if (m) charsSaved += n * Math.max(0, m.content.length - abbr.length - 2);
    }
    const seeded = { lifetime, charsSaved, since: localDay(), days: {} };
    writeJsonAtomic(STATS_PATH, seeded);
    return seeded;
  }

  // One expansion happened. abbr is null for built-ins (still counted).
  function recordExpansion({ abbr = null, chars = 0 } = {}) {
    const stats = loadStats();
    const day = localDay();
    stats.lifetime = (stats.lifetime || 0) + 1;
    stats.charsSaved = (stats.charsSaved || 0) + Math.max(0, chars);
    const today = stats.days[day] || (stats.days[day] = { total: 0, macros: {} });
    today.total += 1;
    if (abbr) today.macros[abbr] = (today.macros[abbr] || 0) + 1;

    const keys = Object.keys(stats.days).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - DAYS_KEPT))) delete stats.days[k];
    writeJsonAtomic(STATS_PATH, stats);

    const usage = abbr ? incrementUsage(abbr) : loadUsage();
    return { stats, usage };
  }

  function renameInStats(from, to) {
    const stats = loadStats();
    for (const day of Object.values(stats.days)) {
      if (day.macros[from]) {
        day.macros[to] = (day.macros[to] || 0) + day.macros[from];
        delete day.macros[from];
      }
    }
    writeJsonAtomic(STATS_PATH, stats);
  }

  // ---- Settings -------------------------------------------------------------
  function loadSettings() {
    try {
      return { ...DEFAULT_SETTINGS, ...readJson(SETTINGS_PATH) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettings(patch) {
    const next = { ...loadSettings(), ...patch };
    writeJsonAtomic(SETTINGS_PATH, next);
    return next;
  }

  // ---- Import -----------------------------------------------------------------
  // Merge another export into ours; abbreviations we already have are skipped.
  function mergeImport(incoming) {
    if (!incoming || !Array.isArray(incoming.snippets)) {
      throw new Error('That file doesn’t look like a Macro Manager export.');
    }
    const current = loadMacros();
    const have = new Set(current.snippets.map((s) => s.abbr.toLowerCase()));
    const toAdd = normalizeMacros({ snippets: incoming.snippets }).snippets
      .filter((s) => s.abbr && !have.has(s.abbr.toLowerCase()));
    const merged = saveMacros({ ...current, snippets: [...current.snippets, ...toAdd] });
    return { merged, added: toAdd.length, skipped: incoming.snippets.length - toAdd.length };
  }

  return {
    paths: { dir, macros: MACROS_PATH, usage: USAGE_PATH, settings: SETTINGS_PATH, stats: STATS_PATH, backups: BACKUP_DIR },
    loadMacros, saveMacros, normalizeMacros,
    loadUsage, incrementUsage, renameUsage, deleteUsage,
    loadStats, recordExpansion, localDay,
    loadSettings, saveSettings,
    mergeImport,
  };
}

module.exports = { createStore, DEFAULT_SETTINGS };
