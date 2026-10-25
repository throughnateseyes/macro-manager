// ---------------------------------------------------------------------------
// Overview — three directions, under exploration
//
//   sky    the portfolio's dithered clouds drifting behind one plain sentence;
//          the sky fills in as the day's expansions add up
//   lanes  your own macros moving past in three lanes, biggest = most used
//   board  a split-flap departures board; digits flip only when they change
//
// Loaded before app.js and called from it, so everything here reads app.js's
// globals (state, h, esc, dayTotal…) at call time. The direction chooser only
// appears in the browser preview (window.MM_DEV) until one is picked.
// ---------------------------------------------------------------------------
const DIRECTIONS = [['sky', 'Sky'], ['lanes', 'Lanes'], ['board', 'Board']];
let overviewDirection = (() => {
  try { return JSON.parse(localStorage.getItem('overviewDirection')) || 'sky'; } catch { return 'sky'; }
})();

const REDUCED_MOTION = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- Numbers every direction shows -------------------------------------------
function overviewNumbers() {
  const s = state.macros.snippets;
  const usageTotal = Object.entries(state.usage)
    .filter(([abbr]) => s.some((m) => m.abbr === abbr))
    .reduce((n, [, c]) => n + c, 0);
  const lifetime = state.stats.lifetime || usageTotal;
  const minutes = (state.stats.charsSaved || 0) / CHARS_PER_MINUTE || timeSavedMinutes();
  const next = nextMilestone(lifetime);
  const prev = [...MILESTONES].reverse().find((m) => m <= lifetime) || 0;
  return {
    lifetime,
    today: dayTotal(dayKey(new Date())),
    streak: currentStreak(),
    best: bestStreak(),
    minutes,
    next,
    prev,
    toNext: next ? next - lifetime : 0,
    progress: next ? (lifetime - prev) / (next - prev) : 1,
    since: state.stats.since ? new Date(`${state.stats.since}T12:00:00`) : null,
  };
}

// "2 hours", "35 minutes", "3 workdays" — what the saved typing adds up to.
function savedPhrase(min) {
  if (min < 1) return 'your first minute of typing saved is on its way';
  if (min < 60) return `about ${Math.round(min)} minute${Math.round(min) === 1 ? '' : 's'} of typing you didn’t have to do`;
  const hrs = min / 60;
  if (hrs < 8) return `about ${hrs < 3 ? hrs.toFixed(1).replace(/\.0$/, '') : Math.round(hrs)} hours of typing you didn’t have to do`;
  const days = hrs / 8;
  return `about ${days < 3 ? days.toFixed(1).replace(/\.0$/, '') : Math.round(days)} full workdays of typing you didn’t have to do`;
}

function sinceText(d) {
  if (!d) return '';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

function greeting() {
  const hr = new Date().getHours();
  return hr < 5 ? 'Working late' : hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
}

function rankedMacros(range, limit) {
  const usage = usageInRange(range);
  return state.macros.snippets
    .map((m, i) => ({ m, i, n: usage[m.abbr] || 0 }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, limit);
}

// One quiet line instead of a tips grid nobody reads after day one.
function tipLine() {
  const tips = [
    `Forgot an abbreviation? Press ${prettyAccel(state.settings.quickInsertShortcut)} in any app to search and paste.`,
    'Put {cursor} in a macro to choose where the cursor lands after it expands.',
    '{date+7} types the date a week from today. Change the number for any offset.',
    'Pin a macro from its editor to keep it one click away in the menu bar.',
    'Your macros are backed up every day for two weeks. Export them from Settings.',
  ];
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  return h(`<p class="ov-tip">${esc(tips[dayOfYear % tips.length])}</p>`);
}

function statusSentence() {
  const prefix = state.macros.prefix;
  if (!state.accessibility) return 'Macro Manager needs Accessibility permission before it can expand anything.';
  if (state.settings.paused) return 'Expansion is paused. Resume it from the bottom of the sidebar.';
  return `Type ${prefix} and an abbreviation in any app, then Space, Tab or Enter.`;
}

function directionChooser() {
  if (!window.MM_DEV) return null;
  const c = h(`<div class="ov-chooser" role="group" aria-label="Overview direction">${DIRECTIONS.map(([k, t]) => `<button data-k="${k}" aria-pressed="${overviewDirection === k}">${t}</button>`).join('')}</div>`);
  c.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    overviewDirection = b.dataset.k;
    try { localStorage.setItem('overviewDirection', JSON.stringify(overviewDirection)); } catch { /* not remembered */ }
    renderView();
  }));
  return c;
}

// ---- Entry point (called by app.js) ---------------------------------------------
function renderOverview() {
  const quick = h(`<button class="btn">${ICON.search}Quick Insert</button>`);
  quick.addEventListener('click', () => api.showPalette());
  const add = h(`<button class="btn primary">${ICON.plus}New Macro</button>`);
  add.addEventListener('click', newMacro);
  setToolbar('', [quick, add]);

  const page = h(`<div class="page ov ov-${overviewDirection}"></div>`);
  const chooser = directionChooser();
  if (chooser) el.view.append(chooser);

  if (!state.macros.snippets.length) {
    page.append(emptyOverview());
  } else if (overviewDirection === 'lanes') {
    renderLanes(page);
  } else if (overviewDirection === 'board') {
    renderBoard(page);
  } else {
    renderSky(page);
  }
  page.append(tipLine());
  el.view.append(page);
}

function emptyOverview() {
  const prefix = state.macros.prefix;
  const hero = h(`
    <div class="hero">
      <h2>Create your first macro</h2>
      <p>Save text you type over and over, like a signature, a reply or an address, and give it a short abbreviation.</p>
      <div class="example"><span class="chip">${esc(prefix)}sig</span> becomes <span>Best, Nate</span></div>
      <div><button class="btn primary">${ICON.plus}New Macro</button></div>
    </div>`);
  hero.querySelector('button').addEventListener('click', newMacro);
  return hero;
}

// =============================================================================
// 1. SKY — the portfolio's clouds, made of your day
// =============================================================================
// Same construction as throughnateseyes.com's home backdrop: periodic value
// noise, four octaves, thresholded through an 8×8 Bayer matrix into 3px dots,
// tileable so a breeze can slide it forever without a seam. Rendered as a
// MASK, so the dot colour is a CSS token and follows light/dark for free.
// The threshold follows today's count: a quiet morning is mostly clear sky,
// a busy afternoon clouds over.

const SKY_W = 1200, SKY_H = 360, SKY_DOT = 3;
const BAYER8 = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41,
  51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
].map((v) => (v + 0.5) / 64);

function periodicNoise(px, py, seed) {
  const g = new Float32Array(px * py);
  let s = seed;
  for (let i = 0; i < g.length; i++) { s = (s * 16807) % 2147483647; g[i] = s / 2147483647; }
  const at = (x, y) => g[(((y % py) + py) % py) * px + (((x % px) + px) % px)];
  const fade = (t) => t * t * (3 - 2 * t);
  return (u, v) => {
    const x = u * px, y = v * py, x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = fade(x - x0), fy = fade(y - y0);
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

const skyCache = new Map();
function skyMask(cover) {
  const key = cover.toFixed(2);
  if (skyCache.has(key)) return skyCache.get(key);
  const cols = SKY_W / SKY_DOT, rows = SKY_H / SKY_DOT;
  // Drawn at full size, one 3px square per dot, so the mask stays crisp
  // instead of being stretched (and blurred) from a small canvas.
  const c = document.createElement('canvas');
  c.width = SKY_W; c.height = SKY_H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  // Lattice cells roughly square on a 10:3 tile, so clouds come out as broad
  // masses rather than columns. Only x has to wrap (the breeze is sideways).
  const oct = [periodicNoise(6, 2, 7), periodicNoise(12, 4, 19), periodicNoise(24, 8, 41), periodicNoise(48, 15, 83)];
  const amp = [0.55, 0.27, 0.12, 0.06];
  // cover 0 → only the tallest cloud tops; cover 1 → an overcast sky.
  const base = 0.6 - cover * 0.16;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let n = 0;
      for (let k = 0; k < 4; k++) n += oct[k](x / cols, y / rows) * amp[k];
      // Clouds pile up toward the horizon and thin out under the headline.
      n += (y / rows) * 0.14 - 0.04;
      const t = Math.min(1, Math.max(0, (n - base) / 0.2));
      if (t * 0.92 <= BAYER8[(y % 8) * 8 + (x % 8)]) continue;
      ctx.fillRect(x * SKY_DOT, y * SKY_DOT, SKY_DOT - 1, SKY_DOT - 1);
    }
  }
  const url = c.toDataURL('image/png');
  skyCache.set(key, url);
  return url;
}

function renderSky(page) {
  const n = overviewNumbers();
  const cover = Math.min(1, n.today / 25);
  const mask = skyMask(Math.round(cover * 10) / 10);
  const headline = n.today === 0
    ? 'A clear sky so far today.'
    : `${n.today.toLocaleString()} macro${n.today === 1 ? '' : 's'} typed for you today.`;
  const sun = Math.max(0.02, Math.min(1, n.progress));

  const sky = h(`
    <section class="sky" aria-label="Today">
      <div class="sky-drift${REDUCED_MOTION() ? ' still' : ''}" style="--sky-mask:url(${mask}); --sky-w:${SKY_W}px"></div>
      <div class="sky-copy">
        <p class="sky-hello">${esc(greeting())}</p>
        <h1 class="sky-line">${esc(headline)}</h1>
        <p class="sky-sub">${n.lifetime.toLocaleString()} since ${esc(sinceText(n.since) || 'you started')}, ${esc(savedPhrase(n.minutes))}.</p>
      </div>
      <div class="sky-horizon" title="${n.next ? `${n.toNext.toLocaleString()} more until ${n.next.toLocaleString()}` : 'Every milestone reached'}">
        <span class="sky-ground"></span>
        <span class="sky-sun" style="left:${(sun * 100).toFixed(1)}%"></span>
        <span class="sky-goal">${n.next ? `${n.toNext.toLocaleString()} more until ${n.next.toLocaleString()}` : 'Every milestone reached'}</span>
      </div>
    </section>`);
  page.append(sky);

  page.append(h(`<p class="sky-status">${esc(statusSentence())} ${n.streak > 1 ? `You’re on a ${n.streak}-day streak.` : ''}</p>`));

  page.append(h('<h2 class="ov-h2">The last eight months</h2>'));
  page.append(ditherHeatmap(35));

  page.append(mostUsedList());
}

// The activity calendar drawn in the sky's own language: dots, not squares,
// bigger where the day was busier.
function ditherHeatmap(weeks) {
  const today = new Date();
  const days = lastDays(weeks * 7 - (6 - today.getDay()));
  const max = Math.max(1, ...days.map(dayTotal));
  const pad = new Date(`${days[0]}T12:00:00`).getDay();
  const cells = Array(pad).fill('<i></i>');
  for (const k of days) {
    const v = dayTotal(k);
    const lvl = v === 0 ? 0 : Math.min(4, Math.ceil((v / max) * 4));
    const label = new Date(`${k}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    cells.push(`<i class="d${lvl}" title="${label}: ${v} expansion${v === 1 ? '' : 's'}"></i>`);
  }
  const total = days.reduce((a, k) => a + dayTotal(k), 0);
  const active = days.filter((k) => dayTotal(k) > 0).length;
  return h(`
    <figure class="dots">
      <div class="dots-grid" style="grid-template-columns: repeat(${Math.ceil(cells.length / 7)}, 1fr)">${cells.join('')}</div>
      <figcaption>${total.toLocaleString()} expansions on ${active} day${active === 1 ? '' : 's'}</figcaption>
    </figure>`);
}

function rangeSwitch() {
  const seg = h(`<div class="segmented">${[['7', '7 days'], ['30', '30 days'], ['all', 'All time']].map(([k, t]) => `<button data-r="${k}" aria-pressed="${state.range === k}">${t}</button>`).join('')}</div>`);
  seg.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { state.range = b.dataset.r; writeLocal('range', b.dataset.r); renderView(); }));
  return seg;
}

// A ranked list where the type does the work: the bigger the share, the
// heavier the title. No bars.
function mostUsedList() {
  const wrap = h('<section class="most"></section>');
  const head = h('<div class="ov-row"><h2 class="ov-h2">Most used</h2></div>');
  head.append(rangeSwitch());
  wrap.append(head);
  const ranked = rankedMacros(state.range, 8);
  if (!ranked.length) {
    wrap.append(h(`<p class="list-empty">${state.range === 'all' ? 'Use a macro and it’ll show up here.' : 'Nothing expanded in this period yet.'}</p>`));
    return wrap;
  }
  const max = ranked[0].n;
  const list = h('<ol class="most-list"></ol>');
  for (const r of ranked) {
    const share = r.n / max;
    const li = h(`
      <li>
        <button class="most-item" style="--share:${share.toFixed(3)}">
          <span class="most-title">${esc(r.m.title || 'Untitled')}</span>
          <span class="chip">${esc(state.macros.prefix + r.m.abbr)}</span>
          <span class="most-n">${r.n.toLocaleString()}</span>
        </button>
      </li>`);
    li.querySelector('button').addEventListener('click', () => go('editor', r.i));
    list.append(li);
  }
  wrap.append(list);
  return wrap;
}

// =============================================================================
// 2. LANES — your macros, moving
// =============================================================================
// The portfolio's print lanes, made of the things you actually type. Three
// tracks drift left to right at different speeds; the most used macros ride
// the top lane, large. Hovering a lane holds it still so you can click.

function renderLanes(page) {
  const n = overviewNumbers();
  const prefix = state.macros.prefix;

  page.append(h(`
    <section class="lanes-head">
      <h1 class="lanes-line">${n.lifetime.toLocaleString()} expansions so far. That’s ${esc(savedPhrase(n.minutes))}.</h1>
      <dl class="lanes-facts">
        <div><dt>Today</dt><dd>${n.today.toLocaleString()}</dd></div>
        <div><dt>Streak</dt><dd>${n.streak} day${n.streak === 1 ? '' : 's'}</dd></div>
        <div><dt>Best streak</dt><dd>${n.best} day${n.best === 1 ? '' : 's'}</dd></div>
        <div><dt>${n.next ? `Until ${n.next.toLocaleString()}` : 'Milestones'}</dt><dd>${n.next ? n.toNext.toLocaleString() : 'All done'}</dd></div>
      </dl>
      <p class="lanes-status">${esc(statusSentence())}</p>
    </section>`));

  // Split macros into three tiers by all-time use.
  const all = state.macros.snippets.map((m, i) => ({ m, i, n: state.usage[m.abbr] || 0 }))
    .filter((r) => r.m.abbr)
    .sort((a, b) => b.n - a.n);
  const third = Math.max(1, Math.ceil(all.length / 3));
  // The quiet lane also carries the built-ins, so it never stutters one macro.
  const builtIns = state.builtIns.map((b) => ({ m: { abbr: b.abbr, title: b.title }, i: -1, n: 0, builtIn: true }));
  const tiers = [all.slice(0, third), all.slice(third, third * 2), [...all.slice(third * 2), ...builtIns]];
  if (!tiers[1].length) tiers[1] = all;

  const lanes = h('<section class="lanes" aria-label="Your macros"></section>');
  const speeds = [70, 52, 40];
  tiers.forEach((tier, k) => {
    // Repeat until a lane is comfortably wider than the window, then double
    // it so translating by half loops without a seam.
    let seq = tier;
    while (seq.length < 8) seq = seq.concat(tier);
    const chip = (r) => `
      <button class="lane-chip t${k}" data-i="${r.i}" title="${r.builtIn ? `Built-in: ${esc(r.m.title)}` : `${r.n.toLocaleString()} expansion${r.n === 1 ? '' : 's'}`}">
        <span class="lc-abbr">${esc(prefix + r.m.abbr)}</span>
        ${k < 2 ? `<span class="lc-title">${esc(r.m.title || 'Untitled')}</span>` : ''}
        ${k === 0 ? `<span class="lc-n">${r.n.toLocaleString()}</span>` : ''}
      </button>`;
    const track = h(`
      <div class="lane${REDUCED_MOTION() ? ' still' : ''}" style="--dur:${speeds[k]}s; --delay:-${(k * 13) % speeds[k]}s">
        <div class="lane-track">${seq.map(chip).join('')}${seq.map(chip).join('')}</div>
      </div>`);
    track.querySelectorAll('.lane-chip').forEach((b) => b.addEventListener('click', () => {
      const i = Number(b.dataset.i);
      if (i >= 0) go('editor', i); else go('builtins');
    }));
    lanes.append(track);
  });
  page.append(lanes);

  page.append(h('<h2 class="ov-h2">The last eight months</h2>'));
  page.append(heatmapPlain(35));
}

function heatmapPlain(weeks) {
  const fig = ditherHeatmap(weeks);
  fig.classList.add('squares');
  return fig;
}

// =============================================================================
// 3. BOARD — a split-flap departures board
// =============================================================================
// An object on the page rather than a page of cards. The lifetime count flips
// digit by digit the first time you open it and then only when a digit
// actually changes, so a new expansion is a little event you can see. Your
// top macros are listed like departures, and the last 35 weeks glow as LEDs.

let lastBoard = null; // { lifetime, today, streak } as last shown

function flapDigits(value, prevValue, minWidth = 1) {
  const str = String(value).padStart(minWidth, ' ');
  const prev = prevValue == null ? null : String(prevValue).padStart(str.length, ' ');
  return str.split('').map((ch, idx) => {
    const changed = prev === null || prev[idx] !== ch;
    return `<span class="flap${changed && ch !== ' ' ? ' go' : ''}${ch === ' ' ? ' blank' : ''}" data-to="${ch}" style="--i:${idx}">${changed && prev === null ? '0' : ch}</span>`;
  }).join('');
}

function runFlaps(root) {
  if (REDUCED_MOTION()) {
    root.querySelectorAll('.flap').forEach((f) => { f.textContent = f.dataset.to; f.classList.remove('go'); });
    return;
  }
  root.querySelectorAll('.flap.go').forEach((f, k) => {
    const to = f.dataset.to;
    if (!/\d/.test(to)) { f.textContent = to; return; }
    let steps = 4 + Number(f.style.getPropertyValue('--i')) * 2 + (k % 3);
    let cur = Number(/\d/.test(f.textContent) ? f.textContent : 0);
    const tick = () => {
      f.classList.remove('flip');
      void f.offsetWidth; // restart the flip animation
      f.classList.add('flip');
      if (steps <= 0) { f.textContent = to; return; }
      cur = (cur + 1) % 10;
      f.textContent = steps === 1 ? to : String(cur);
      steps -= 1;
      setTimeout(tick, 70);
    };
    setTimeout(tick, 120 + k * 40);
  });
}

function renderBoard(page) {
  const n = overviewNumbers();
  const prefix = state.macros.prefix;
  const prev = lastBoard;
  lastBoard = { lifetime: n.lifetime, today: n.today, streak: n.streak };

  const rows = rankedMacros('all', 6);
  const todayCounts = state.stats.days[dayKey(new Date())]?.macros || {};
  const width = Math.max(4, String(n.lifetime).length);

  const board = h(`
    <section class="board" aria-label="Your numbers">
      <div class="board-top">
        <div class="board-cell big">
          <span class="board-label">Expanded, all time</span>
          <span class="flaps" aria-label="${n.lifetime}">${flapDigits(n.lifetime, prev?.lifetime, width)}</span>
        </div>
        <div class="board-cell">
          <span class="board-label">Today</span>
          <span class="flaps small" aria-label="${n.today}">${flapDigits(n.today, prev?.today, 3)}</span>
        </div>
        <div class="board-cell">
          <span class="board-label">Day streak</span>
          <span class="flaps small" aria-label="${n.streak}">${flapDigits(n.streak, prev?.streak, 2)}</span>
        </div>
      </div>
      <table class="board-rows">
        <thead><tr><th>Macro</th><th>Name</th><th class="num">Today</th><th class="num">All time</th></tr></thead>
        <tbody>
          ${rows.map((r) => `
            <tr data-i="${r.i}" tabindex="0">
              <td class="code">${esc(prefix + r.m.abbr)}</td>
              <td class="name">${esc(r.m.title || 'Untitled')}</td>
              <td class="num${todayCounts[r.m.abbr] ? ' lit' : ''}">${todayCounts[r.m.abbr] || '–'}</td>
              <td class="num">${r.n.toLocaleString()}</td>
            </tr>`).join('') || '<tr><td colspan="4" class="name">Use a macro and it’ll appear here.</td></tr>'}
        </tbody>
      </table>
      ${ledStrip(35)}
      <div class="board-foot">
        <span>${esc(n.next ? `${n.toNext.toLocaleString()} more until ${n.next.toLocaleString()}` : 'Every milestone reached')}</span>
        <span>${esc(savedPhrase(n.minutes).replace(/^./, (c) => c.toUpperCase()))}</span>
      </div>
    </section>`);
  board.querySelectorAll('tr[data-i]').forEach((tr) => {
    const open = () => go('editor', Number(tr.dataset.i));
    tr.addEventListener('click', open);
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
  });
  page.append(h(`<p class="board-status">${esc(statusSentence())}</p>`));
  page.append(board);
  requestAnimationFrame(() => runFlaps(board));
}

function ledStrip(weeks) {
  const today = new Date();
  const days = lastDays(weeks * 7 - (6 - today.getDay()));
  const max = Math.max(1, ...days.map(dayTotal));
  const pad = new Date(`${days[0]}T12:00:00`).getDay();
  const cells = Array(pad).fill('<i class="off"></i>');
  for (const k of days) {
    const v = dayTotal(k);
    const lvl = v === 0 ? 0 : Math.min(4, Math.ceil((v / max) * 4));
    cells.push(`<i class="l${lvl}" title="${k}: ${v}"></i>`);
  }
  return `<div class="leds" aria-label="Activity, last eight months" style="grid-template-columns: repeat(${Math.ceil(cells.length / 7)}, 1fr)">${cells.join('')}</div>`;
}
