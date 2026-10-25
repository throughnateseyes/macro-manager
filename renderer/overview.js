// ---------------------------------------------------------------------------
// Overview — "Sky"
//
// The portfolio's dithered clouds drifting left to right behind today's count.
// The sky fills in as the day's expansions add up, the sun crossing the
// horizon is progress to the next milestone, and the activity calendar below
// is drawn in the same dots. Kept to a handful of words on purpose: people
// glance at this many times a day.
//
// Loaded before app.js and called from it, so everything here reads app.js's
// globals (state, h, esc, dayTotal…) at call time.
// ---------------------------------------------------------------------------
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

// Only said when something needs the user's attention.
function statusSentence() {
  if (!state.accessibility) return 'Macros can’t expand until Macro Manager has Accessibility access.';
  if (state.settings.paused) return 'Expansion is paused.';
  return '';
}


// ---- Entry point (called by app.js) ---------------------------------------------
function renderOverview() {
  const quick = h(`<button class="btn">${ICON.search}Quick Insert</button>`);
  quick.addEventListener('click', () => api.showPalette());
  const add = h(`<button class="btn primary">${ICON.plus}New Macro</button>`);
  add.addEventListener('click', newMacro);
  setToolbar('', [quick, add]);

  const page = h('<div class="page ov"></div>');
  if (!state.macros.snippets.length) page.append(emptyOverview());
  else renderSky(page);
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
  const headline = n.today === 0 ? 'Clear skies so far' : `${n.today.toLocaleString()} macro${n.today === 1 ? '' : 's'} today`;
  const sun = Math.max(0.02, Math.min(1, n.progress));
  const facts = [
    [n.lifetime.toLocaleString(), 'all time'],
    [formatMinutes(n.minutes), 'saved'],
    ...(n.streak > 1 ? [[`${n.streak}-day`, 'streak']] : []),
  ].filter(([v]) => v !== '—');

  page.append(h(`
    <section class="sky" aria-label="Today">
      <div class="sky-drift${REDUCED_MOTION() ? ' still' : ''}" style="--sky-mask:url(${mask}); --sky-w:${SKY_W}px"></div>
      <div class="sky-copy">
        <p class="sky-hello">${esc(greeting())}</p>
        <h1 class="sky-line">${esc(headline)}</h1>
        <ul class="sky-facts">${facts.map(([v, l]) => `<li><b>${esc(v)}</b> ${esc(l)}</li>`).join('')}</ul>
      </div>
      <div class="sky-horizon" title="${n.next ? `${n.toNext.toLocaleString()} more until ${n.next.toLocaleString()} expansions` : 'Every milestone reached'}">
        <span class="sky-ground"></span>
        <span class="sky-sun" style="left:${(sun * 100).toFixed(1)}%"></span>
        <span class="sky-goal">${n.next ? `${n.toNext.toLocaleString()} to ${n.next.toLocaleString()}` : 'All milestones'}</span>
      </div>
    </section>`));

  const status = statusSentence();
  if (status) page.append(h(`<p class="sky-status">${esc(status)}</p>`));

  page.append(h('<h2 class="ov-h2">Activity</h2>'));
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
  return h(`
    <figure class="dots">
      <div class="dots-grid" style="grid-template-columns: repeat(${Math.ceil(cells.length / 7)}, 1fr)">${cells.join('')}</div>
      <figcaption>${total.toLocaleString()} in the last eight months</figcaption>
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
