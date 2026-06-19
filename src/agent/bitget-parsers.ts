/** Parse public Bitget API responses into plain dashboard fields */

export interface OrderBookPressure {
  buyPct: number;
  sellPct: number;
  label: string;
}

export interface TradeFlow {
  buyPct: number;
  sellPct: number;
  count: number;
  label: string;
}

export interface OpenInterestInfo {
  size: number;
  label: string;
}

export interface SpotFuturesBasis {
  spotPrice: number;
  futuresPrice: number;
  pct: number;
  label: string;
}

export function parseOrderBook(depth: unknown): OrderBookPressure {
  const d = depth as { bids?: string[][]; asks?: string[][] } | null;
  let bidVol = 0;
  let askVol = 0;
  for (const row of d?.bids ?? []) bidVol += parseFloat(row[1] ?? '0');
  for (const row of d?.asks ?? []) askVol += parseFloat(row[1] ?? '0');
  const total = bidVol + askVol;
  if (total <= 0) return { buyPct: 50, sellPct: 50, label: 'Balanced order book' };
  const buyPct = Math.round((bidVol / total) * 100);
  const sellPct = 100 - buyPct;
  let label = 'Balanced order book';
  if (buyPct >= 58) label = 'More buy orders in the book';
  else if (sellPct >= 58) label = 'More sell orders in the book';
  return { buyPct, sellPct, label };
}

export function parseTradeFlow(trades: unknown): TradeFlow {
  const arr = Array.isArray(trades) ? trades as { side?: string; price?: string; size?: string }[] : [];
  let buyVol = 0;
  let sellVol = 0;
  for (const t of arr) {
    const vol = parseFloat(t.size ?? '0') * parseFloat(t.price ?? '0');
    if (t.side === 'buy') buyVol += vol;
    else if (t.side === 'sell') sellVol += vol;
  }
  const total = buyVol + sellVol;
  if (total <= 0 || !arr.length) {
    return { buyPct: 50, sellPct: 50, count: arr.length, label: 'Not enough trade data' };
  }
  const buyPct = Math.round((buyVol / total) * 100);
  const sellPct = 100 - buyPct;
  let label = 'Mixed recent trades';
  if (buyPct >= 58) label = 'Recent trades mostly buys';
  else if (sellPct >= 58) label = 'Recent trades mostly sells';
  return { buyPct, sellPct, count: arr.length, label };
}

export function parseOpenInterest(data: unknown): OpenInterestInfo {
  const d = data as { openInterestList?: { size?: string; symbol?: string }[] } | null;
  const size = parseFloat(d?.openInterestList?.[0]?.size ?? '0');
  if (!size) return { size: 0, label: 'No open interest data' };
  const formatted = size >= 1000 ? `${(size / 1000).toFixed(1)}k` : size.toFixed(2);
  return { size, label: `${formatted} futures contracts open` };
}

export function parseSpotFuturesBasis(spotPrice: number, futuresPrice: number): SpotFuturesBasis {
  if (!spotPrice || !futuresPrice) {
    return { spotPrice, futuresPrice, pct: 0, label: 'Spot/futures prices unavailable' };
  }
  const pct = ((futuresPrice - spotPrice) / spotPrice) * 100;
  let label = 'Spot and futures prices match';
  if (pct > 0.03) label = `Futures ${pct.toFixed(3)}% above spot`;
  else if (pct < -0.03) label = `Futures ${Math.abs(pct).toFixed(3)}% below spot`;
  return { spotPrice, futuresPrice, pct, label };
}
