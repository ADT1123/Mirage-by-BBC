// Stock and index quotes for the Stocks widget, from Yahoo Finance's public chart data
// (no account or key). Symbols use Yahoo's format: ^NSEI, RELIANCE.NS, AAPL, BTC-USD.

const cache = new Map(); // symbol -> { at, value }
const TTL = 60 * 1000;

async function one(symbol) {
  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=5m`, {
      signal: ctrl.signal,
      headers: { 'user-agent': 'Mozilla/5.0' },
    });
    const r = (await res.json()).chart?.result?.[0];
    if (!r?.meta) throw new Error('no data');
    const m = r.meta;
    const prev = m.chartPreviousClose ?? m.previousClose;
    const price = m.regularMarketPrice;
    const points = (r.indicators?.quote?.[0]?.close || []).filter((v) => typeof v === 'number');
    const value = {
      symbol,
      name: m.shortName || m.longName || symbol,
      price,
      change: prev ? price - prev : 0,
      pct: prev ? ((price - prev) / prev) * 100 : 0,
      currency: m.currency || '',
      prev,
      points: points.length > 60 ? points.filter((_, i) => i % Math.ceil(points.length / 60) === 0) : points,
      time: (m.regularMarketTime || 0) * 1000,
    };
    cache.set(symbol, { at: Date.now(), value });
    return value;
  } catch {
    return hit?.value || { symbol, error: true }; // offline: keep the last price
  } finally {
    clearTimeout(t);
  }
}

async function quotes(symbols = []) {
  const list = [...new Set(symbols.map((s) => String(s).trim().toUpperCase()).filter(Boolean))].slice(0, 8);
  return { updated: Date.now(), items: await Promise.all(list.map(one)) };
}

module.exports = { quotes };
