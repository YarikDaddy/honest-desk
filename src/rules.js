// Правила деска. Все цифры здесь — публичные: любой может прочитать, почему бот вошёл или нет.
// Никакого ИИ в решениях: фиксированные гейты. ИИ (Claude) написал код, а не жмёт кнопки.

export const RULES = {
  bankStart: 1000, // бумажный банк, $
  size: 100, // одна позиция, $
  maxOpen: 5,
  feePct: 2, // комиссия + проскальзывание на каждую сторону, % — честно, мемкоины дорогие
  minAgeMin: 15, // моложе — слишком много мгновенных рагов
  maxAgeH: 6,
  minCap: 20_000,
  maxCap: 2_000_000,
  minVolH1: 20_000, // $ за последний час
  minBuySellH1: 1.2, // покупок в час хотя бы на 20% больше, чем продаж
  minChgH1: 10, // уже растёт…
  maxChgH1: 300, // …но не вертикальная свеча, которую уже поздно ловить
  tp: 40, // тейк-профит, %
  sl: -20, // стоп-лосс, %
  maxHoldH: 6, // дольше не держим
  vanishAfterMin: 60, // пара пропала из данных на час — считаем, что монета умерла (−100%)
};

const MIN = 60_000;

export const capOf = (p) => p.marketCap ?? p.fdv ?? null;
export const priceOf = (p) => (p && p.priceUsd ? Number(p.priceUsd) : null);

// Каждый гейт отдельно — чтобы в отчёте было видно, что именно убило монету.
export function checkEntry(pair, now, R = RULES) {
  const fails = [];
  const ageMin = (now - (pair.pairCreatedAt || 0)) / MIN;
  const cap = capOf(pair);
  const h1 = pair.txns?.h1 || {};
  const m5 = pair.txns?.m5 || {};
  const chg = pair.priceChange?.h1;
  if (!priceOf(pair)) fails.push("noPrice");
  if (ageMin < R.minAgeMin) fails.push("tooYoung");
  if (ageMin > R.maxAgeH * 60) fails.push("tooOld");
  if (cap === null || cap < R.minCap) fails.push("capTooSmall");
  if (cap !== null && cap > R.maxCap) fails.push("capTooBig");
  if ((pair.volume?.h1 || 0) < R.minVolH1) fails.push("lowVolume");
  if (!h1.sells || h1.buys / h1.sells < R.minBuySellH1) fails.push("sellers");
  if ((m5.buys || 0) < (m5.sells || 0)) fails.push("sellingNow");
  if (chg === undefined || chg < R.minChgH1) fails.push("notRising");
  if (chg !== undefined && chg > R.maxChgH1) fails.push("tooLate");
  return { ok: fails.length === 0, fails };
}

export function checkExit(pos, pair, now, R = RULES) {
  const price = priceOf(pair);
  if (price === null) {
    const goneMin = (now - (pos.lastSeenAt || pos.openedAt)) / MIN;
    return goneMin >= R.vanishAfterMin ? { reason: "vanished", price: 0 } : null;
  }
  const chg = (price / pos.entryPrice - 1) * 100;
  if (chg >= R.tp) return { reason: "takeProfit", price };
  if (chg <= R.sl) return { reason: "stopLoss", price };
  if (now - pos.openedAt >= R.maxHoldH * 60 * MIN) return { reason: "timeStop", price };
  return null;
}

export function emptyState(R = RULES) {
  return { startedAt: null, cash: R.bankStart, open: [], traded: {}, days: {} };
}

export function openPosition(state, pair, now, R = RULES) {
  const price = priceOf(pair);
  const qty = (R.size * (1 - R.feePct / 100)) / price;
  const pos = {
    id: pair.pairAddress, symbol: pair.baseToken?.symbol || "?", token: pair.baseToken?.address, url: pair.url,
    entryPrice: price, qty, size: R.size, openedAt: now, lastPrice: price, lastSeenAt: now, entryCap: capOf(pair),
  };
  state.cash -= R.size;
  state.open.push(pos);
  state.traded[pos.id] = now;
  return pos;
}

export function closePosition(state, pos, { price, reason }, now, R = RULES) {
  const proceeds = pos.qty * price * (1 - R.feePct / 100);
  state.cash += proceeds;
  state.open = state.open.filter((p) => p.id !== pos.id);
  return {
    symbol: pos.symbol, token: pos.token, url: pos.url, reason,
    openedAt: pos.openedAt, closedAt: now, entryPrice: pos.entryPrice, exitPrice: price,
    size: pos.size, proceeds: round2(proceeds), pnl: round2(proceeds - pos.size), pnlPct: round2((proceeds / pos.size - 1) * 100),
  };
}

export function equity(state, R = RULES) {
  return round2(state.cash + state.open.reduce((s, p) => s + p.qty * p.lastPrice * (1 - R.feePct / 100), 0));
}

export const round2 = (n) => Math.round(n * 100) / 100;

export function dayKey(ts) {
  return new Date(ts).toISOString().slice(0, 10); // UTC — одинаково для GitHub Actions и для читателей
}
