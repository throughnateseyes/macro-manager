// ---------------------------------------------------------------------------
// Adding to the total: everyone's expansions and characters saved, summed on
// throughnateseyes.com and shown on the Macro Manager case study.
//
// What leaves the computer, about once an hour, and nothing else:
//   { id, token, seq, expansions, chars, v, backfill? }
// id is a random UUID made here (not tied to the machine or the person),
// expansions and chars are how much stats.json grew since the last accepted
// report, v is the app version. Never a macro, an abbreviation, or anything
// typed. Settings → Your data turns it off.
//
// report.json  { id, token, seq, acked: { expansions, chars } | null, inflight, blocked? }
// There is no queue. `acked` is how much of stats.json the server already has,
// so being offline only makes the next difference bigger. A batch is saved as
// `inflight` before it's sent and resent unchanged until the server answers,
// so a reply lost on the way back can't count twice (the server drops a seq
// it has already seen).
//
// The server's limits (lib/macroStats.ts in the portfolio) are mirrored in
// LIMITS: a big backlog goes out as several reports a few minutes apart rather
// than as one the server would refuse. Change both together.
// ---------------------------------------------------------------------------

const LIMITS = {
  expansions: 2000,        // per report
  backfill: 250000,        // the first report, which carries everything before 2.2
  charsPerExpansion: 5000,
};

const FIRST_DELAY = 60 * 1000;
const HOUR = 60 * 60 * 1000;
const BACKLOG_DELAY = 3 * 60 * 1000;
const TIMEOUT = 10 * 1000;

// ---- Pure part ---------------------------------------------------------------

function lifetimeOf(stats) {
  return { expansions: Math.max(0, stats.lifetime || 0), chars: Math.max(0, stats.charsSaved || 0) };
}

// What to send next, and the state to save before sending it. batch is null
// when there's nothing to send.
function nextBatch(state, stats) {
  if (state.inflight) return { state, batch: state.inflight };

  const life = lifetimeOf(stats);
  const backfill = state.acked == null;
  // stats.json got smaller (deleted, or copied from another computer): start
  // counting from where it is now rather than sending a negative.
  const base = backfill ? { expansions: 0, chars: 0 } : {
    expansions: Math.min(state.acked.expansions, life.expansions),
    chars: Math.min(state.acked.chars, life.chars),
  };
  const dE = life.expansions - base.expansions;
  const dC = life.chars - base.chars;

  // The first report always goes, even at zero, so the install is counted.
  if (!backfill && dE === 0) {
    // Characters with no expansions can't happen through recordExpansion;
    // drop them rather than wait forever for an expansion to carry them.
    return { state: { ...state, acked: { expansions: base.expansions, chars: life.chars } }, batch: null };
  }

  const cap = backfill ? LIMITS.backfill : LIMITS.expansions;
  const expansions = Math.min(dE, cap);
  // A backfill past the cap is cut, not split: the rest is history the server
  // won't take as a backfill, and wouldn't take as ordinary reports either.
  const final = expansions === dE || backfill;
  const share = expansions === dE ? dC : Math.floor((dC * expansions) / dE);
  const chars = Math.min(share, expansions * LIMITS.charsPerExpansion);

  const batch = {
    seq: state.seq + 1,
    expansions,
    chars,
    backfill,
    final,
    // What `acked` becomes once the server takes it. The final piece jumps to
    // the full lifetime, which drops anything over the per-expansion ceiling.
    ackTo: final ? life : { expansions: base.expansions + expansions, chars: base.chars + chars },
  };
  return { state: { ...state, acked: backfill ? null : base, inflight: batch }, batch };
}

function applyAck(state, batch) {
  return { ...state, seq: batch.seq, acked: batch.ackTo, inflight: null };
}

// Sharing was switched back on: what happened while it was off stays here.
function rebase(state, stats) {
  return {
    ...state,
    seq: Math.max(state.seq, state.inflight ? state.inflight.seq : 0),
    acked: lifetimeOf(stats),
    inflight: null,
  };
}

// ---- Runner --------------------------------------------------------------------

function createReporter({ store, version, origin, fetch, isEnabled, log = console }) {
  let timer = null;
  let running = false;

  async function post(pathname, body) {
    const res = await fetch(`${origin}${pathname}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    let json = null;
    try { json = await res.json(); } catch { /* not JSON */ }
    return { status: res.status, json };
  }

  // One step. Returns true when there's more backlog to send soon.
  async function sendOnce() {
    if (!isEnabled()) return false;
    let state = store.loadReport();
    if (state.blocked) return false;

    if (!state.token) {
      const r = await post('/api/macro-manager/register', { id: state.id });
      if (r.status !== 200 || typeof r.json?.token !== 'string') return false;
      state = { ...state, token: r.json.token };
      store.saveReport(state);
    }

    const next = nextBatch(state, store.loadStats());
    state = next.state;
    store.saveReport(state);
    const { batch } = next;
    if (!batch) return false;

    const r = await post('/api/macro-manager/stats', {
      id: state.id,
      token: state.token,
      seq: batch.seq,
      expansions: batch.expansions,
      chars: batch.chars,
      v: version,
      ...(batch.backfill ? { backfill: true } : {}),
    });

    if (r.status === 200 || r.status === 409 || r.status === 400) {
      // 200 counted (or already counted). 409 and 400 will never be accepted
      // as sent, so they're let go instead of being retried forever.
      if (r.status !== 200) log.warn('[report] dropped a batch:', r.status, r.json?.error);
      store.saveReport(applyAck(state, batch));
      return !batch.final;
    }
    if (r.status === 401) store.saveReport({ ...state, token: null });
    if (r.status === 403) store.saveReport({ ...state, blocked: true, inflight: null });
    return false; // 429, 503, offline: same batch next time
  }

  function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(tick, ms + Math.floor(Math.random() * Math.min(ms, 5 * 60 * 1000)));
    timer.unref?.();
  }

  async function tick() {
    if (running) return;
    running = true;
    let more = false;
    try {
      more = await sendOnce();
    } catch (err) {
      log.warn('[report] not sent:', err.message); // offline, most likely
    } finally {
      running = false;
      schedule(more ? BACKLOG_DELAY : HOUR);
    }
  }

  return {
    start: () => schedule(FIRST_DELAY),
    // Sharing just turned on, or the notice was just answered.
    soon: () => schedule(FIRST_DELAY),
    stop: () => clearTimeout(timer),
    rebase: () => store.saveReport(rebase(store.loadReport(), store.loadStats())),
    sendOnce, // for tests
  };
}

module.exports = { LIMITS, nextBatch, applyAck, rebase, createReporter };
