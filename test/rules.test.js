import { test } from "node:test";
import assert from "node:assert/strict";
import { RULES, checkEntry, checkExit, emptyState, openPosition, closePosition, equity } from "../src/rules.js";
import { runTick } from "../src/tick.js";
import { buildReport } from "../src/report.js";

const MIN = 60000;
const now = Date.parse("2026-10-27T12:00:00Z");
const pair = (o = {}) => ({
  pairAddress: "P1", url: "https://dexscreener.com/solana/p1", baseToken: { address: "T1", symbol: "GOOD" },
  priceUsd: "0.001", marketCap: 150000, pairCreatedAt: now - 60 * MIN,
  volume: { h1: 50000 }, txns: { h1: { buys: 600, sells: 400 }, m5: { buys: 40, sells: 30 } }, priceChange: { h1: 45 }, ...o,
});

test("вход: хорошая пара проходит, каждый гейт ловит своё", () => {
  assert.deepEqual(checkEntry(pair(), now), { ok: true, fails: [] });
  assert.deepEqual(checkEntry(pair({ pairCreatedAt: now - 5 * MIN }), now).fails, ["tooYoung"]);
  assert.deepEqual(checkEntry(pair({ marketCap: 5000 }), now).fails, ["capTooSmall"]);
  assert.deepEqual(checkEntry(pair({ txns: { h1: { buys: 400, sells: 400 }, m5: { buys: 40, sells: 30 } } }), now).fails, ["sellers"]);
  assert.deepEqual(checkEntry(pair({ priceChange: { h1: 800 } }), now).fails, ["tooLate"]);
  assert.deepEqual(checkEntry(pair({ priceUsd: null }), now).fails, ["noPrice"]);
});

test("выход: тейк, стоп, время, пропажа", () => {
  const pos = { entryPrice: 1, openedAt: now - 10 * MIN, lastSeenAt: now - 10 * MIN };
  assert.equal(checkExit(pos, { priceUsd: "1.5" }, now).reason, "takeProfit");
  assert.equal(checkExit(pos, { priceUsd: "0.7" }, now).reason, "stopLoss");
  assert.equal(checkExit(pos, { priceUsd: "1.1" }, now), null);
  assert.equal(checkExit({ ...pos, openedAt: now - 7 * 60 * MIN }, { priceUsd: "1.1" }, now).reason, "timeStop");
  assert.equal(checkExit(pos, undefined, now), null, "пропала недавно — ждём");
  assert.deepEqual(checkExit({ ...pos, lastSeenAt: now - 61 * MIN }, undefined, now), { reason: "vanished", price: 0 });
});

test("деньги: комиссии с обеих сторон, плоская цена = минус ~4%", () => {
  const st = emptyState();
  const pos = openPosition(st, pair(), now);
  assert.equal(st.cash, RULES.bankStart - RULES.size);
  const t = closePosition(st, pos, { price: 0.001, reason: "timeStop" }, now);
  assert.equal(t.pnlPct, -3.96);
  assert.equal(equity(st), 996.04);
});

test("тик: вход, повторно ту же пару не берём, выход по тейку; отчёт считает честно", () => {
  const st = emptyState();
  const pairs = new Map([["T1", pair()], ["T2", pair({ pairAddress: "P2", baseToken: { address: "T2", symbol: "BAD" }, marketCap: 1000 })]]);
  let r = runTick(st, ["T1", "T2"], pairs, now);
  assert.equal(r.opened.length, 1);
  assert.equal(st.days["2026-10-27"].killedBy.capTooSmall, 1);
  r = runTick(st, ["T1", "T2"], pairs, now + 15 * MIN);
  assert.equal(r.opened.length, 0, "не входим дважды");
  assert.equal(st.days["2026-10-27"].killedBy.capTooSmall, 1, "один токен — одна запись за день");
  pairs.set("T1", pair({ priceUsd: "0.0015" }));
  r = runTick(st, [], pairs, now + 30 * MIN);
  assert.equal(r.closed[0].reason, "takeProfit");
  assert.ok(r.closed[0].pnl > 0);

  const { card, md } = buildReport(st, r.closed, now + 30 * MIN);
  assert.equal(card.trades, 1);
  assert.equal(card.winRate, 100);
  assert.match(md, /Honest Desk — Day 1/);
  assert.match(md, /Not financial advice/);
});
