import type { BitgetHubClient } from './bitget-hub.js';

const CACHE_MS = 60 * 60 * 1000;
let cache: { symbols: string[]; fetchedAt: number } | null = null;

type SymbolRow = { symbol?: string; status?: string; quoteCoin?: string };

export async function fetchBitgetUsdtSymbols(hub: BitgetHubClient): Promise<string[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_MS) return cache.symbols;

  const result = await hub.call('spot', 'spot_get_symbols', { type: 'symbols' });
  if (!result.ok || !Array.isArray(result.data)) {
    throw new Error(result.error ?? 'Failed to load Bitget symbol list');
  }

  const symbols = (result.data as SymbolRow[])
    .filter((s) => s.status === 'online' && s.quoteCoin === 'USDT' && s.symbol?.endsWith('USDT'))
    .map((s) => s.symbol!)
    .sort();

  cache = { symbols, fetchedAt: Date.now() };
  return symbols;
}

export function clearBitgetSymbolCache(): void {
  cache = null;
}
