// ---------------------------------------------------------------------------
// Built-in snippets and {placeholder} tokens.
//
// Shared by the main process (expansion) and the renderer (live previews via
// IPC), so everything here must stay pure — no Electron imports. dev/ loads it
// as a plain <script> for the browser previews, hence the guard at the end.
// ---------------------------------------------------------------------------
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

const pad = (n) => String(n).padStart(2, '0');

function hour12(d) {
  const h = d.getHours();
  return { h: h % 12 || 12, ampm: h >= 12 ? 'PM' : 'AM' };
}

const fmt = {
  ts:      (d) => { const { h, ampm } = hour12(d); return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} ${h}:${pad(d.getMinutes())} ${ampm}`; },
  date:    (d) => `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`,
  isodate: (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
  time:    (d) => { const { h, ampm } = hour12(d); return `${h}:${pad(d.getMinutes())} ${ampm}`; },
  time24:  (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
  day:     (d) => `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`,
  weekday: (d) => DAYS[d.getDay()],
  month:   (d) => MONTHS[d.getMonth()],
  year:    (d) => String(d.getFullYear()),
  unix:    (d) => String(Math.floor(d.getTime() / 1000)),
};

// Built-in abbreviations — typed as <prefix><abbr>, e.g. /ts. User macros with
// the same abbreviation always win.
const BUILT_INS = [
  { abbr: 'ts',      title: 'Full Timestamp', desc: 'Month D, YYYY H:MM AM/PM' },
  { abbr: 'date',    title: 'Short Date',     desc: 'MM/DD/YYYY' },
  { abbr: 'isodate', title: 'ISO Date',       desc: 'YYYY-MM-DD' },
  { abbr: 'time',    title: 'Time',           desc: '12-hour time' },
  { abbr: 'time24',  title: '24-hour Time',   desc: 'HH:MM:SS' },
  { abbr: 'day',     title: 'Day + Date',     desc: 'Weekday, Month Day' },
  { abbr: 'unix',    title: 'Unix Timestamp', desc: 'Seconds since 1970' },
];

// Tokens offered in the editor's Insert menu. {date+N} / {date-N} are also
// accepted (N days from today) but aren't listed individually.
const TOKENS = [
  { token: '{cursor}',    label: 'Cursor position', desc: 'Where the cursor lands after expanding' },
  { token: '{clipboard}', label: 'Clipboard',       desc: 'Whatever you last copied' },
  { token: '{date}',      label: 'Date',            desc: 'MM/DD/YYYY' },
  { token: '{date+7}',    label: 'Date in 7 days',  desc: 'Change the number for any offset' },
  { token: '{day}',       label: 'Day + date',      desc: 'Weekday, Month Day' },
  { token: '{weekday}',   label: 'Weekday',         desc: 'e.g. Monday' },
  { token: '{time}',      label: 'Time',            desc: '12-hour time' },
  { token: '{ts}',        label: 'Timestamp',       desc: 'Full date and time' },
  { token: '{isodate}',   label: 'ISO date',        desc: 'YYYY-MM-DD' },
  { token: '{year}',      label: 'Year',            desc: 'e.g. 2026' },
];

function resolveBuiltIn(abbr, now = new Date()) {
  const f = fmt[abbr];
  return f && BUILT_INS.some((b) => b.abbr === abbr) ? f(now) : null;
}

// Older versions saved contenteditable HTML; normalise anything that still
// looks like markup into plain text.
function normalizeContent(raw) {
  if (typeof raw !== 'string') return '';
  if (!/<[a-z/][^>]*>|&[a-z]+;/i.test(raw)) return raw;
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<div[^>]*>/gi, '\n')    // contenteditable starts each new line with <div>
    .replace(/<\/div>/gi,    '')
    .replace(/<[^>]*>/g,     '')
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// {field:Label} is a fill-in field (lib/fields.js); its value comes from the
// prompt, keyed by the label in lower case.
const TOKEN_RE = /\{(cursor|clipboard|date(?:[+-]\d{1,4})?|isodate|time24|time|ts|day|weekday|month|year|unix|field:[^{}\n]{1,40})\}/g;

// The text one token stands for. {cursor} stands for nothing ('').
function resolveToken(name, { clipboard = '', now = new Date(), values = {} } = {}) {
  if (name === 'cursor') return '';
  if (name === 'clipboard') return clipboard;
  if (name.startsWith('field:')) return String(values[name.slice(6).replace(/\s+/g, ' ').trim().toLowerCase()] ?? '');
  if (name.startsWith('date') && name.length > 4) {
    const d = new Date(now);
    d.setDate(d.getDate() + Number(name.slice(4)));
    return fmt.date(d);
  }
  return fmt[name](now);
}

// Expand {tokens} in a plain-text macro body.
//   → { text, cursorBack }  where cursorBack is how many Left-arrow presses
//     move the caret from the end of the pasted text to the {cursor} marker.
function expandTemplate(content, ctx = {}) {
  let cursorAt = -1;
  let out = '';
  let last = 0;
  const body = normalizeContent(content);

  for (const m of body.matchAll(TOKEN_RE)) {
    out += body.slice(last, m.index);
    last = m.index + m[0].length;
    if (m[1] === 'cursor' && cursorAt === -1) cursorAt = out.length;
    out += resolveToken(m[1], ctx);
  }
  out += body.slice(last);

  // Count code points, not UTF-16 units — one arrow press per character.
  const cursorBack = cursorAt === -1 ? 0 : Array.from(out.slice(cursorAt)).length;
  return { text: out, cursorBack };
}

if (typeof module === 'object') module.exports = { BUILT_INS, TOKENS, TOKEN_RE, resolveBuiltIn, resolveToken, expandTemplate, normalizeContent };
