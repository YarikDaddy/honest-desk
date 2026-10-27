# Honest Desk

**Everyone posts green screenshots. This is my real log.**

A paper-trading memecoin desk on Solana that runs by itself every 15 minutes on GitHub Actions and commits every decision to this repo. Wins, losses, rugs — all of it. Today's numbers: **[REPORT.md](REPORT.md)**.

- **Paper money only.** $1,000 starting bank, $100 per position. No wallet, no real trades.
- **No AI picks.** Fixed, public rules in [`src/rules.js`](src/rules.js). Claude wrote the code; the code makes the calls.
- **Honest math.** 2% fee + slippage on every buy *and* sell. A coin that just disappears counts as −100%.
- **Can't be edited after the fact.** Every tick is a commit with a timestamp, every run has a public log in the Actions tab.

## The rules

Scans the freshest Solana tokens on DexScreener. Buys only if **all** gates pass:

| Gate | Rule |
|---|---|
| Age | 15 min – 6 h old |
| Market cap | $20k – $2M |
| Volume | ≥ $20k in the last hour |
| Buyers | ≥ 1.2× more buys than sells (1 h), and not selling off right now (5 min) |
| Momentum | up 10–300% in the last hour (not a vertical candle) |

Exits: **+40%** take profit, **−20%** stop loss, **6 h** time stop, or gone from the data for an hour → counted as dead.

Every token that fails is logged with the gate that killed it — that's half the story.

## Run it yourself

```bash
npm test
npm run tick     # one scan, writes data/state.json and data/trades.jsonl
npm run report   # writes REPORT.md and data/card.json
```

Fork it, change the numbers in `src/rules.js`, enable Actions — you get your own honest desk.

---

_Not financial advice. Memecoins are mostly a way to lose money; this repo exists to show exactly how often._
