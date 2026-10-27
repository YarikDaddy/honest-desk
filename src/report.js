// Дневной отчёт: REPORT.md (для людей на GitHub) и data/card.json (для картинки в X).
// Честно: считаем всё, включая убыточные сделки и комиссии.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { RULES, dayKey, equity, round2 } from "./rules.js";

const DATA = new URL("../data/", import.meta.url);

export function buildReport(state, trades, now, R = RULES) {
  const eq = equity(state, R);
  const day = dayKey(now);
  const today = trades.filter((t) => dayKey(t.closedAt) === day);
  const wins = trades.filter((t) => t.pnl > 0);
  const dayNum = state.startedAt ? Math.floor((now - state.startedAt) / 864e5) + 1 : 1;
  const stats = state.days[day] || { seen: [], passed: 0, opened: 0, killedBy: {} };
  const killed = Object.entries(stats.killedBy).sort((a, b) => b[1] - a[1]);
  const best = [...trades].sort((a, b) => b.pnlPct - a.pnlPct)[0] || null;
  const worst = [...trades].sort((a, b) => a.pnlPct - b.pnlPct)[0] || null;
  const reasons = {};
  for (const t of trades) reasons[t.reason] = (reasons[t.reason] || 0) + 1;

  const card = {
    day: dayNum, date: day, equity: eq, start: R.bankStart, pnl: round2(eq - R.bankStart), pnlPct: round2((eq / R.bankStart - 1) * 100),
    trades: trades.length, wins: wins.length, losses: trades.length - wins.length,
    winRate: trades.length ? Math.round((wins.length / trades.length) * 100) : 0,
    todayTrades: today.length, todayPnl: round2(today.reduce((s, t) => s + t.pnl, 0)),
    scannedToday: stats.seen.length, passedToday: stats.passed, open: state.open.length,
    topKill: killed[0] ? { gate: killed[0][0], n: killed[0][1] } : null,
    best: best && { symbol: best.symbol, pnlPct: best.pnlPct }, worst: worst && { symbol: worst.symbol, pnlPct: worst.pnlPct },
    exits: reasons,
  };

  const sign = (n) => (n >= 0 ? "+" : "") + n;
  const md = [
    `# Honest Desk — Day ${dayNum} (${day})`,
    "",
    `Paper bank: **$${eq.toFixed(2)}** (${sign(card.pnlPct)}% from $${R.bankStart}). Fees ${R.feePct}% per side included.`,
    "",
    `| | |`,
    `|---|---|`,
    `| Closed trades | ${trades.length} (${card.wins} W / ${card.losses} L, ${card.winRate}% win rate) |`,
    `| Today | ${today.length} closed, ${sign(card.todayPnl)} $ |`,
    `| Open positions | ${state.open.length} |`,
    `| Tokens scanned today | ${stats.seen.length}, passed all gates: ${stats.passed} |`,
    best ? `| Best | ${best.symbol} ${sign(best.pnlPct)}% |` : "",
    worst ? `| Worst | ${worst.symbol} ${sign(worst.pnlPct)}% |` : "",
    "",
    killed.length ? `**What killed tokens today:** ${killed.map(([g, n]) => `${g} ${n}`).join(", ")}` : "",
    "",
    "## Open",
    ...(state.open.length ? state.open.map((p) => `- ${p.symbol}: entry ${p.entryPrice}, now ${p.lastPrice} (${sign(round2((p.lastPrice / p.entryPrice - 1) * 100))}%) — ${p.url}`) : ["- none"]),
    "",
    "## Last 10 closed",
    ...(trades.length ? trades.slice(-10).reverse().map((t) => `- ${t.symbol}: ${t.reason}, ${sign(t.pnlPct)}% (${sign(t.pnl)} $)`) : ["- none yet"]),
    "",
    "_Paper trading. No real money. Not financial advice. Rules: [src/rules.js](src/rules.js)._",
  ].filter((l, i, a) => l !== "" || a[i - 1] !== "");
  return { card, md: md.join("\n") + "\n" };
}

function main() {
  const state = JSON.parse(readFileSync(new URL("state.json", DATA), "utf8"));
  const tf = new URL("trades.jsonl", DATA);
  const trades = existsSync(tf) ? readFileSync(tf, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
  const { card, md } = buildReport(state, trades, Date.now());
  writeFileSync(new URL("card.json", DATA), JSON.stringify(card, null, 2));
  writeFileSync(new URL("../REPORT.md", import.meta.url), md);
  console.log(md);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
