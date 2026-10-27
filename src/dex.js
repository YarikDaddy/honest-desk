// DexScreener: бесплатный публичный API без ключа. Берём свежие токены Solana и их пары.

const API = "https://api.dexscreener.com";

async function get(path) {
  const res = await fetch(API + path, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`DexScreener ${path}: HTTP ${res.status}`);
  return res.json();
}

// Свежие профили и бусты — так DexScreener показывает «что только что появилось».
export async function candidateTokens() {
  const [profiles, boosts] = await Promise.all([get("/token-profiles/latest/v1"), get("/token-boosts/latest/v1")]);
  const addrs = [...profiles, ...boosts].filter((t) => t.chainId === "solana").map((t) => t.tokenAddress);
  return [...new Set(addrs)];
}

// До 30 токенов за запрос; на каждый токен — его самая живая пара (по объёму за час).
export async function pairsFor(tokens) {
  const out = new Map();
  for (let i = 0; i < tokens.length; i += 30) {
    const chunk = tokens.slice(i, i + 30);
    const pairs = await get(`/tokens/v1/solana/${chunk.join(",")}`);
    for (const p of pairs) {
      const t = p.baseToken?.address;
      if (!t) continue;
      const prev = out.get(t);
      if (!prev || (p.volume?.h1 || 0) > (prev.volume?.h1 || 0)) out.set(t, p);
    }
  }
  return out; // token → pair
}
