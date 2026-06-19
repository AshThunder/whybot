/** Default pairs the live agent analyzes. Override with AGENT_SYMBOLS=BTCUSDT,ETHUSDT,... */
export const DEFAULT_SYMBOLS = [
  'BTCUSDT',
  'ETHUSDT',
  'SOLUSDT',
  'BNBUSDT',
  'XRPUSDT',
  'DOGEUSDT',
  'ADAUSDT',
  'AVAXUSDT',
  'LINKUSDT',
  'ARBUSDT',
] as const;

export type DefaultSymbol = (typeof DEFAULT_SYMBOLS)[number];

/** Human label for a USDT pair */
export function coinLabel(symbol: string): string {
  return symbol.replace(/USDT$/i, '');
}

export function parseSymbolList(raw?: string): string[] {
  const fromEnv = raw ?? process.env.AGENT_SYMBOLS ?? process.env.AGENT_SYMBOL;
  if (!fromEnv?.trim()) return [...DEFAULT_SYMBOLS];
  return fromEnv.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
}

export const POLL_INTERVAL_MS = Number(process.env.DASHBOARD_POLL_MS ?? 5000);
