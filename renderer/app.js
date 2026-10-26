// ---------------------------------------------------------------------------
// Macro Manager — main window
// ---------------------------------------------------------------------------
const api = window.macroAPI;

const state = {
  macros: { prefix: '/', snippets: [] },
  usage: {},
  stats: { lifetime: 0, charsSaved: 0, days: {} },
  settings: {},
  version: '',
  platform: 'darwin',
  dataPath: '',
  statsUrl: '',
  accessibility: true,
  update: { status: 'idle' },
  builtIns: [],
  tokens: [],

  view: 'overview',   // overview | editor | builtins | settings
  selected: -1,       // index into macros.snippets while in the editor
  search: '',
  sort: readLocal('sort', 'name'),            // name | usage | recent
  collapsed: new Set(readLocal('collapsed', [])),
  range: readLocal('range', 'all'),           // most-used range: 7 | 30 | all
};

const IS_MAC = () => state.platform === 'darwin';
const MOD = () => (IS_MAC() ? '⌘' : 'Ctrl+');

const $ = (sel, root = document) => root.querySelector(sel);
const el = {
  list: $('#macro-list'),
  count: $('#macro-count'),
  search: $('#search'),
  searchKbd: $('#search-kbd'),
  footer: $('#sidebar-footer'),
  view: $('#view'),
  tbLeft: $('#toolbar-left'),
  tbRight: $('#toolbar-right'),
  menu: $('#menu'),
  toast: $('#toast'),
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function readLocal(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
}
function writeLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

const ICON = {
  copy:      '<svg class="icon" viewBox="0 0 16 16"><rect x="5.5" y="5.5" width="8" height="8" rx="1.8"/><path d="M10.5 3.5v-.2A1.3 1.3 0 0 0 9.2 2H3.8A1.3 1.3 0 0 0 2.5 3.3v5.4A1.3 1.3 0 0 0 3.8 10h.2"/></svg>',
  duplicate: '<svg class="icon" viewBox="0 0 16 16"><rect x="5.5" y="5.5" width="8" height="8" rx="1.8"/><path d="M9.5 8v3M8 9.5h3M10.5 3.5v-.2A1.3 1.3 0 0 0 9.2 2H3.8A1.3 1.3 0 0 0 2.5 3.3v5.4A1.3 1.3 0 0 0 3.8 10h.2"/></svg>',
  trash:     '<svg class="icon" viewBox="0 0 16 16"><path d="M2.5 4.5h11M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M4 4.5l.7 8.6a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9l.7-8.6"/></svg>',
  keyboard:  '<svg class="icon" viewBox="0 0 16 16"><rect x="1.5" y="3.5" width="13" height="9" rx="1.8"/><path d="M4 6.5h.01M6.5 6.5h.01M9 6.5h.01M11.5 6.5h.01M5 9.5h6"/></svg>',
  folder:    '<svg class="icon" viewBox="0 0 16 16"><path d="M1.75 4.25c0-.69.56-1.25 1.25-1.25h3l1.5 1.5H13c.69 0 1.25.56 1.25 1.25v6c0 .69-.56 1.25-1.25 1.25H3c-.69 0-1.25-.56-1.25-1.25z"/></svg>',
  chart:     '<svg class="icon" viewBox="0 0 16 16"><path d="M2.5 13.5h11M4.5 11V8M8 11V4.5M11.5 11V6.5"/></svg>',
  plus:      '<svg class="icon" viewBox="0 0 16 16"><path d="M8 3v10M3 8h10"/></svg>',
  bolt:      '<svg class="icon" viewBox="0 0 16 16"><path d="M9 1.75 3.5 9h4l-.5 5.25L12.5 7h-4z"/></svg>',
  search:    '<svg class="icon" viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.75"/><path d="M10.5 10.5 14 14"/></svg>',
  braces:    '<svg class="icon" viewBox="0 0 16 16"><path d="M5.5 2.5c-1.5 0-2 .7-2 2v1.6c0 .9-.5 1.4-1.5 1.9 1 .5 1.5 1 1.5 1.9v1.6c0 1.3.5 2 2 2M10.5 2.5c1.5 0 2 .7 2 2v1.6c0 .9.5 1.4 1.5 1.9-1 .5-1.5 1-1.5 1.9v1.6c0 1.3-.5 2-2 2"/></svg>',
  shield:    '<svg class="icon" viewBox="0 0 16 16"><path d="M8 1.75 2.75 3.5v4c0 3.2 2.2 5.6 5.25 6.75 3.05-1.15 5.25-3.55 5.25-6.75v-4z"/><path d="m5.75 8 1.6 1.6 2.9-3.1"/></svg>',
  chevron:   '<svg class="icon chev" viewBox="0 0 16 16"><path d="m4 6 4 4 4-4"/></svg>',
  pin:       '<svg class="icon" viewBox="0 0 16 16"><path d="M5.75 2.25h4.5M6.5 2.25v3.6L4.5 8.6v1h7v-1L9.5 5.85v-3.6M8 9.6v4.15"/></svg>',
  pinFill:   '<svg class="icon" viewBox="0 0 16 16"><path class="fill" d="M5.75 2.25h4.5M6.5 2.25v3.6L4.5 8.6v1h7v-1L9.5 5.85v-3.6Z"/><path d="M8 9.6v4.15"/></svg>',
  flame:     '<svg class="icon" viewBox="0 0 16 16"><path d="M8 14.5c2.8 0 4.5-1.9 4.5-4.4 0-2.9-2.5-4.4-3-7.6C7.6 3.6 6.8 5.6 7 7.4 6.1 6.9 5.6 6 5.5 5 4.2 6.2 3.5 7.9 3.5 10.1c0 2.5 1.7 4.4 4.5 4.4z"/></svg>',
  trophy:    '<svg class="icon" viewBox="0 0 16 16"><path d="M5 2.5h6v3.2a3 3 0 0 1-6 0zM5 3.5H2.8c0 2 .9 3.2 2.5 3.4M11 3.5h2.2c0 2-.9 3.2-2.5 3.4M8 8.7v2.8M5.5 13.5h5"/></svg>',
  check:     '<svg class="icon check" viewBox="0 0 16 16"><path d="m3.5 8.5 3 3 6-7"/></svg>',
  format:    '<svg class="icon" viewBox="0 0 16 16"><path d="M2 12.5 5.25 3.5h.5L9 12.5M3.1 9.5h4.8M10.5 8.4c.4-.6 1-.9 1.8-.9 1.1 0 1.7.6 1.7 1.7v3.3M14 10.4h-1.6c-1.2 0-1.9.5-1.9 1.2 0 .6.5 1 1.2 1 1.2 0 2.3-.8 2.3-2.2"/></svg>',
  bold:      '<svg class="icon" viewBox="0 0 16 16"><path d="M4.75 2.75h3.9a2.6 2.6 0 0 1 0 5.2h-3.9zM4.75 7.95h4.5a2.65 2.65 0 0 1 0 5.3h-4.5z" stroke-width="1.8"/></svg>',
  italic:    '<svg class="icon" viewBox="0 0 16 16"><path d="M7 2.75h5M4 13.25h5M9.6 2.75 6.4 13.25"/></svg>',
  link:      '<svg class="icon" viewBox="0 0 16 16"><path d="M6.6 9.4 9.4 6.6M7.3 4.6l1.1-1.1a2.6 2.6 0 0 1 3.7 3.7L11 8.3M8.7 11.4l-1.1 1.1a2.6 2.6 0 0 1-3.7-3.7L5 7.7"/></svg>',
  bullets:   '<svg class="icon" viewBox="0 0 16 16"><path d="M6.5 4h7M6.5 8h7M6.5 12h7"/><path d="M3 4h.01M3 8h.01M3 12h.01" stroke-width="2.2"/></svg>',
  pause:     '<svg class="icon" viewBox="0 0 16 16"><path d="M5.75 3.5v9M10.25 3.5v9" stroke-width="2"/></svg>',
  play:      '<svg class="icon" viewBox="0 0 16 16"><path class="fill" d="M5 3.4v9.2a.7.7 0 0 0 1.05.6l7.2-4.6a.7.7 0 0 0 0-1.2l-7.2-4.6A.7.7 0 0 0 5 3.4z"/></svg>',
  shortcut:  '<svg class="icon" viewBox="0 0 16 16"><rect x="1.5" y="4.5" width="5.5" height="6.5" rx="1.4"/><rect x="9" y="4.5" width="5.5" height="6.5" rx="1.4"/><path d="M3 9h2.5M10.5 9h2.5"/></svg>',
  close:     '<svg class="icon" viewBox="0 0 16 16"><path d="m4.5 4.5 7 7M11.5 4.5l-7 7"/></svg>',
  test:      '<svg class="icon" viewBox="0 0 16 16"><path d="M5.5 3.4v9.2l7.2-4.6z"/></svg>',
  numbers:   '<svg class="icon" viewBox="0 0 16 16"><path d="M7 4h6.5M7 8h6.5M7 12h6.5"/><path d="M2.6 2.9 3.6 2.4v3.3M2.4 9.2c.2-.6.7-.8 1.1-.8.5 0 .9.3.9.8 0 .7-1.2 1.4-2 2.4h2.1" stroke-width="1.2"/></svg>',
};

// On Windows the toolbar, sidebar and footer use Microsoft's Fluent System
// Icons (MIT, github.com/microsoft/fluentui-system-icons), the set Windows 11
// itself draws with, instead of the hand-drawn outlines above, which look thin
// and out of place there. Filled shapes, so they're drawn with .icon.fl.
const WIN_ICON = {
  test:      '<svg class="icon fl" viewBox="0 0 20 20"><path d="M17.2204 8.68703C18.2558 9.25661 18.2558 10.7434 17.2204 11.313L7.2234 16.812C6.22371 17.362 5 16.6393 5 15.4991L5 4.50093C5 3.36068 6.22371 2.63805 7.2234 3.18795L17.2204 8.68703ZM16.7381 10.4377C17.0833 10.2478 17.0833 9.7522 16.7381 9.56234L6.74113 4.06327C6.4079 3.87997 6 4.12084 6 4.50093L6 15.4991C6 15.8792 6.4079 16.12 6.74114 15.9367L16.7381 10.4377Z"/></svg>',
  pin:       '<svg class="icon fl" viewBox="0 0 20 20"><path d="M10.1221 3.13715C10.7326 1.91616 12.3599 1.65208 13.3251 2.61737L17.382 6.67419C18.3472 7.63947 18.0832 9.26676 16.8622 9.87726L13.4037 11.6065C13.0751 11.7708 12.8183 12.0499 12.6818 12.391L11.2459 15.981C10.9792 16.6476 10.1179 16.8244 9.61027 16.3167L7 13.7064L3.70711 16.9993H3V16.2922L6.29289 12.9993L3.68262 10.3891C3.17498 9.88142 3.35177 9.02011 4.01834 8.75348L7.60829 7.3175C7.94939 7.18106 8.22855 6.92419 8.39285 6.5956L10.1221 3.13715ZM12.618 3.32447C12.1354 2.84183 11.3217 2.97387 11.0165 3.58437L9.28727 7.04282C9.01345 7.59046 8.54818 8.01858 7.97968 8.24598L4.38973 9.68196L10.3174 15.6096L11.7534 12.0197C11.9808 11.4512 12.4089 10.9859 12.9565 10.7121L16.415 8.98283C17.0255 8.67758 17.1575 7.86394 16.6749 7.3813L12.618 3.32447Z"/></svg>',
  pinFill:   '<svg class="icon fl" viewBox="0 0 20 20"><path d="M13.3251 2.61737C12.3599 1.65208 10.7326 1.91616 10.1221 3.13715L8.39285 6.5956C8.22855 6.92419 7.94939 7.18106 7.60829 7.3175L4.01834 8.75348C3.35177 9.02011 3.17498 9.88142 3.68262 10.3891L6.29289 12.9993L3 16.2922V16.9993H3.70711L7 13.7064L9.61027 16.3167C10.1179 16.8244 10.9792 16.6476 11.2459 15.981L12.6818 12.391C12.8183 12.0499 13.0751 11.7708 13.4037 11.6065L16.8622 9.87726C18.0832 9.26676 18.3472 7.63947 17.382 6.67419L13.3251 2.61737Z"/></svg>',
  copy:      '<svg class="icon fl" viewBox="0 0 20 20"><path d="M7 7H5.5C4.67157 7 4 7.67157 4 8.5V14.5C4 15.3284 4.67157 16 5.5 16H9.5C10.1529 16 10.707 15.5823 10.9131 15H11.9502C11.7186 16.1411 10.7095 17 9.5 17H5.5C4.11929 17 3 15.8807 3 14.5V8.5C3 7.11929 4.11929 6 5.5 6H7V7ZM14.5 3C15.8807 3 17 4.11929 17 5.5V11.5C17 12.8807 15.8807 14 14.5 14H10.5C9.11929 14 8 12.8807 8 11.5V5.5C8 4.11929 9.11929 3 10.5 3H14.5ZM10.5 4C9.67157 4 9 4.67157 9 5.5V11.5C9 12.3284 9.67157 13 10.5 13H14.5C15.3284 13 16 12.3284 16 11.5V5.5C16 4.67157 15.3284 4 14.5 4H10.5Z"/></svg>',
  duplicate: '<svg class="icon fl" viewBox="0 0 20 20"><path d="M14.5 10C16.9853 10 19 12.0147 19 14.5C19 16.9853 16.9853 19 14.5 19C12.0147 19 10 16.9853 10 14.5C10 12.0147 12.0147 10 14.5 10ZM7 7H5.5C4.67157 7 4 7.67157 4 8.5V14.5C4 15.3284 4.67157 16 5.5 16H9.20801C9.30616 16.347 9.43773 16.6797 9.59863 16.9951C9.56587 16.9964 9.53307 17 9.5 17H5.5C4.11929 17 3 15.8807 3 14.5V8.5C3 7.11929 4.11929 6 5.5 6H7V7ZM14.5 12C14.2239 12 14 12.2239 14 12.5V14H12.5C12.2239 14 12 14.2239 12 14.5C12 14.7761 12.2239 15 12.5 15H14V16.5C14 16.7761 14.2239 17 14.5 17C14.7761 17 15 16.7761 15 16.5V15H16.5C16.7761 15 17 14.7761 17 14.5C17 14.2239 16.7761 14 16.5 14H15V12.5C15 12.2239 14.7761 12 14.5 12ZM14.5 3C15.8807 3 17 4.11929 17 5.5V9.60059C16.6832 9.4386 16.3487 9.30664 16 9.20801V5.5C16 4.67157 15.3284 4 14.5 4H10.5C9.67157 4 9 4.67157 9 5.5V11.5C9 11.8819 9.14392 12.2293 9.37891 12.4941C9.24583 12.8336 9.14469 13.1891 9.08105 13.5576C8.42821 13.1066 8 12.3536 8 11.5V5.5C8 4.11929 9.11929 3 10.5 3H14.5Z"/></svg>',
  trash:     '<svg class="icon fl" viewBox="0 0 20 20"><path d="M8.5 4H11.5C11.5 3.17157 10.8284 2.5 10 2.5C9.17157 2.5 8.5 3.17157 8.5 4ZM7.5 4C7.5 2.61929 8.61929 1.5 10 1.5C11.3807 1.5 12.5 2.61929 12.5 4H17.5C17.7761 4 18 4.22386 18 4.5C18 4.77614 17.7761 5 17.5 5H16.4456L15.2521 15.3439C15.0774 16.8576 13.7957 18 12.2719 18H7.72813C6.20431 18 4.92256 16.8576 4.7479 15.3439L3.55437 5H2.5C2.22386 5 2 4.77614 2 4.5C2 4.22386 2.22386 4 2.5 4H7.5ZM5.74131 15.2292C5.85775 16.2384 6.71225 17 7.72813 17H12.2719C13.2878 17 14.1422 16.2384 14.2587 15.2292L15.439 5H4.56101L5.74131 15.2292ZM8.5 7.5C8.77614 7.5 9 7.72386 9 8V14C9 14.2761 8.77614 14.5 8.5 14.5C8.22386 14.5 8 14.2761 8 14V8C8 7.72386 8.22386 7.5 8.5 7.5ZM12 8C12 7.72386 11.7761 7.5 11.5 7.5C11.2239 7.5 11 7.72386 11 8V14C11 14.2761 11.2239 14.5 11.5 14.5C11.7761 14.5 12 14.2761 12 14V8Z"/></svg>',
  pause:     '<svg class="icon fl" viewBox="0 0 20 20"><path d="M5 2C3.89543 2 3 2.89543 3 4V16C3 17.1046 3.89543 18 5 18H7C8.10457 18 9 17.1046 9 16V4C9 2.89543 8.10457 2 7 2H5ZM4 4C4 3.44772 4.44772 3 5 3H7C7.55228 3 8 3.44772 8 4V16C8 16.5523 7.55228 17 7 17H5C4.44772 17 4 16.5523 4 16V4ZM13 2C11.8954 2 11 2.89543 11 4V16C11 17.1046 11.8954 18 13 18H15C16.1046 18 17 17.1046 17 16V4C17 2.89543 16.1046 2 15 2H13ZM12 4C12 3.44772 12.4477 3 13 3H15C15.5523 3 16 3.44772 16 4V16C16 16.5523 15.5523 17 15 17H13C12.4477 17 12 16.5523 12 16V4Z"/></svg>',
  play:      '<svg class="icon fl" viewBox="0 0 20 20"><path d="M17.2221 8.68458C18.2586 9.25438 18.2586 10.7437 17.2221 11.3135L7.22259 16.8105C6.22292 17.36 5 16.6367 5 15.496L5 4.50214C5 3.36137 6.22292 2.63812 7.22259 3.18766L17.2221 8.68458Z"/></svg>',
  close:     '<svg class="icon fl" viewBox="0 0 12 12"><path d="M2.08859 2.21569L2.14645 2.14645C2.32001 1.97288 2.58944 1.9536 2.78431 2.08859L2.85355 2.14645L6 5.293L9.14645 2.14645C9.34171 1.95118 9.65829 1.95118 9.85355 2.14645C10.0488 2.34171 10.0488 2.65829 9.85355 2.85355L6.707 6L9.85355 9.14645C10.0271 9.32001 10.0464 9.58944 9.91141 9.78431L9.85355 9.85355C9.67999 10.0271 9.41056 10.0464 9.21569 9.91141L9.14645 9.85355L6 6.707L2.85355 9.85355C2.65829 10.0488 2.34171 10.0488 2.14645 9.85355C1.95118 9.65829 1.95118 9.34171 2.14645 9.14645L5.293 6L2.14645 2.85355C1.97288 2.67999 1.9536 2.41056 2.08859 2.21569L2.14645 2.14645L2.08859 2.21569Z"/></svg>',
  plus:      '<svg class="icon fl" viewBox="0 0 20 20"><path d="M10 2.5C10.2761 2.5 10.5 2.72386 10.5 3V9.5H17C17.2761 9.5 17.5 9.72386 17.5 10C17.5 10.2761 17.2761 10.5 17 10.5H10.5V17C10.5 17.2761 10.2761 17.5 10 17.5C9.72386 17.5 9.5 17.2761 9.5 17V10.5H3C2.72386 10.5 2.5 10.2761 2.5 10C2.5 9.72386 2.72386 9.5 3 9.5H9.5V3C9.5 2.72386 9.72386 2.5 10 2.5Z"/></svg>',
  search:    '<svg class="icon fl" viewBox="0 0 20 20"><path d="M13.7291 14.4362C12.5924 15.411 11.115 16 9.5 16C5.91015 16 3 13.0899 3 9.5C3 5.91015 5.91015 3 9.5 3C13.0899 3 16 5.91015 16 9.5C16 11.115 15.411 12.5924 14.4361 13.7292L17.8535 17.1465C18.0487 17.3417 18.0487 17.6583 17.8535 17.8536C17.6799 18.0271 17.4105 18.0464 17.2156 17.9114L17.1464 17.8536L13.7291 14.4362ZM13.0196 13.7266C13.276 13.5128 13.5127 13.2761 13.7265 13.0197C14.5216 12.0659 15 10.8388 15 9.5C15 6.46243 12.5376 4 9.5 4C6.46243 4 4 6.46243 4 9.5C4 12.5376 6.46243 15 9.5 15C10.8388 15 12.0658 14.5217 13.0196 13.7266Z"/></svg>',
  sort:      '<svg class="icon fl" viewBox="0 0 20 20"><path d="M2.35355 7.35418L4.99792 4.70981V16.5C4.99792 16.7761 5.22178 17 5.49792 17C5.77407 17 5.99792 16.7761 5.99792 16.5V4.7053L8.64682 7.3542C8.84209 7.54946 9.15867 7.54946 9.35393 7.3542C9.54919 7.15893 9.54919 6.84235 9.35393 6.64709L5.86386 3.15701L5.85387 3.14675C5.81608 3.10895 5.77374 3.07847 5.72861 3.05531C5.65697 3.01841 5.57828 2.99998 5.49959 3L5.49792 3C5.3441 3 5.20649 3.06947 5.11477 3.17874L1.64645 6.64707C1.45118 6.84233 1.45118 7.15891 1.64645 7.35418C1.84171 7.54944 2.15829 7.54944 2.35355 7.35418ZM17.6468 12.6458L15.0025 15.2902L15.0025 3.5C15.0025 3.22386 14.7786 3 14.5025 3C14.2263 3 14.0025 3.22386 14.0025 3.5L14.0025 15.2947L11.3536 12.6458C11.1583 12.4505 10.8417 12.4505 10.6464 12.6458C10.4512 12.8411 10.4512 13.1577 10.6464 13.3529L14.1365 16.843L14.1465 16.8533C14.1843 16.891 14.2266 16.9215 14.2718 16.9447C14.3434 16.9816 14.4221 17 14.5008 17L14.5025 17C14.6563 17 14.7939 16.9305 14.8856 16.8213L18.3539 13.3529C18.5492 13.1577 18.5492 12.8411 18.3539 12.6458C18.1587 12.4506 17.8421 12.4506 17.6468 12.6458Z"/></svg>',
};

let toastTimer;
// toast('Saved') — or with an action: toast('Deleted', { action: 'Undo', onAction })
function toast(msg, { action, onAction, duration = 1800 } = {}) {
  el.toast.textContent = msg;
  el.toast.classList.toggle('interactive', Boolean(action));
  if (action) {
    const b = h(`<button class="toast-action">${esc(action)}</button>`);
    b.addEventListener('click', () => { hideToast(); onAction(); });
    el.toast.append(b);
  }
  el.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, duration);
}

function hideToast() {
  clearTimeout(toastTimer);
  el.toast.classList.remove('show', 'interactive');
}

function prettyAccel(accel) {
  if (!accel) return 'Off';
  if (IS_MAC()) {
    return accel
      .replace(/Command|Cmd|CommandOrControl/g, '⌘').replace(/Control|Ctrl/g, '⌃')
      .replace(/Alt|Option/g, '⌥').replace(/Shift/g, '⇧').replace(/\+/g, '')
      .replace('Space', ' Space');
  }
  return accel.replace(/Control/g, 'Ctrl').replace(/\+/g, ' + ');
}

function preview(text, max = 90) {
  const one = String(text || '').replace(/\s+/g, ' ').trim();
  return one.length > max ? one.slice(0, max) + '…' : one;
}

// Mirrors lib/keys.js abbrProblem().
const PUNCTUATION = "/\\.,;='`[]-!@#$%^&*()_+{}|:\"<>?~";
function abbrProblem(abbr, prefix) {
  if (!abbr) return 'Add an abbreviation so this macro can expand.';
  if (/\s/.test(abbr)) return 'Abbreviations can’t contain spaces.';
  if (prefix && abbr.includes(prefix)) return `Abbreviations can’t contain the prefix “${prefix}”.`;
  for (const ch of abbr.toLowerCase()) {
    if (!/[a-z0-9]/.test(ch) && !PUNCTUATION.includes(ch)) return `“${ch}” can’t be typed as part of an abbreviation.`;
  }
  return null;
}

// Problems shown in the editor and as a dot in the sidebar: `warn`/`info`
// sit under the abbreviation, `shortcutWarn` under the shortcut.
function macroIssues(index) {
  const m = state.macros.snippets[index];
  if (!m) return {};
  const shortcutWarn = shortcutIssue(index);
  const out = (issue) => ({ ...issue, shortcutWarn, warn: issue.abbrWarn || shortcutWarn });
  const abbr = (m.abbr || '').toLowerCase();
  if (!abbr && m.shortcut) {
    return out(m.content.trim() ? {} : { abbrWarn: 'This macro is empty, so it won’t paste yet.' });
  }
  const problem = abbr ? abbrProblem(m.abbr, state.macros.prefix) : 'Add an abbreviation or a shortcut so this macro can expand.';
  if (problem) return out({ abbrWarn: m.abbr || m.content ? problem : null });
  const firstOwner = state.macros.snippets.findIndex((s) => (s.abbr || '').toLowerCase() === abbr);
  if (firstOwner !== index) {
    return out({ abbrWarn: `“${state.macros.snippets[firstOwner].title || 'Untitled'}” already uses ${state.macros.prefix}${m.abbr}. Only that one will expand.` });
  }
  if (!m.content.trim()) return out({ abbrWarn: 'This macro is empty, so it won’t expand yet.' });
  const builtIn = state.builtIns.find((b) => b.abbr === abbr);
  if (builtIn) return out({ info: `Replaces the built-in ${state.macros.prefix}${builtIn.abbr} (${builtIn.title}).` });
  return out({});
}

function shortcutIssue(index) {
  const m = state.macros.snippets[index];
  if (!m.shortcut) return null;
  const problem = shortcutProblem(m.shortcut);
  if (problem) return problem;
  const keys = prettyAccel(m.shortcut);
  if (sameAccel(m.shortcut, state.settings.quickInsertShortcut)) return `${keys} opens Quick Insert. Pick other keys or change that in Settings.`;
  if (sameAccel(m.shortcut, state.settings.openWindowShortcut)) return `${keys} opens Macro Manager. Pick other keys or change that in Settings.`;
  const firstOwner = state.macros.snippets.findIndex((s) => sameAccel(s.shortcut, m.shortcut));
  if (firstOwner !== index) {
    return `“${state.macros.snippets[firstOwner].title || 'Untitled'}” already uses ${keys}. Only that one will paste.`;
  }
  return (state.settings.macroShortcutErrors || {})[normalizeAccel(m.shortcut)] || null;
}

// A shortcut as it reads in a chip: Ctrl+Alt+T, or ⌃⌥T on a Mac.
const shortAccel = (accel) => prettyAccel(accel).replace(/ \+ /g, '+').replace(' Space', 'Space');

// The chip for how a macro is triggered: its abbreviation, or its shortcut
// when it only has one.
function triggerChip(m) {
  if (m.abbr) return `<span class="chip"${m.shortcut ? ` title="Also ${esc(prettyAccel(m.shortcut))}"` : ''}>${esc(state.macros.prefix + m.abbr)}</span>`;
  return m.shortcut ? `<span class="chip">${esc(shortAccel(m.shortcut))}</span>` : '';
}

// Rough characters-per-minute for an average typist (~40 wpm).
const CHARS_PER_MINUTE = 200;
function timeSavedMinutes() {
  let chars = 0;
  for (const m of state.macros.snippets) {
    const uses = state.usage[statKey(m)] || 0;
    chars += uses * Math.max(0, m.content.length - (m.abbr ? m.abbr.length + 2 : 0));
  }
  return chars / CHARS_PER_MINUTE;
}

function formatMinutes(min) {
  if (min < 1) return '—';
  if (min < 60) return `${Math.round(min)} min`;
  const hrs = min / 60;
  return `${hrs < 10 ? hrs.toFixed(1) : Math.round(hrs)} hr`;
}

// ---------------------------------------------------------------------------
// Stats — lifetime totals, streaks, milestones, history
// ---------------------------------------------------------------------------
const MILESTONES = [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 1000000];

function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function lastDays(n) {
  const out = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    out.unshift(dayKey(d));
    d.setDate(d.getDate() - 1);
  }
  return out;
}

const dayTotal = (key) => state.stats.days[key]?.total || 0;

// Consecutive days with at least one expansion, ending today (or yesterday,
// so the streak doesn't look broken first thing in the morning).
function currentStreak() {
  const d = new Date();
  if (!dayTotal(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (dayTotal(dayKey(d)) > 0) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

function bestStreak() {
  const keys = Object.keys(state.stats.days).filter((k) => dayTotal(k) > 0).sort();
  let best = 0, run = 0, prev = null;
  for (const k of keys) {
    const d = new Date(`${k}T12:00:00`);
    run = prev && (d - prev) / 86400000 < 1.5 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

// Uses per abbreviation over the last N days, or all time.
function usageInRange(range) {
  if (range === 'all') return state.usage;
  const out = {};
  for (const k of lastDays(Number(range))) {
    for (const [abbr, n] of Object.entries(state.stats.days[k]?.macros || {})) out[abbr] = (out[abbr] || 0) + n;
  }
  return out;
}

function macroDaily(abbr, n) {
  return lastDays(n).map((k) => state.stats.days[k]?.macros?.[abbr] || 0);
}

function nextMilestone(total) {
  return MILESTONES.find((m) => m > total) || null;
}

// ---------------------------------------------------------------------------
// Persistence (autosave)
// ---------------------------------------------------------------------------
let saveTimer = null;
let savedKey = null; // stat key (abbreviation or shortcut) as last persisted, for usage renames

function setSaveStatus(text) {
  const s = $('.save-status');
  if (s) s.textContent = text;
}

function scheduleSave() {
  setSaveStatus('Editing…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 450);
}

async function flushSave() {
  clearTimeout(saveTimer);
  saveTimer = null;
  const m = state.macros.snippets[state.selected];
  if (m && savedKey && statKey(m) && statKey(m) !== savedKey) {
    state.usage = await api.renameUsage(savedKey, statKey(m));
  }
  if (m) savedKey = statKey(m);
  // Keep our own copy as the source of truth: the editor holds references
  // into state.macros, so it must not be swapped out mid-edit.
  await api.saveMacros(state.macros);
  setSaveStatus('Saved');
}

// Leaving an untouched "New Macro" shouldn't leave a blank row behind.
async function discardIfBlank(index) {
  const m = state.macros.snippets[index];
  if (m && !m.title.trim() && !m.abbr.trim() && !m.shortcut && !m.content.trim()) {
    state.macros.snippets.splice(index, 1);
    state.macros = await api.saveMacros(state.macros);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------
async function go(view, index = -1) {
  if (state.view === 'editor' && (view !== 'editor' || index !== state.selected)) {
    if (saveTimer) await flushSave();
    const prev = state.selected;
    if (await discardIfBlank(prev) && index > prev) index -= 1;
  }
  state.view = view;
  state.selected = view === 'editor' ? index : -1;
  if (view === 'editor') savedKey = statKey(state.macros.snippets[index]) || null;
  closeMenu();
  render();
  el.view.scrollTop = 0;
}

function render() {
  renderNav();
  renderList();
  renderFooter();
  renderView();
}

function renderNav() {
  document.querySelectorAll('.nav-item').forEach((b) => {
    b.classList.toggle('active', b.dataset.view === state.view);
  });
}

// ---------------------------------------------------------------------------
// Sidebar list
// ---------------------------------------------------------------------------
function searchScore(m, q) {
  const abbr = m.abbr.toLowerCase();
  const title = m.title.toLowerCase();
  if (abbr === q) return 100;
  if (abbr.startsWith(q)) return 80;
  if (title.startsWith(q)) return 70;
  if (title.split(/\s+/).some((w) => w.startsWith(q))) return 60;
  if (title.includes(q) || abbr.includes(q)) return 40;
  if ((m.folder || '').toLowerCase().includes(q)) return 30;
  if (m.content.toLowerCase().includes(q)) return 20;
  return 0;
}

function sortedIndices(indices) {
  const s = state.macros.snippets;
  const byTitle = (a, b) => (s[a].title || '￿').localeCompare(s[b].title || '￿', undefined, { sensitivity: 'base' });
  if (state.sort === 'usage') return indices.sort((a, b) => (state.usage[statKey(s[b])] || 0) - (state.usage[statKey(s[a])] || 0) || byTitle(a, b));
  if (state.sort === 'recent') return indices.sort((a, b) => b - a);
  return indices.sort(byTitle);
}

// The order macros appear in the sidebar right now (used for ↑/↓ too).
function visibleOrder() {
  const s = state.macros.snippets;
  const q = state.search.trim().toLowerCase();
  if (q) {
    return s.map((m, i) => [i, searchScore(m, q)])
      .filter(([, score]) => score > 0)
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .map(([i]) => i);
  }
  const sec = listSections();
  const out = [];
  if (sec.pinned.length && !state.collapsed.has(PINNED_KEY)) out.push(...sec.pinned);
  out.push(...sec.loose);
  for (const f of sec.folders) if (!state.collapsed.has(f.name)) out.push(...f.members);
  return out;
}

// Pinned macros sit in their own section at the top and aren't repeated in
// their folder below.
const PINNED_KEY = '\u0000pinned';
function listSections() {
  const s = state.macros.snippets;
  const idx = s.map((_, i) => i);
  return {
    pinned: sortedIndices(idx.filter((i) => s[i].pinned)),
    loose: sortedIndices(idx.filter((i) => !s[i].pinned && !s[i].folder)),
    folders: folders()
      .map((name) => ({ name, members: sortedIndices(idx.filter((i) => !s[i].pinned && s[i].folder === name)) }))
      .filter((f) => f.members.length),
  };
}

function folders() {
  return [...new Set(state.macros.snippets.map((m) => m.folder).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

function highlight(text, q) {
  if (!q) return esc(text);
  const i = text.toLowerCase().indexOf(q);
  if (i === -1) return esc(text);
  return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
}

function macroRow(i, q) {
  const m = state.macros.snippets[i];
  const issues = macroIssues(i);
  const row = h(`
    <button class="macro-item${i === state.selected ? ' active' : ''}" role="option" data-index="${i}" aria-selected="${i === state.selected}">
      <div class="row">
        <span class="title${m.title ? '' : ' untitled'}">${m.title ? highlight(m.title, q) : 'Untitled'}</span>
        ${issues.warn ? '<span class="warn-dot" title="Needs attention"></span>' : ''}
        ${m.abbr ? `<span class="chip"${m.shortcut ? ` title="Also ${esc(prettyAccel(m.shortcut))}"` : ''}>${highlight(state.macros.prefix + m.abbr, q)}</span>` : m.shortcut ? `<span class="chip">${esc(shortAccel(m.shortcut))}</span>` : ''}
      </div>
      <div class="preview">${esc(preview(readableText(m), 80)) || '&nbsp;'}</div>
    </button>`);
  row.addEventListener('click', () => go('editor', i));
  row.addEventListener('contextmenu', (e) => showMacroMenu(i, e));
  return row;
}

function renderList() {
  const s = state.macros.snippets;
  const q = state.search.trim().toLowerCase();
  el.count.textContent = s.length || '';
  el.list.innerHTML = '';

  if (!s.length) {
    el.list.append(h(`<div class="list-empty">No macros yet.<br>Press ${MOD()}N to create one.</div>`));
    return;
  }

  if (q) {
    const hits = visibleOrder();
    if (!hits.length) el.list.append(h(`<div class="list-empty">No macros match “${esc(state.search.trim())}”.</div>`));
    hits.forEach((i) => el.list.append(macroRow(i, q)));
    return;
  }

  const sec = listSections();
  const section = (key, label, members) => {
    const collapsed = state.collapsed.has(key);
    const head = h(`
      <button class="folder-header${collapsed ? ' collapsed' : ''}">
        ${ICON.chevron}<span>${esc(label)}</span><span class="count">${members.length}</span>
      </button>`);
    head.addEventListener('click', () => {
      if (collapsed) state.collapsed.delete(key); else state.collapsed.add(key);
      writeLocal('collapsed', [...state.collapsed]);
      renderList();
    });
    head.addEventListener('contextmenu', (e) => showFolderMenu(key, e));
    el.list.append(head);
    if (!collapsed) members.forEach((i) => el.list.append(macroRow(i, '')));
  };

  if (sec.pinned.length) {
    section(PINNED_KEY, 'Pinned', sec.pinned);
    if (sec.loose.length) el.list.append(h('<div class="list-gap"></div>'));
  }
  sec.loose.forEach((i) => el.list.append(macroRow(i, '')));
  for (const f of sec.folders) section(f.name, f.name, f.members);
}

function moveSelection(delta) {
  const order = visibleOrder();
  if (!order.length) return;
  const pos = order.indexOf(state.selected);
  const next = pos === -1 ? (delta > 0 ? 0 : order.length - 1) : Math.min(order.length - 1, Math.max(0, pos + delta));
  go('editor', order[next]).then(() => {
    $(`.macro-item[data-index="${state.selected}"]`)?.scrollIntoView({ block: 'nearest' });
  });
}

// ---------------------------------------------------------------------------
// Sidebar footer — status, permission and update banners
// ---------------------------------------------------------------------------
function renderFooter() {
  el.footer.innerHTML = '';
  const u = state.update;

  if (!state.accessibility) {
    const b = h(`
      <div class="banner warn">
        <strong>Allow Accessibility access</strong>
        <p>macOS needs this before macros can expand in other apps.</p>
        <button class="btn small primary">Open System Settings</button>
      </div>`);
    b.querySelector('button').addEventListener('click', () => api.requestAccessibility());
    el.footer.append(b);
  }

  // Shown once, and nothing is sent until it's answered either way.
  if (state.settings.shareUsage && !state.settings.usageNoticeSeen) {
    const b = h(`
      <div class="banner">
        <strong>Adding to the total</strong>
        <p>Once an hour, Macro Manager adds how many times you used a macro to a total across everyone. Only that count leaves this computer: never your name, which macros you used, or anything you type.</p>
        <div class="banner-actions">
          <button class="btn small primary" data-ok>OK</button>
          <button class="btn small" data-off>Turn Off</button>
        </div>
      </div>`);
    b.querySelector('[data-ok]').addEventListener('click', () => setSettings({ usageNoticeSeen: true }));
    b.querySelector('[data-off]').addEventListener('click', () => {
      setSettings({ usageNoticeSeen: true, shareUsage: false });
      toast('Turned off. Settings can turn it back on.');
    });
    el.footer.append(b);
  }

  if (u.status === 'ready' || u.status === 'manual') {
    const b = h(`
      <div class="banner">
        <strong>${u.status === 'ready' ? 'Update ready' : 'Update available'}</strong>
        <p>Version ${esc(u.version)} ${u.status === 'ready' ? 'is downloaded. Restart to finish — it only takes a second.' : 'is ready to download.'}</p>
        <button class="btn small primary">${u.status === 'ready' ? 'Restart & Update' : 'Download'}</button>
      </div>`);
    b.querySelector('button').addEventListener('click', () => api.installUpdate());
    el.footer.append(b);
  } else if (u.status === 'downloading') {
    el.footer.append(h(`
      <div class="banner">
        <strong>Downloading ${esc(u.version || 'update')}…</strong>
        <div class="progress"><span style="width:${u.percent || 4}%"></span></div>
      </div>`));
  }

  const paused = state.settings.paused;
  const blocked = !state.accessibility;
  const row = h(`
    <div class="status-row">
      <span class="status-dot${paused ? ' paused' : blocked ? ' blocked' : ''}"></span>
      <span>${paused ? 'Paused' : blocked ? 'Waiting for permission' : 'Expanding'}</span>
      <span class="spacer"></span>
      <button class="icon-btn status-toggle" title="${paused ? 'Resume' : 'Pause'}" aria-label="${paused ? 'Resume expansion' : 'Pause expansion'}">${paused ? ICON.play : ICON.pause}</button>
    </div>`);
  row.querySelector('button').addEventListener('click', () => setSettings({ paused: !paused }));
  el.footer.append(row);
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------
function setToolbar(left, right = []) {
  el.tbLeft.innerHTML = left;
  el.tbRight.innerHTML = '';
  right.forEach((n) => el.tbRight.append(n));
}

function toolButton(icon, title, onClick, cls = '') {
  const b = h(`<button class="icon-btn ${cls}" title="${esc(title)}">${icon}</button>`);
  b.addEventListener('click', onClick);
  return b;
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------
function renderView() {
  el.view.innerHTML = '';
  if (state.view === 'editor' && state.macros.snippets[state.selected]) return renderEditor();
  if (state.view === 'builtins') return renderBuiltIns();
  if (state.view === 'library') return renderLibrary();
  if (state.view === 'settings') return renderSettings();
  state.view = 'overview';
  renderNav();
  return renderOverview();
}

// ---- Overview: see overview.js -------------------------------------------

function sparkline(values) {
  const max = Math.max(1, ...values);
  return `<span class="spark" title="Last ${values.length} days">${values.map((v) => `<span style="height:${v ? Math.max(14, (v / max) * 100) : 6}%" class="${v ? 'on' : ''}"></span>`).join('')}</span>`;
}

// ---- Editor ----------------------------------------------------------------
function renderEditor() {
  const i = state.selected;
  const m = state.macros.snippets[i];
  const prefix = state.macros.prefix;

  setToolbar(
    `${m.folder ? `<span class="crumb">${esc(m.folder)}</span><span class="sep">/</span>` : ''}<span class="crumb current">${esc(m.title || 'Untitled')}</span>`,
    [
      h('<span class="save-status">Saved</span>'),
      toolButton(ICON.test, 'Try it', () => openTryIt()),
      pinButton(m),
      toolButton(ICON.copy, `Copy expansion`, copyExpansion),
      toolButton(ICON.duplicate, `Duplicate (${MOD()}D)`, () => duplicateMacro()),
      toolButton(ICON.trash, 'Delete', () => deleteMacro(), 'danger'),
    ],
  );

  const key = statKey(m);
  const usage = state.usage[key] || 0;
  const week = macroDaily(key, 7).reduce((a, b) => a + b, 0);
  const ed = h(`
    <div class="editor">
      <input class="title-input" id="f-title" placeholder="Untitled" value="${esc(m.title)}" autocomplete="off" />
      <div class="props">
        <div class="prop">
          <div class="prop-label">${ICON.keyboard}Abbreviation</div>
          <div class="prop-value">
            <label class="prop-input-wrap">
              <span class="prefix">${esc(prefix)}</span>
              <input id="f-abbr" class="mono" placeholder="sig" value="${esc(m.abbr)}" autocomplete="off" spellcheck="false" />
            </label>
            <div id="abbr-msg" class="prop-msg hidden"></div>
          </div>
        </div>
        <div class="prop">
          <div class="prop-label">${ICON.shortcut}Shortcut</div>
          <div class="prop-value">
            <div class="shortcut-field">
              <button class="prop-shortcut" id="f-shortcut" type="button"></button>
              <button class="icon-btn shortcut-clear" id="f-shortcut-clear" type="button" title="Remove shortcut" aria-label="Remove shortcut">${ICON.close}</button>
            </div>
            <div id="shortcut-msg" class="prop-msg hidden"></div>
          </div>
        </div>
        <div class="prop">
          <div class="prop-label">${ICON.folder}Folder</div>
          <div class="prop-value">
            <label class="prop-input-wrap">
              <input id="f-folder" placeholder="None" value="${esc(m.folder || '')}" autocomplete="off" list="folder-options" />
              <datalist id="folder-options">${folders().map((f) => `<option value="${esc(f)}">`).join('')}</datalist>
            </label>
          </div>
        </div>
        <div class="prop">
          <div class="prop-label">${ICON.format}Format</div>
          <div class="prop-value">
            <button class="prop-select" id="f-format" type="button"></button>
          </div>
        </div>
        <div class="prop">
          <div class="prop-label">${ICON.chart}Used</div>
          <div class="prop-value"><span class="prop-static used">${usage ? `${usage.toLocaleString()} time${usage === 1 ? '' : 's'} · ${week} this week ${sparkline(macroDaily(key, 30))}` : 'Not yet'}</span></div>
        </div>
      </div>
      <div class="divider"></div>
      <div class="content-head">
        <span class="label">Expands to</span>
        <div class="content-tools">
          <div class="fmt-tools" role="toolbar" aria-label="Formatting">
            <button class="fmt-btn" data-fmt="bold" title="Bold (${MOD()}B)">${ICON.bold}</button>
            <button class="fmt-btn" data-fmt="italic" title="Italic (${MOD()}I)">${ICON.italic}</button>
            <button class="fmt-btn" data-fmt="link" title="Link (${MOD()}K)">${ICON.link}</button>
            <button class="fmt-btn" data-fmt="bullets" title="Bulleted list">${ICON.bullets}</button>
            <button class="fmt-btn" data-fmt="numbers" title="Numbered list">${ICON.numbers}</button>
          </div>
          <button class="btn small" id="btn-insert">${ICON.braces}Insert</button>
          <button class="btn small" id="btn-field">${ICON.plus}Add field</button>
        </div>
      </div>
      <textarea id="f-content" class="content-input" placeholder="Type what this macro should expand to…" spellcheck="true">${esc(m.content)}</textarea>
      <div class="preview-card hidden" id="preview-card">
        <div class="head"><span>Preview</span><span id="preview-note"></span></div>
        <div class="body expansion" id="preview-body"></div>
      </div>
    </div>`);
  el.view.append(ed);

  const fTitle = $('#f-title'), fAbbr = $('#f-abbr'), fFolder = $('#f-folder'), fContent = $('#f-content');

  const autosize = () => {
    fContent.style.height = 'auto';
    fContent.style.height = Math.max(72, fContent.scrollHeight) + 'px';
  };
  autosize();

  fTitle.addEventListener('input', () => {
    m.title = fTitle.value;
    $('.crumb.current').textContent = m.title || 'Untitled';
    scheduleSave();
    renderList();
  });
  fAbbr.addEventListener('input', () => {
    m.abbr = fAbbr.value.trim();
    scheduleSave();
    renderList();
    updateEditorMeta();
  });
  fFolder.addEventListener('input', () => {
    m.folder = fFolder.value.trim() || undefined;
    if (!m.folder) delete m.folder;
    scheduleSave();
  });
  fFolder.addEventListener('change', renderList);
  fContent.addEventListener('input', () => {
    m.content = fContent.value;
    autosize();
    scheduleSave();
    renderList();
    updateEditorMeta();
  });

  $('#btn-insert').addEventListener('click', (e) => openInsertMenu(e.currentTarget, fContent));
  $('#btn-field').addEventListener('click', (e) => openFieldPopover(e.currentTarget, fContent));
  $('#f-format').addEventListener('click', (e) => openFormatMenu(e.currentTarget));
  ed.querySelectorAll('.fmt-btn').forEach((b) => {
    // Keep the selection in the text box while clicking.
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => applyFormat(b.dataset.fmt, fContent, b));
  });
  fContent.addEventListener('keydown', (e) => {
    const mod = IS_MAC() ? e.metaKey : e.ctrlKey;
    if (!mod || e.altKey || e.shiftKey) return;
    const k = e.key.toLowerCase();
    const fmt = k === 'b' ? 'bold' : k === 'i' ? 'italic' : k === 'k' ? 'link' : null;
    if (!fmt) return;
    // ⌘K is Quick Insert everywhere else in the window; in the text it's Link.
    e.preventDefault();
    e.stopPropagation();
    applyFormat(fmt, fContent, $('.fmt-btn[data-fmt="link"]'));
  });
  $('#preview-body').addEventListener('click', (e) => {
    const chip = e.target.closest('.field-chip');
    if (chip) openFieldPopover(chip, fContent, chip.dataset.field);
  });
  renderFormatProp();
  wireShortcutField(m);

  updateEditorMeta();
  if (!m.title && !m.abbr && !m.content) fTitle.focus();
}

// A shortcut as separate keys: Ctrl Alt T, or ⌃ ⌥ T on a Mac.
function keycaps(accel) {
  const names = IS_MAC()
    ? { Command: '⌘', Super: '⌘', Control: '⌃', Alt: '⌥', Shift: '⇧' }
    : { Control: 'Ctrl', Super: 'Win', Command: 'Win' };
  return accel.split('+').filter(Boolean).map((k) => `<kbd class="keycap">${esc(names[k] || k)}</kbd>`).join('');
}

// The Shortcut property: click it, then press the keys. Esc cancels;
// Backspace or the × removes the shortcut.
function wireShortcutField(m) {
  const btn = $('#f-shortcut'), clear = $('#f-shortcut-clear'), msg = $('#shortcut-msg');
  const howTo = IS_MAC() ? 'Hold two of ⌃ ⌥ ⌘ ⇧ and press a key.' : 'Hold Ctrl and Alt (or Ctrl and Shift) and press a key.';
  let recording = false;

  const paint = () => {
    btn.classList.toggle('empty', !m.shortcut);
    btn.innerHTML = m.shortcut ? keycaps(m.shortcut) : 'None';
    btn.title = m.shortcut ? 'Change shortcut' : 'Add a shortcut';
    clear.classList.toggle('hidden', !m.shortcut);
  };
  const hint = (text, warn = false) => { msg.className = `prop-msg ${warn ? 'warn' : 'info'}`; msg.textContent = text; };
  const set = (accel) => {
    if (accel) m.shortcut = accel; else delete m.shortcut;
    paint();
    renderList();
    updateEditorMeta();
    flushSave(); // registers the new keys right away
  };
  const stop = () => {
    if (!recording) return;
    recording = false;
    btn.classList.remove('recording');
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('keyup', onKeyUp, true);
    api.setSettings({ __suspendShortcuts: false });
    paint();
    updateEditorMeta();
  };
  const heldMods = (e) => [e.metaKey && (IS_MAC() ? 'Command' : 'Super'), e.ctrlKey && 'Control', e.altKey && 'Alt', e.shiftKey && 'Shift'].filter(Boolean);
  const onKey = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') return stop();
    if ((e.key === 'Backspace' || e.key === 'Delete') && !heldMods(e).length) { stop(); set(''); return; }
    // Show the modifiers as they go down.
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) { btn.innerHTML = keycaps(heldMods(e).join('+')) + '<span class="keycap-more">…</span>'; return; }
    const accel = accelFromEvent(e);
    const problem = accel ? shortcutProblem(accel) : howTo;
    if (problem) { hint(problem, Boolean(accel)); return; }
    stop();
    set(accel);
  };
  const onKeyUp = (e) => {
    if (recording && !heldMods(e).length) btn.textContent = 'Press keys…';
  };

  btn.addEventListener('click', () => {
    if (recording) return stop();
    recording = true;
    btn.classList.add('recording');
    btn.textContent = 'Press keys…';
    hint(`${howTo} Esc cancels.`);
    // Recording Ctrl+Alt+T mustn't fire whatever Ctrl+Alt+T does now.
    api.setSettings({ __suspendShortcuts: true });
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('keyup', onKeyUp, true);
  });
  btn.addEventListener('blur', stop);
  clear.addEventListener('click', () => set(''));
  paint();
}

// Try it: a practice box in a sheet that expands any macro (or built-in) the
// way the real thing will, without leaving the app. Real expansion is
// switched off inside Macro Manager's own windows, so this is the only way to
// test in place. A macro's shortcut works here too (onMacroShortcut).
let tryBox = null;

function openTryIt() {
  const m = state.macros.snippets[state.selected];
  if (!m || tryBox) return;
  const prefix = state.macros.prefix;
  const ways = [
    m.abbr && !abbrProblem(m.abbr, prefix) ? `type <span class="chip">${esc(prefix + m.abbr)}</span> and press Space` : '',
    m.shortcut ? `press ${keycaps(m.shortcut)}` : '',
  ].filter(Boolean);
  const sheet = h(`
    <div class="sheet-backdrop" role="dialog" aria-modal="true" aria-label="Try it">
      <div class="sheet tryit-sheet">
        <h2>Try “${esc(m.title || 'Untitled')}”</h2>
        <p class="tryit-hint">${ways.length ? `In the box, ${ways.join(' or ')}.` : 'Give this macro an abbreviation or a shortcut first.'}</p>
        <textarea id="f-try" rows="3" spellcheck="false" placeholder="Type here"></textarea>
        <div class="sheet-actions"><button class="btn" data-done>Done</button></div>
      </div>
    </div>`);
  const close = () => { sheet.remove(); tryBox = null; };
  sheet.querySelector('[data-done]').addEventListener('click', close);
  sheet.addEventListener('mousedown', (e) => { if (e.target === sheet) close(); });
  sheet.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  document.body.append(sheet);
  tryBox = sheet.querySelector('#f-try');
  wireTryIt(tryBox);
  tryBox.focus();
}

function wireTryIt(box) {
  box.addEventListener('keydown', (e) => {
    if (![' ', 'Tab', 'Enter'].includes(e.key) || e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
    const prefix = state.macros.prefix;
    const caret = box.selectionStart;
    const word = box.value.slice(0, caret).match(/(\S+)$/)?.[1] || '';
    const at = word.lastIndexOf(prefix);
    if (at === -1) return;
    const abbr = word.slice(at + prefix.length).toLowerCase();
    if (!abbr) return;
    const match = state.macros.snippets.find((m) => m.abbr && m.abbr.toLowerCase() === abbr);
    const content = match ? match.content : state.builtIns.some((b) => b.abbr === abbr) ? `{${abbr}}` : null;
    if (content === null || !content.trim()) return;
    e.preventDefault();
    expandInto(box, match, content, caret - (word.length - at), caret);
  });
}

// Replace start…end in the practice box with the expansion.
async function expandInto(box, match, content, start, end) {
  // Fields: ask first, like the real thing. Esc leaves the typing alone.
  let values;
  if (match && fieldsFor(match).length) {
    values = await askFields(match);
    box.focus();
    if (!values) return;
  }
  const { text, cursorBack } = await api.previewTemplate(content, { format: match && match.format, values });
  box.setRangeText(text, start, end, 'end');
  const pos = box.selectionEnd - cursorBack;
  box.setSelectionRange(pos, pos);
  box.style.height = 'auto';
  box.style.height = `${box.scrollHeight}px`;
  box.classList.remove('flash');
  void box.offsetWidth; // restart the highlight
  box.classList.add('flash');
}

// A macro's shortcut was pressed while Macro Manager had focus.
function onMacroShortcut(index) {
  const m = state.macros.snippets[index];
  if (!tryBox || !m || !m.content.trim() || document.activeElement !== tryBox) return;
  expandInto(tryBox, m, m.content, tryBox.selectionStart, tryBox.selectionEnd);
}

function pinButton(m) {
  return toolButton(m.pinned ? ICON.pinFill : ICON.pin, m.pinned ? 'Unpin' : 'Pin to the top', () => togglePin(state.selected), m.pinned ? 'on' : '');
}

let previewSeq = 0;
async function updateEditorMeta() {
  const i = state.selected;
  const m = state.macros.snippets[i];
  if (!m) return;

  const issues = macroIssues(i);
  const show = (msg, warn, info) => {
    const text = warn || info;
    msg.className = `prop-msg ${warn ? 'warn' : 'info'}${text ? '' : ' hidden'}`;
    msg.textContent = text || '';
  };
  show($('#abbr-msg'), issues.abbrWarn, issues.info);
  // While recording, the recorder uses this line for its own hints.
  if (!$('#f-shortcut.recording')) show($('#shortcut-msg'), issues.shortcutWarn);

  // Only show the preview when it differs from the text: placeholders,
  // fields or formatting.
  const card = $('#preview-card');
  const rich = m.format === 'rich';
  const hasFieldTokens = fieldLabels(m.content).length > 0;
  if (!rich && !/\{[a-z0-9+-]+\}/i.test(m.content) && !hasFieldTokens) { card.classList.add('hidden'); return; }
  const seq = ++previewSeq;
  const { html } = await api.previewTemplate(m.content, { format: m.format, chips: true, caret: true });
  if (seq !== previewSeq || !$('#preview-body')) return;
  $('#preview-body').innerHTML = html;
  $('#preview-note').textContent = hasFieldTokens ? 'Click a field to change it' : rich ? 'As it pastes into email' : 'Placeholders filled in';
  card.classList.remove('hidden');
}

// Replace a range of the text box and keep ⌘Z working: insertText goes
// through the browser's undo stack, setRangeText doesn't.
function replaceRange(textarea, a, b, text, select = 'end') {
  textarea.focus();
  textarea.setSelectionRange(a, b);
  if (!document.execCommand('insertText', false, text)) textarea.setRangeText(text, a, b, 'end');
  if (select === 'all') textarea.setSelectionRange(a, a + text.length);
  textarea.dispatchEvent(new Event('input'));
}

function insertToken(textarea, token) {
  const { selectionStart: a, selectionEnd: b } = textarea;
  replaceRange(textarea, a, b, token);
  if (token === '{date+7}') {
    // Select the number so it's easy to change.
    const pos = textarea.selectionEnd - 2;
    textarea.setSelectionRange(pos, pos + 1);
  }
}

function openInsertMenu(anchor, textarea) {
  openMenu(anchor, [
    { label: 'Insert placeholder' },
    ...state.tokens.map((t) => ({
      text: t.label,
      sub: t.desc,
      right: t.token,
      onClick: () => insertToken(textarea, t.token),
    })),
  ], { align: 'right' });
}

// ---- Formatting ---------------------------------------------------------------
// The controls write a small Markdown subset into the text (docs/MACRO-FORMAT.md);
// the Preview shows it formatted. Using one turns the macro's Format to
// Formatted, so existing macros never change on their own.
const FORMATS = [
  { id: 'plain', text: 'Plain text', sub: 'The same in every app' },
  { id: 'rich', text: 'Formatted', sub: 'Bold, links and lists in apps that support them' },
];

function renderFormatProp() {
  const m = state.macros.snippets[state.selected];
  const b = $('#f-format');
  if (!m || !b) return;
  b.innerHTML = `${m.format === 'rich' ? 'Formatted' : 'Plain text'}${ICON.chevron}`;
}

function setFormat(format) {
  const m = state.macros.snippets[state.selected];
  if (!m || (m.format || 'plain') === format) return;
  if (format === 'rich') m.format = 'rich'; else delete m.format;
  renderFormatProp();
  scheduleSave();
  updateEditorMeta();
}

function openFormatMenu(anchor) {
  const m = state.macros.snippets[state.selected];
  openMenu(anchor, FORMATS.map((f) => ({
    text: f.text, sub: f.sub, checked: (m.format || 'plain') === f.id, onClick: () => setFormat(f.id),
  })));
}

function applyFormat(kind, ta, anchor) {
  if (kind === 'link') { openLinkPopover(anchor, ta); return; }
  setFormat('rich');
  if (kind === 'bold') toggleWrap(ta, '**', 'bold text');
  if (kind === 'italic') toggleWrap(ta, '*', 'italic text');
  if (kind === 'bullets') toggleLines(ta, () => '- ', /^- /);
  if (kind === 'numbers') toggleLines(ta, (n) => `${n}. `, /^\d{1,3}[.)] /);
}

// Wrap the selection in a marker, or unwrap it if it already is. With no
// selection, insert a sample and select it so typing replaces it.
function toggleWrap(ta, mark, sample) {
  const { selectionStart: a, selectionEnd: b, value } = ta;
  const sel = value.slice(a, b);
  const n = mark.length;
  // ** is bold; a lone * next to it is not italics.
  const isMark = (at) => value.slice(at, at + n) === mark && (n === 2 || (value[at - 1] !== '*' && value[at + 1] !== '*'));
  if (sel && isMark(a - n) && isMark(b)) {
    replaceRange(ta, a - n, b + n, sel, 'all');
  } else if (sel.length > 2 * n && sel.startsWith(mark) && sel.endsWith(mark)) {
    replaceRange(ta, a, b, sel.slice(n, -n), 'all');
  } else {
    // Markers hug the words: keep spaces at either end of the selection outside.
    const lead = sel.match(/^\s*/)[0], trail = sel.slice(lead.length).match(/\s*$/)[0];
    const inner = sel.trim() || sample;
    replaceRange(ta, a, b, `${lead}${mark}${inner}${mark}${trail}`);
    const start = a + lead.length + n;
    ta.setSelectionRange(start, start + inner.length);
  }
}

// Turn the selected lines into a list, or back into plain lines.
function toggleLines(ta, marker, re) {
  const { value } = ta;
  const a = value.lastIndexOf('\n', ta.selectionStart - 1) + 1;
  let b = value.indexOf('\n', ta.selectionEnd - (ta.selectionEnd > ta.selectionStart && value[ta.selectionEnd - 1] === '\n' ? 1 : 0));
  if (b === -1) b = value.length;
  const lines = value.slice(a, b).split('\n');
  const filled = lines.filter((l) => l.trim());
  const on = filled.length > 0 && filled.every((l) => re.test(l));
  const strip = (l) => l.replace(/^(- |\d{1,3}[.)] )/, '');
  let n = 0;
  const next = lines.map((l) => (!l.trim() ? l : on ? strip(l) : marker(++n) + strip(l))).join('\n');
  replaceRange(ta, a, b, next, 'all');
}

// ---- Popovers (link, field) ----------------------------------------------------
let popoverCleanup = null;
function openPopover(anchor, content, { align = 'right' } = {}) {
  closePopover();
  closeMenu();
  const pop = h('<div class="popover" role="dialog"></div>');
  pop.append(content);
  document.body.append(pop);
  const r = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  let left = align === 'right' ? r.right - pw : r.left;
  let top = r.bottom + 6;
  if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
  left = Math.min(Math.max(8, left), window.innerWidth - pw - 8);
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
  const onDown = (e) => { if (!pop.contains(e.target) && !anchor.contains(e.target)) closePopover(); };
  setTimeout(() => document.addEventListener('mousedown', onDown), 0);
  pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); closePopover(true); } });
  popoverCleanup = (refocus) => {
    document.removeEventListener('mousedown', onDown);
    pop.remove();
    if (refocus) $('#f-content')?.focus();
  };
  pop.querySelector('input, textarea')?.focus();
  return pop;
}

function closePopover(refocus = false) {
  if (popoverCleanup) { const f = popoverCleanup; popoverCleanup = null; f(refocus); }
}

function openLinkPopover(anchor, ta) {
  const { selectionStart: a, selectionEnd: b, value } = ta;
  const sel = value.slice(a, b);
  const selIsUrl = /^(https?:\/\/|mailto:|tel:|www\.)\S+$/i.test(sel.trim());
  const form = h(`
    <form class="pop-form">
      <h3>Add link</h3>
      <label class="pop-row"><span>Text</span><input id="pl-text" placeholder="What people see" value="${esc(selIsUrl ? '' : sel)}" /></label>
      <label class="pop-row"><span>Link</span><input id="pl-url" placeholder="https://" value="${esc(selIsUrl ? sel.trim() : '')}" spellcheck="false" /></label>
      <div class="pop-msg hidden" id="pl-msg"></div>
      <div class="pop-actions"><span class="spacer"></span><button type="button" class="btn small" data-cancel>Cancel</button><button class="btn small primary">Add link</button></div>
    </form>`);
  form.querySelector('[data-cancel]').addEventListener('click', () => closePopover(true));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    let url = form.querySelector('#pl-url').value.trim();
    if (/^www\./i.test(url) || /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(url)) url = `https://${url}`;
    else if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(url)) url = `mailto:${url}`;
    if (!/^(https?:\/\/|mailto:|tel:)\S+$/i.test(url)) {
      const msg = form.querySelector('#pl-msg');
      msg.textContent = 'Use a web address, an email address, or tel: and a number.';
      msg.classList.remove('hidden');
      return;
    }
    const text = form.querySelector('#pl-text').value.trim().replace(/[[\]]/g, '') || url.replace(/^(mailto:|tel:)/, '');
    closePopover();
    setFormat('rich');
    replaceRange(ta, a, b, `[${text}](${url})`);
  });
  const pop = openPopover(anchor, form);
  // Focus whichever box still needs filling.
  pop.querySelector(sel && !selIsUrl ? '#pl-url' : '#pl-text').focus();
}

// Add a field at the caret, or (with `label`) change or remove an existing one.
// One-click starting points in Add field; any label works.
const FIELD_IDEAS = ['Name', 'Unit', 'Address', 'Date', 'Time', 'Phone', 'Email'];

function openFieldPopover(anchor, ta, label) {
  const m = state.macros.snippets[state.selected];
  const { selectionStart: a, selectionEnd: b } = ta;
  const editing = Boolean(label);
  const def = editing ? (m.fields || []).find((f) => f.label.toLowerCase() === label.toLowerCase()) || { label } : { label: '' };
  let list = Boolean(def.choices);
  const form = h(`
    <form class="pop-form field-pop">
      <h3>${editing ? 'Edit field' : 'Add field'}</h3>
      <label class="pop-row"><span>Ask for</span><input id="pf-label" maxlength="40" placeholder="Unit, address, move-in date…" value="${esc(def.label)}" /></label>
      ${editing ? '' : `<div class="pop-row"><span></span><div class="field-ideas">${FIELD_IDEAS.map((x) => `<button type="button" class="field-idea">${esc(x)}</button>`).join('')}</div></div>`}
      <div class="pop-row"><span>Answer</span>
        <div class="seg" role="radiogroup">
          <button type="button" role="radio" data-kind="text">Typed in</button>
          <button type="button" role="radio" data-kind="list">From a list</button>
        </div>
      </div>
      <label class="pop-row" data-for="text"><span>Default</span><input id="pf-default" placeholder="Optional" value="${esc(def.default || '')}" /></label>
      <label class="pop-row top" data-for="list"><span>Choices</span><textarea id="pf-choices" rows="4" placeholder="One per line">${esc((def.choices || []).join('\n'))}</textarea></label>
      <p class="pop-note" data-for="text">You’ll be asked for this each time the macro expands.</p>
      <p class="pop-note" data-for="list">The first choice is picked unless you change it.</p>
      <div class="pop-msg hidden" id="pf-msg"></div>
      <div class="pop-actions">
        ${editing ? '<button type="button" class="btn small danger-text" data-remove>Remove</button>' : ''}
        <span class="spacer"></span>
        <button type="button" class="btn small" data-cancel>Cancel</button>
        <button class="btn small primary">${editing ? 'Save' : 'Add field'}</button>
      </div>
    </form>`);
  const showKind = () => {
    form.querySelectorAll('.seg button').forEach((x) => x.setAttribute('aria-checked', String((x.dataset.kind === 'list') === list)));
    form.querySelectorAll('[data-for]').forEach((x) => x.classList.toggle('hidden', (x.dataset.for === 'list') !== list));
  };
  form.querySelectorAll('.seg button').forEach((x) => x.addEventListener('click', () => {
    list = x.dataset.kind === 'list';
    showKind();
    form.querySelector(list ? '#pf-choices' : '#pf-default').focus();
  }));
  showKind();
  form.querySelectorAll('.field-idea').forEach((x) => x.addEventListener('click', () => {
    const input = form.querySelector('#pf-label');
    input.value = x.textContent;
    input.focus();
  }));
  form.querySelector('[data-cancel]').addEventListener('click', () => closePopover(true));
  form.querySelector('[data-remove]')?.addEventListener('click', () => {
    closePopover();
    m.fields = (m.fields || []).filter((f) => f.label.toLowerCase() !== label.toLowerCase());
    replaceRange(ta, 0, ta.value.length, removeFieldFromContent(ta.value, label));
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = cleanLabel(form.querySelector('#pf-label').value);
    const msg = form.querySelector('#pf-msg');
    const fail = (t) => { msg.textContent = t; msg.classList.remove('hidden'); };
    if (!name) return fail(/[{}]/.test(form.querySelector('#pf-label').value) ? 'Fields can’t contain { or }.' : 'Type what this field asks for, like Unit or Address.');
    const choices = form.querySelector('#pf-choices').value.split('\n').map((c) => c.trim()).filter(Boolean);
    if (list && !choices.length) return fail('Add at least one choice, one per line.');
    const key = name.toLowerCase();
    const renaming = editing && key !== label.toLowerCase();
    if (renaming && ((m.fields || []).some((f) => f.label.toLowerCase() === key) || fieldLabels(ta.value).some((l) => l.toLowerCase() === key))) {
      return fail('Another field already asks for that.');
    }
    // Adding a name that's already here reuses that field: one answer, used
    // in both places.
    const dflt = form.querySelector('#pf-default').value.trim();
    const next = { label: name, ...(list ? { choices } : dflt ? { default: dflt } : {}) };
    const drop = [key, editing ? label.toLowerCase() : key];
    m.fields = [...(m.fields || []).filter((f) => !drop.includes(f.label.toLowerCase())), next];
    closePopover();
    if (editing) {
      if (name !== label) replaceRange(ta, 0, ta.value.length, renameFieldInContent(ta.value, label, name));
      else { scheduleSave(); updateEditorMeta(); ta.focus(); }
    } else {
      replaceRange(ta, a, b, fieldToken(name));
    }
  });
  openPopover(anchor, form, { align: editing ? 'left' : 'right' });
}

// The fill-in form in a sheet, for Try it. Resolves with the answers, or null.
function askFields(macro) {
  return new Promise((resolve) => {
    const sheet = h(`
      <div class="sheet-backdrop" role="dialog" aria-modal="true">
        <div class="sheet fill-sheet">
          <h2>${esc(macro.title || 'Untitled')}</h2>
          <div class="fill-host"></div>
          <div class="fill-preview-body expansion" id="ask-preview"></div>
          <div class="sheet-actions"><button class="btn" data-cancel>Cancel</button><button class="btn primary" data-ok>Insert</button></div>
        </div>
      </div>`);
    let seq = 0;
    const preview = async (values) => {
      const n = ++seq;
      const { html } = await api.previewTemplate(macro.content, { format: macro.format, values, chips: true });
      if (n === seq) sheet.querySelector('#ask-preview').innerHTML = html;
    };
    const done = (values) => { sheet.remove(); resolve(values); };
    const form = createFillForm({ macro, memory: state.fieldMemory || {}, onChange: preview, onSubmit: done, onCancel: () => done(null) });
    sheet.querySelector('.fill-host').append(form.el);
    sheet.querySelector('[data-cancel]').addEventListener('click', () => done(null));
    sheet.querySelector('[data-ok]').addEventListener('click', () => done(form.values()));
    sheet.addEventListener('mousedown', (e) => { if (e.target === sheet) done(null); });
    document.body.append(sheet);
    preview(form.values());
    form.focus();
  });
}

async function newMacro(inFolder) {
  if (state.view === 'editor' && saveTimer) await flushSave();
  const s = state.macros.snippets;
  // Reuse an existing blank draft instead of stacking up new ones.
  const blank = s.findIndex((m) => !m.title && !m.abbr && !m.shortcut && !m.content);
  if (blank !== -1) return go('editor', blank);
  const folder = typeof inFolder === 'string' ? inFolder : state.view === 'editor' ? s[state.selected]?.folder : undefined;
  s.push({ title: '', abbr: '', content: '', ...(folder ? { folder } : {}) });
  await go('editor', s.length - 1);
}

async function copyExpansion() {
  await copyMacroText(state.selected);
}

// ---- Built-ins -------------------------------------------------------------
async function renderBuiltIns() {
  setToolbar('');
  const prefix = state.macros.prefix;
  const page = h(`
    <div class="page">
      <div class="page-head">
        <h1>Date &amp; Time</h1>
        <p>Built-in abbreviations that always type the current date or time. Click one to copy it. A macro with the same abbreviation replaces the built-in.</p>
      </div>
      <div class="list-card" id="builtin-list"></div>
    </div>`);
  el.view.append(page);
  const list = $('#builtin-list');
  for (const b of state.builtIns) {
    const { text } = await api.previewTemplate(`{${b.abbr}}`);
    const overridden = state.macros.snippets.some((m) => m.abbr.toLowerCase() === b.abbr);
    const row = h(`
      <button class="list-row">
        <div class="main">
          <div class="name">${esc(b.title)}</div>
          <div class="sub">${overridden ? 'Replaced by one of your macros' : esc(b.desc)}</div>
        </div>
        <span class="value">${esc(text)}</span>
        <span class="chip">${esc(prefix + b.abbr)}</span>
      </button>`);
    row.addEventListener('click', async () => {
      const { text: now } = await api.previewTemplate(`{${b.abbr}}`);
      await navigator.clipboard.writeText(now);
      toast(`Copied ${now}`);
    });
    row.addEventListener('contextmenu', async (e) => {
      e.preventDefault();
      const choice = await api.popupMenu([
        { id: 'value', label: 'Copy Value' },
        { id: 'abbr', label: `Copy “${prefix}${b.abbr}”` },
      ]);
      if (choice === 'value') row.click();
      if (choice === 'abbr') { await navigator.clipboard.writeText(prefix + b.abbr); toast('Copied'); }
    });
    list.append(row);
  }
}

// ---- Settings --------------------------------------------------------------
async function setSettings(patch) {
  state.settings = await api.setSettings(patch);
  renderFooter();
  if (state.view === 'settings') renderView();
  if (state.view === 'overview') renderView();
  return state.settings;
}

function switchEl(on, onToggle) {
  const b = h(`<button class="switch" role="switch" aria-checked="${on}"></button>`);
  b.addEventListener('click', () => onToggle(!on));
  return b;
}

function groupRow({ name, sub, subClass = '', controls = [] }) {
  const row = h(`
    <div class="group-row">
      <div class="main"><div class="name">${name}</div>${sub ? `<div class="sub ${subClass}">${sub}</div>` : ''}</div>
      <div class="controls"></div>
    </div>`);
  controls.forEach((c) => row.querySelector('.controls').append(c));
  return row;
}

function group(label, rows) {
  const frag = document.createDocumentFragment();
  frag.append(h(`<div class="group-label">${label}</div>`));
  const g = h('<div class="group"></div>');
  rows.forEach((r) => g.append(r));
  frag.append(g);
  return frag;
}

function button(label, onClick, cls = '') {
  const b = h(`<button class="btn ${cls}">${label}</button>`);
  b.addEventListener('click', onClick);
  return b;
}

// Convert a keydown into an Electron accelerator string.
function accelFromEvent(e) {
  const mods = [];
  if (e.metaKey) mods.push(IS_MAC() ? 'Command' : 'Super');
  if (e.ctrlKey) mods.push('Control');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  const code = e.code;
  let key = null;
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3);
  else if (/^Digit\d$/.test(code)) key = code.slice(5);
  else if (/^F\d{1,2}$/.test(code)) key = code;
  else key = { Space: 'Space', Period: '.', Comma: ',', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right' }[code] || null;
  if (!key) return null;
  const hasRealModifier = mods.some((m) => m !== 'Shift');
  if (!hasRealModifier && !/^F\d/.test(key)) return null;
  return [...mods, key].join('+');
}

function shortcutRecorder(settingKey) {
  const b = h(`<button class="recorder">${esc(prettyAccel(state.settings[settingKey]))}</button>`);
  let recording = false;
  const stop = (save) => {
    recording = false;
    b.classList.remove('recording');
    document.removeEventListener('keydown', onKey, true);
    if (!save) b.textContent = prettyAccel(state.settings[settingKey]);
    api.setSettings({ __suspendShortcuts: false });
  };
  const onKey = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') return stop(false);
    if (e.key === 'Backspace' || e.key === 'Delete') { stop(true); setSettings({ [settingKey]: '' }); return; }
    const accel = accelFromEvent(e);
    if (!accel) { b.textContent = 'Add ⌘, Ctrl or Alt…'; return; }
    stop(true);
    setSettings({ [settingKey]: accel });
  };
  b.addEventListener('click', () => {
    if (recording) return stop(false);
    recording = true;
    b.classList.add('recording');
    b.textContent = 'Type shortcut…';
    api.setSettings({ __suspendShortcuts: true });
    document.addEventListener('keydown', onKey, true);
  });
  b.addEventListener('blur', () => recording && stop(false));
  return b;
}

function prefixPicker() {
  const key = h(`<span class="prefix-key">${esc(state.macros.prefix)}</span>`);
  const btn = h('<button class="btn small">Change…</button>');
  let listening = false;
  const stop = () => {
    listening = false;
    btn.textContent = 'Change…';
    document.removeEventListener('keydown', onKey, true);
  };
  const onKey = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') return stop();
    if (e.key.length !== 1 || /[a-z0-9\s]/i.test(e.key) || !PUNCTUATION.includes(e.key)) {
      btn.textContent = 'Use a symbol key';
      return;
    }
    stop();
    state.macros.prefix = e.key;
    state.macros = await api.saveMacros(state.macros);
    renderList();
    renderView();
    toast(`Prefix is now ${e.key}`);
  };
  btn.addEventListener('click', () => {
    if (listening) return stop();
    listening = true;
    btn.textContent = 'Press a key…';
    document.addEventListener('keydown', onKey, true);
  });
  btn.addEventListener('blur', () => listening && stop());
  return [key, btn];
}

function updateControls() {
  const u = state.update;
  const map = {
    idle:        ['', 'Check for Updates', () => api.checkForUpdates()],
    checking:    ['Checking for updates…', null],
    latest:      ['You’re on the latest version.', 'Check Again', () => api.checkForUpdates()],
    downloading: [`Downloading ${u.version || ''}${u.percent ? ` — ${u.percent}%` : '…'}`, null],
    ready:       [`Version ${u.version} is ready to install.`, 'Restart & Update', () => api.installUpdate()],
    manual:      [`Version ${u.version} is available.`, 'Download', () => api.installUpdate()],
    error:       [u.message || 'Couldn’t check for updates.', 'Try Again', () => api.checkForUpdates()],
  };
  return map[u.status] || map.idle;
}

function renderSettings() {
  setToolbar('');
  const st = state.settings;
  const errs = st.shortcutErrors || {};
  const page = h(`
    <div class="page">
      <div class="page-head"><h1>Settings</h1></div>
    </div>`);

  page.append(group('Expansion', [
    groupRow({ name: 'Trigger prefix', sub: `Type this before an abbreviation, e.g. ${esc(state.macros.prefix)}sig`, controls: prefixPicker() }),
    groupRow({ name: 'Pause expansion', sub: 'Temporarily stop macros from expanding.', controls: [switchEl(st.paused, (v) => setSettings({ paused: v }))] }),
    groupRow({ name: 'Launch at login', sub: 'Start quietly in the background so macros always work.', controls: [switchEl(st.launchAtLogin, (v) => setSettings({ launchAtLogin: v }))] }),
    ...(IS_MAC() ? [groupRow({
      name: 'Accessibility access',
      sub: state.accessibility ? 'Granted — macros can type into other apps.' : 'Required for macros to expand in other apps.',
      subClass: state.accessibility ? '' : 'warn',
      controls: state.accessibility ? [] : [button('Open System Settings', () => api.requestAccessibility(), 'small')],
    })] : []),
  ]));

  page.append(group('Shortcuts', [
    groupRow({
      name: 'Quick Insert',
      sub: errs.quickInsertShortcut || 'Search your macros from any app and paste one.',
      subClass: errs.quickInsertShortcut ? 'warn' : '',
      controls: [shortcutRecorder('quickInsertShortcut')],
    }),
    groupRow({
      name: 'Show Macro Manager',
      sub: errs.openWindowShortcut || 'Open or hide this window.',
      subClass: errs.openWindowShortcut ? 'warn' : '',
      controls: [shortcutRecorder('openWindowShortcut')],
    }),
  ]));

  const seg = h(`<div class="segmented">${['system', 'light', 'dark'].map((t) => `<button data-t="${t}" aria-pressed="${st.theme === t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div>`);
  seg.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => setSettings({ theme: b.dataset.t })));
  page.append(group('Appearance', [groupRow({ name: 'Theme', controls: [seg] })]));

  page.append(group('Your data', [
    groupRow({
      name: 'Back up or move your macros',
      sub: 'Export to a file you can import on another computer.',
      controls: [
        button('Import…', async () => {
          const r = await api.importMacros();
          if (r.ok) toast(r.added ? `Imported ${r.added} macro${r.added === 1 ? '' : 's'}${r.skipped ? ` · ${r.skipped} already existed` : ''}` : 'Nothing new to import');
          else if (r.error) toast(r.error);
        }, 'small'),
        button('Export…', async () => {
          const r = await api.exportMacros();
          if (r.ok) toast(`Exported ${r.count} macros`);
          else if (r.error) toast(r.error);
        }, 'small'),
      ],
    }),
    groupRow({
      name: 'Add to the total',
      sub: 'Once an hour, adds how many times you used a macro, and the characters that saved, to a total across everyone. Never your name, which macros you used, your macros, or anything you type. Your per-macro stats stay on this computer. A random ID made here stops a count being added twice.',
      controls: [
        button('See It', () => window.open(state.statsUrl), 'small'),
        switchEl(st.shareUsage, (v) => setSettings({ shareUsage: v, usageNoticeSeen: true })),
      ],
    }),
    groupRow({
      name: 'Stored on this computer',
      sub: `<span class="path">${esc(state.dataPath)}</span><br>A backup is saved each day and kept for two weeks.`,
      controls: [button(IS_MAC() ? 'Show in Finder' : 'Show in Explorer', () => api.openDataFolder(), 'small')],
    }),
  ]));

  const [uText, uLabel, uAction] = updateControls();
  page.append(group('About', [
    groupRow({
      name: `Macro Manager ${esc(state.version)}`,
      sub: esc(uText) || 'Updates install automatically.',
      controls: uLabel ? [button(uLabel, uAction, 'small')] : [],
    }),
    groupRow({
      name: 'What’s new',
      sub: 'The highlights of this version.',
      controls: [button('Show', () => showWhatsNew(), 'small')],
    }),
    groupRow({
      name: 'Release notes & downloads',
      sub: 'github.com/throughnateseyes/macro-manager',
      controls: [button('Open', () => api.openReleases(), 'small')],
    }),
  ]));

  el.view.append(page);
}

// ---------------------------------------------------------------------------
// Popup menu
// ---------------------------------------------------------------------------
let menuCleanup = null;
function openMenu(anchor, items, { align = 'left' } = {}) {
  closeMenu();
  el.menu.innerHTML = '';
  for (const it of items) {
    if (it.sep) { el.menu.append(h('<div class="menu-sep"></div>')); continue; }
    if (it.label) { el.menu.append(h(`<div class="menu-label">${esc(it.label)}</div>`)); continue; }
    const b = h(`
      <button class="menu-item" role="menuitem">
        ${it.checked !== undefined ? (it.checked ? ICON.check : '<span class="check"></span>') : ''}
        <span class="main"><div>${esc(it.text)}</div>${it.sub ? `<div class="sub">${esc(it.sub)}</div>` : ''}</span>
        ${it.right ? `<span class="chip">${esc(it.right)}</span>` : ''}
      </button>`);
    b.addEventListener('click', () => { closeMenu(); it.onClick(); });
    el.menu.append(b);
  }
  el.menu.classList.remove('hidden');
  const r = anchor.getBoundingClientRect();
  const mw = el.menu.offsetWidth, mh = el.menu.offsetHeight;
  let left = align === 'right' ? r.right - mw : r.left;
  let top = r.bottom + 6;
  if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6);
  left = Math.min(Math.max(8, left), window.innerWidth - mw - 8);
  el.menu.style.left = `${left}px`;
  el.menu.style.top = `${top}px`;

  const onDown = (e) => { if (!el.menu.contains(e.target) && !anchor.contains(e.target)) closeMenu(); };
  setTimeout(() => document.addEventListener('mousedown', onDown), 0);
  menuCleanup = () => document.removeEventListener('mousedown', onDown);
}

function closeMenu() {
  el.menu.classList.add('hidden');
  if (menuCleanup) { menuCleanup(); menuCleanup = null; }
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------
document.querySelectorAll('.nav-item').forEach((b) => b.addEventListener('click', () => go(b.dataset.view)));
$('#btn-new').addEventListener('click', newMacro);
$('#btn-sort').addEventListener('click', (e) => {
  const opts = [['name', 'Name'], ['usage', 'Most used'], ['recent', 'Recently added']];
  openMenu(e.currentTarget, [
    { label: 'Sort by' },
    ...opts.map(([k, text]) => ({
      text,
      checked: state.sort === k,
      onClick: () => { state.sort = k; writeLocal('sort', k); renderList(); },
    })),
  ], { align: 'right' });
});

// The search box at the top is Quick Insert: the same window and the same
// shortcut as everywhere else on the machine. Filtering the library lives on
// the Macros page.
el.search.addEventListener('click', () => api.showPalette());

function updateSearchKbd() {
  el.searchKbd.textContent = prettyAccel(state.settings.quickInsertShortcut).replace(/ \+ /g, '+').replace(' Space', 'Space');
}

function isTyping() {
  const a = document.activeElement;
  return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA');
}

document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  const k = e.key.toLowerCase();

  if (mod && k === 'n') { e.preventDefault(); newMacro(); return; }
  if (mod && k === 'k') { e.preventDefault(); api.showPalette(); return; }
  if (mod && k === 'z' && !e.shiftKey && pendingDelete && !isTyping()) { e.preventDefault(); undoDelete(); return; }
  if (mod && k === 'f') { e.preventDefault(); go('library').then(() => $('#lib-q')?.focus()); return; }
  if (mod && k === ',') { e.preventDefault(); go('settings'); return; }
  if (mod && k === 's') { e.preventDefault(); if (state.view === 'editor') flushSave().then(() => toast('Saved')); return; }
  if (mod && k === 'd' && state.view === 'editor') { e.preventDefault(); duplicateMacro(); return; }
  if (mod && e.key === 'Backspace' && state.view === 'editor' && !isTyping()) { e.preventDefault(); deleteMacro(); return; }

  if (e.key === 'Escape') {
    if (popoverCleanup) { closePopover(true); return; }
    if (!el.menu.classList.contains('hidden')) { closeMenu(); return; }
    if (isTyping()) { document.activeElement.blur(); return; }
    if (state.view !== 'overview') go('overview');
    return;
  }

  if (!isTyping() && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    e.preventDefault();
    moveSelection(e.key === 'ArrowDown' ? 1 : -1);
  }
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
(async () => {
  const s = await api.getState();
  Object.assign(state, {
    macros: s.macros,
    usage: s.usage,
    stats: s.stats,
    today: s.today,
    settings: s.settings,
    version: s.version,
    platform: s.platform,
    dataPath: s.dataPath,
    statsUrl: s.statsUrl,
    accessibility: s.accessibility,
    update: s.update,
    builtIns: s.builtIns,
    tokens: s.tokens,
    fieldMemory: s.fieldMemory || {},
  });
  document.body.classList.add(IS_MAC() ? 'mac' : 'win');
  if (!IS_MAC()) {
    Object.assign(ICON, WIN_ICON);
    $('#btn-sort').innerHTML = ICON.sort;
    $('#btn-new').innerHTML = ICON.plus;
    el.search.querySelector('.icon').outerHTML = ICON.search;
  }
  updateSearchKbd();
  render();
  maybeShowWhatsNew();

  api.onStatsChanged(({ usage, stats }) => {
    state.usage = usage;
    state.stats = stats;
    state.today = dayKey(new Date());
    if (state.view === 'overview') renderView();
    if (state.sort === 'usage') renderList();
  });
  api.onMacrosChanged((macros) => {
    // Ignore echoes of our own saves while typing.
    if (saveTimer) return;
    // Changed in another window (Quick Insert, an import). Re-render the
    // editor too: it holds references into the old state.macros.
    // While typing in the editor, keep its live macro object (so no keystroke
    // is lost) and take only the pin state from the incoming copy.
    const editing = state.view === 'editor' && document.activeElement?.closest('.editor');
    const live = state.macros.snippets[state.selected];
    if (editing && live && macros.snippets.length === state.macros.snippets.length) {
      const incoming = macros.snippets[state.selected];
      if (incoming?.pinned) live.pinned = true; else delete live.pinned;
      macros.snippets[state.selected] = live;
    }
    state.macros = macros;
    renderList();
    if (!editing) renderView();
  });
  api.onMacroShortcut(onMacroShortcut);
  api.onSettingsChanged((settings) => {
    state.settings = settings;
    updateSearchKbd();
    renderFooter();
    // Shortcut clashes come back from main once it has registered them.
    renderList();
    if (state.view === 'editor') updateEditorMeta();
    if (state.view === 'settings' || state.view === 'overview') renderView();
  });
  api.onUpdateState((u) => {
    state.update = u;
    renderFooter();
    if (state.view === 'settings') renderView();
  });
  api.onAccessibility((granted) => {
    if (granted === state.accessibility) return;
    state.accessibility = granted;
    renderFooter();
    if (state.view !== 'editor') renderView();
  });
  api.onInsertToken((token) => {
    const ta = $('#f-content');
    if (ta) insertToken(ta, token);
  });
  el.list.addEventListener('contextmenu', (e) => { if (e.target === el.list || e.target.closest('.list-empty')) showListMenu(e); });
  api.onNavigate((page) => {
    if (page === 'new') newMacro();
    else if (page.startsWith('macro:')) go('editor', Number(page.slice(6)));
    else go(page);
  });
})();
