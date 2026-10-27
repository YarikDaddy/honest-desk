// Один тик деска (GitHub Actions запускает раз в 15 минут):
// 1) проверить выходы по открытым позициям, 2) просканировать свежие токены и войти по правилам,
// 3) всё записать в data/ — git-история и логи Actions становятся публичным журналом.

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { RULES, checkEntry, checkExit, closePosition, dayKey, emptyState, equity, openPosition, priceOf } from "./rules.js";
import { candidateTokens, pairsFor } from "./dex.js";

const DATA = new URL("../data/", import.meta.url);
const STATE = new URL("state.json", DATA);
const TRADES = new URL("trades.jsonl", DATA);

export function runTick(state, candidates, pairs, now, R = RULES) {
  state.startedAt ??= now;
  const day = (state.days[dayKey(now)] ||= { seen: [], passed: 0, opened: 0, killedBy: {} });
  const closed = [];

  for (const pos of [...state.open]) {
    const pair = pairs.get(pos.token);
    const price = priceOf(pair);
    if (price !== null) Object.assign(pos, { lastPrice: price, lastSeenAt: now });
    const exit = checkExit(pos, pair, now, R);
    if (exit) closed.push(closePosition(state, pos, exit, now, R));
  }

  const opened = [];
  for (const token of candidates) {
    const pair = pairs.get(token);
    if (!pair || state.traded[pair.pairAddress]) continue;
    const firstLook = !day.seen.includes(token);
    if (firstLook) day.seen.push(token);
    const { ok, fails } = checkEntry(pair, now, R);
    if (!ok) {
      if (firstLook) day.killedBy[fails[0]] = (day.killedBy[fails[0]] || 0) + 1;
      continue;
    }
    if (firstLook) day.passed++;
    if (state.open.length >= R.maxOpen || state.cash < R.size) continue;
    opened.push(openPosition(state, pair, now, R));
    day.opened++;
  }

  // чистка: «уже торговали» помним неделю, дни — две недели
  for (const [id, t] of Object.entries(state.traded)) if (now - t > 7 * 864e5) delete state.traded[id];
  const keys = Object.keys(state.days).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - 14))) delete state.days[k];

  return { opened, closed, equity: equity(state, R) };
}

async function main() {
  if (!existsSync(DATA)) mkdirSync(DATA, { recursive: true });
  const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : emptyState();
  const now = Date.now();
  const candidates = await candidateTokens();
  const pairs = await pairsFor([...new Set([...candidates, ...state.open.map((p) => p.token)])]);
  const { opened, closed, equity: eq } = runTick(state, candidates, pairs, now);

  for (const t of closed) appendFileSync(TRADES, JSON.stringify(t) + "\n");
  writeFileSync(STATE, JSON.stringify(state, null, 1));

  const fmt = (n) => `$${n.toFixed(2)}`;
  console.log(`${new Date(now).toISOString()} · candidates ${candidates.length} · open ${state.open.length} · equity ${fmt(eq)}`);
  for (const p of opened) console.log(`  BUY  ${p.symbol} @ ${p.entryPrice} (cap ${Math.round(p.entryCap)}) ${p.url}`);
  for (const t of closed) console.log(`  SELL ${t.symbol} ${t.reason} ${t.pnl >= 0 ? "+" : ""}${t.pnlPct}% (${fmt(t.pnl)})`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
