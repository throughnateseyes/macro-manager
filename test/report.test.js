const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createStore } = require('../lib/store');
const { LIMITS, nextBatch, applyAck, rebase, createReporter } = require('../lib/report');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mm-report-'));
const fresh = () => ({ id: 'x', token: 't', seq: 0, acked: null, inflight: null });
const stats = (lifetime, charsSaved) => ({ lifetime, charsSaved, days: {} });

test('the first report carries the whole lifetime as a backfill', () => {
  const { state, batch } = nextBatch(fresh(), stats(120, 9000));
  assert.deepStrictEqual([batch.seq, batch.expansions, batch.chars, batch.backfill], [1, 120, 9000, true]);
  assert.strictEqual(state.inflight, batch);
  const acked = applyAck(state, batch);
  assert.deepStrictEqual(acked.acked, { expansions: 120, chars: 9000 });
  assert.strictEqual(acked.seq, 1);
  assert.strictEqual(acked.inflight, null);
});

test('the first report goes even at zero, so the install is counted', () => {
  const { batch } = nextBatch(fresh(), stats(0, 0));
  assert.deepStrictEqual([batch.expansions, batch.chars, batch.backfill], [0, 0, true]);
});

test('later reports send only the difference, and nothing when idle', () => {
  const s = { ...fresh(), seq: 3, acked: { expansions: 100, chars: 5000 } };
  const { batch } = nextBatch(s, stats(130, 6500));
  assert.deepStrictEqual([batch.seq, batch.expansions, batch.chars, batch.backfill], [4, 30, 1500, false]);
  assert.strictEqual(nextBatch(s, stats(100, 5000)).batch, null);
});

test('an unanswered batch is resent unchanged, with the same seq', () => {
  const first = nextBatch(fresh(), stats(10, 100));
  const again = nextBatch(first.state, stats(50, 900)); // more happened meanwhile
  assert.strictEqual(again.batch, first.batch);
  const after = nextBatch(applyAck(again.state, again.batch), stats(50, 900));
  assert.deepStrictEqual([after.batch.seq, after.batch.expansions, after.batch.chars], [2, 40, 800]);
});

test('a backlog past the cap is split, and the pieces add up', () => {
  let s = { ...fresh(), acked: { expansions: 0, chars: 0 } };
  const st = stats(4500, 450000);
  let sent = 0, chars = 0, pieces = 0;
  for (;;) {
    const { state, batch } = nextBatch(s, st);
    if (!batch) break;
    assert.ok(batch.expansions <= LIMITS.expansions);
    assert.ok(batch.chars <= batch.expansions * LIMITS.charsPerExpansion);
    sent += batch.expansions; chars += batch.chars; pieces += 1;
    s = applyAck(state, batch);
  }
  assert.deepStrictEqual([sent, chars, pieces], [4500, 450000, 3]);
});

test('a backfill past its cap is cut, not split', () => {
  const { state, batch } = nextBatch(fresh(), stats(LIMITS.backfill + 1000, 0));
  assert.strictEqual(batch.expansions, LIMITS.backfill);
  assert.strictEqual(nextBatch(applyAck(state, batch), stats(LIMITS.backfill + 1000, 0)).batch, null);
});

test('stats that shrank start counting from where they are now', () => {
  const s = { ...fresh(), seq: 5, acked: { expansions: 900, chars: 90000 } };
  assert.strictEqual(nextBatch(s, stats(0, 0)).batch, null);
  const { batch } = nextBatch(nextBatch(s, stats(0, 0)).state, stats(4, 40));
  assert.deepStrictEqual([batch.expansions, batch.chars], [4, 40]);
});

test('turning sharing back on skips what happened while it was off', () => {
  const pending = nextBatch({ ...fresh(), seq: 2, acked: { expansions: 10, chars: 10 } }, stats(20, 20)).state;
  const s = rebase(pending, stats(80, 800));
  assert.deepStrictEqual(s.acked, { expansions: 80, chars: 800 });
  assert.strictEqual(s.inflight, null);
  assert.strictEqual(s.seq, 3); // past the abandoned batch, so the next seq is new to the server
  assert.strictEqual(nextBatch(s, stats(80, 800)).batch, null);
});

test('an unreadable report.json does not send the lifetime twice', () => {
  const dir = tmp();
  const store = createStore(dir);
  store.recordExpansion({ abbr: null, chars: 7 });
  assert.strictEqual(store.loadReport().acked, null); // a real first run backfills
  fs.writeFileSync(store.paths.report, '{ nope');
  assert.deepStrictEqual(store.loadReport().acked, { expansions: 1, chars: 7 });
});

function fakeServer() {
  const calls = [];
  const replies = [];
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ path: new URL(url).pathname, body });
    const [status, json] = replies.shift() || [200, url.endsWith('/register') ? { token: 'tok' } : { ok: true }];
    return { status, json: async () => json };
  };
  return { calls, replies, fetch };
}

test('the reporter registers, then sends numbers and nothing else', async () => {
  const store = createStore(tmp());
  store.recordExpansion({ abbr: 'sig', chars: 40 });
  const srv = fakeServer();
  const r = createReporter({ store, version: '2.2.0', origin: 'https://x.test', fetch: srv.fetch, isEnabled: () => true });
  await r.sendOnce();
  assert.deepStrictEqual(srv.calls.map((c) => c.path), ['/api/macro-manager/register', '/api/macro-manager/stats']);
  const sent = srv.calls[1].body;
  assert.deepStrictEqual(Object.keys(sent).sort(), ['backfill', 'chars', 'expansions', 'id', 'seq', 'token', 'v']);
  assert.deepStrictEqual([sent.expansions, sent.chars, sent.seq, sent.token], [1, 40, 1, 'tok']);
  assert.ok(!JSON.stringify(srv.calls).includes('sig'));
});

test('the reporter keeps a batch through an outage and stops when disabled', async () => {
  const store = createStore(tmp());
  store.recordExpansion({ chars: 5 });
  const srv = fakeServer();
  let enabled = true;
  const r = createReporter({ store, version: '2.2.0', origin: 'https://x.test', fetch: srv.fetch, isEnabled: () => enabled, log: { warn() {} } });
  srv.replies.push([200, { token: 'tok' }], [503, { error: 'unavailable' }]);
  await r.sendOnce();
  assert.strictEqual(store.loadReport().inflight.seq, 1);
  await r.sendOnce();
  assert.strictEqual(srv.calls[2].body.seq, 1); // the same batch again
  assert.strictEqual(store.loadReport().inflight, null);
  enabled = false;
  store.recordExpansion({ chars: 5 });
  await r.sendOnce();
  assert.strictEqual(srv.calls.length, 3);
});

test('a revoked token re-registers; a blocked install goes quiet', async () => {
  const store = createStore(tmp());
  store.recordExpansion({ chars: 5 });
  const srv = fakeServer();
  const r = createReporter({ store, version: '2.2.0', origin: 'https://x.test', fetch: srv.fetch, isEnabled: () => true });
  srv.replies.push([200, { token: 'tok' }], [401, { error: 'bad token' }]);
  await r.sendOnce();
  assert.strictEqual(store.loadReport().token, null);
  srv.replies.push([200, { token: 'tok2' }], [403, { error: 'blocked' }]);
  await r.sendOnce();
  assert.strictEqual(store.loadReport().blocked, true);
  const before = srv.calls.length;
  await r.sendOnce();
  assert.strictEqual(srv.calls.length, before);
});
