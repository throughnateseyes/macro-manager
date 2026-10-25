// ---------------------------------------------------------------------------
// Fill-in fields: {field:Label} tokens in a macro, and their settings.
//
// The tokens in the text are what make a field exist; `macro.fields` only adds
// a default or a list of choices (docs/MACRO-FORMAT.md). Pure, like
// placeholders.js: the main process, the store and dev/ previews share it.
// ---------------------------------------------------------------------------
const FIELD_RE = /\{field:([^{}\n]{1,40})\}/g;
const FIELD_LIMITS = { label: 40, text: 500, choices: 30 };
const MEMORY_KEPT = 5;

// A usable label, or '' when it can't be one.
function cleanLabel(raw) {
  const label = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
  return label && label.length <= FIELD_LIMITS.label && !/[{}]/.test(label) ? label : '';
}

const fieldKey = (label) => cleanLabel(label).toLowerCase();
const fieldToken = (label) => `{field:${cleanLabel(label)}}`;

// Labels used in the text, in order of first use, each once.
function fieldLabels(content) {
  const seen = new Set();
  const out = [];
  for (const m of String(content || '').matchAll(FIELD_RE)) {
    const label = cleanLabel(m[1]);
    if (label && !seen.has(label.toLowerCase())) { seen.add(label.toLowerCase()); out.push(label); }
  }
  return out;
}

// Stored settings, cleaned: [{ label, default?, choices? }] or undefined.
function normalizeFields(raw) {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set();
  const out = [];
  for (const f of raw) {
    const label = cleanLabel(f && f.label);
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    const clean = { label };
    if (typeof f.default === 'string' && f.default.trim()) clean.default = f.default.trim().slice(0, FIELD_LIMITS.text);
    if (Array.isArray(f.choices)) {
      const choices = [...new Set(f.choices.filter((c) => typeof c === 'string').map((c) => c.trim().slice(0, FIELD_LIMITS.text)).filter(Boolean))]
        .slice(0, FIELD_LIMITS.choices);
      if (choices.length) clean.choices = choices;
    }
    out.push(clean);
  }
  return out.length ? out : undefined;
}

// What the prompt asks for: one entry per label in the text, with its settings.
function fieldsFor(macro) {
  const defs = normalizeFields(macro && macro.fields) || [];
  return fieldLabels(macro && macro.content).map((label) => {
    const def = defs.find((d) => d.label.toLowerCase() === label.toLowerCase());
    return { ...(def || {}), label, key: label.toLowerCase() };
  });
}

const hasFields = (macro) => fieldLabels(macro && macro.content).length > 0;

// Starting answers: the default, or the default/first choice for a list.
function initialValues(fields) {
  const values = {};
  for (const f of fields) {
    if (f.choices) values[f.key] = f.choices.includes(f.default) ? f.default : f.choices[0];
    else values[f.key] = f.default || '';
  }
  return values;
}

// Change every {field:from} to {field:to} (labels match case-insensitively).
function renameFieldInContent(content, from, to) {
  const key = fieldKey(from);
  return String(content || '').replace(FIELD_RE, (tok, label) => (cleanLabel(label).toLowerCase() === key ? fieldToken(to) : tok));
}

function removeFieldFromContent(content, label) {
  const key = fieldKey(label);
  return String(content || '').replace(FIELD_RE, (tok, l) => (cleanLabel(l).toLowerCase() === key ? '' : tok));
}

// fields.json: { "resident name": ["Jane Park", …] }, newest first. Text
// answers only; a pick-list already shows its choices.
function rememberValues(memory, fields, values) {
  const next = { ...(memory && typeof memory === 'object' ? memory : {}) };
  for (const f of fields) {
    const v = String(values[f.key] ?? '').trim();
    if (f.choices || !v || v === f.default) continue;
    const old = Array.isArray(next[f.key]) ? next[f.key] : [];
    next[f.key] = [v, ...old.filter((x) => x !== v)].slice(0, MEMORY_KEPT);
  }
  return next;
}

// The macro's text as people read it in a list: fields as [Name], and for a
// formatted macro, the formatting marks dropped.
function readableText(macro) {
  let s = String((macro && macro.content) || '');
  if (macro && macro.format === 'rich') {
    s = s.replace(/\[([^\]\n]+)\]\((?:https?:\/\/|mailto:|tel:)[^)\s]+\)/gi, '$1')
      .replace(/\*\*(\S(?:[^\n]*?\S)?)\*\*/g, '$1')
      .replace(/\*(\S(?:[^\n]*?\S)?)\*/g, '$1')
      .replace(/^[ \t]*(- |\d{1,3}[.)] )/gm, '')
      .replace(/\\([\\*[\]()\-_#.`])/g, '$1');
  }
  return s.replace(FIELD_RE, (tok, label) => (cleanLabel(label) ? `[${cleanLabel(label)}]` : tok));
}

if (typeof module === 'object') {
  module.exports = {
    FIELD_RE, FIELD_LIMITS, cleanLabel, fieldKey, fieldToken, fieldLabels, normalizeFields, fieldsFor, hasFields,
    initialValues, renameFieldInContent, removeFieldFromContent, rememberValues, readableText,
  };
}
