import type { MarketInputs } from '../core/types.js';
import type { BitgetHubClient } from './bitget-hub.js';
import {
  parseOrderBook,
  parseTradeFlow,
  parseOpenInterest,
  parseSpotFuturesBasis,
} from './bitget-parsers.js';

const SYMBOL = process.env.AGENT_SYMBOL ?? 'BTCUSDT';
const PRODUCT_TYPE = 'USDT-FUTURES';

export interface LiveSignals {
  symbol: string;
  price: number;
  change24h: number;
  fundingRate: number;
  rsi: number;
  trend: 'bullish' | 'bearish' | 'neutral';
  inputs: MarketInputs;
  rawResponses: Record<string, unknown>;
  apiCalls: Array<{ module: string; tool: string; args: Record<string, unknown>; result: import('./bitget-hub.js').BitgetCallResult }>;
}

export async function fetchLiveSignals(hub: BitgetHubClient, symbol = SYMBOL): Promise<LiveSignals> {
  const futuresArgs = { symbol, productType: PRODUCT_TYPE };
  const candleArgs = { symbol, granularity: '1h', limit: '48' };

  const calls = [
    { module: 'spot', tool: 'spot_get_ticker', args: { symbol } },
    { module: 'futures', tool: 'futures_get_ticker', args: futuresArgs },
    { module: 'futures', tool: 'futures_get_funding_rate', args: futuresArgs },
    { module: 'spot', tool: 'spot_get_candles', args: candleArgs },
    { module: 'spot', tool: 'spot_get_depth', args: { symbol, limit: '20' } },
    { module: 'spot', tool: 'spot_get_trades', args: { symbol, limit: '100' } },
    { module: 'futures', tool: 'futures_get_open_interest', args: futuresArgs },
  ] as const;

  const apiCalls = [];
  const results: Record<string, import('./bitget-hub.js').BitgetCallResult> = {};

  for (const c of calls) {
    const result = await hub.call(c.module, c.tool, c.args as Record<string, unknown>);
    apiCalls.push({ module: c.module, tool: c.tool, args: c.args as Record<string, unknown>, result });
    results[c.tool] = result;
  }

  const spotTicker = results.spot_get_ticker!;
  const futuresTicker = results.futures_get_ticker!;
  const funding = results.futures_get_funding_rate!;
  const candles = results.spot_get_candles!;
  const depth = results.spot_get_depth!;
  const trades = results.spot_get_trades!;
  const openInterest = results.futures_get_open_interest!;

  const spotRow = Array.isArray(spotTicker.data) ? spotTicker.data[0] as Record<string, string> : null;
  const futuresRow = Array.isArray(futuresTicker.data) ? futuresTicker.data[0] as Record<string, string> : null;

  const spotPrice = parseFloat(spotRow?.lastPr ?? '0');
  const futuresPrice = parseFloat(futuresRow?.lastPr ?? '0');
  const price = spotPrice || futuresPrice;
  const change24h = parseFloat(spotRow?.change24h ?? futuresRow?.change24h ?? '0');

  let fundingRate = parseFloat(futuresRow?.fundingRate ?? '0');
  const fundData = funding.data as { currentFundRate?: { fundingRate?: string }[] } | undefined;
  if (fundData?.currentFundRate?.[0]?.fundingRate) {
    fundingRate = parseFloat(fundData.currentFundRate[0].fundingRate);
  }

  const candleRows = (candles.data ?? []) as string[][];
  const closes = candleRows.map((c) => parseFloat(c[4] ?? '0')).filter((n) => n > 0);
  const rsi = computeRsi(closes);

  let trend: LiveSignals['trend'] = 'neutral';
  if (change24h > 0.01 && rsi > 55) trend = 'bullish';
  else if (change24h < -0.01 && rsi < 45) trend = 'bearish';

  const basis = parseSpotFuturesBasis(spotPrice, futuresPrice);
  const orderBook = parseOrderBook(depth.data);
  const tradeFlow = parseTradeFlow(trades.data);
  const oi = parseOpenInterest(openInterest.data);

  const fearGreedProxy = Math.round(Math.max(10, Math.min(90, 50 + change24h * 500 + (rsi - 50) * 0.3)));

  const inputs: MarketInputs = {
    symbol,
    price,
    sentiment: {
      fearGreedIndex: fearGreedProxy,
      fundingRate,
      summary: `Live Bitget data — 24h ${(change24h * 100).toFixed(2)}%, funding ${(fundingRate * 100).toFixed(4)}%`,
    },
    technical: {
      rsi,
      trend,
      summary: `RSI ${rsi} on 1h candles (${closes.length} bars), trend ${trend}`,
    },
    bitget: {
      spotPrice,
      futuresPrice,
      basisPct: basis.pct,
      basisLabel: basis.label,
      openInterest: oi.size,
      openInterestLabel: oi.label,
      orderBookBuyPct: orderBook.buyPct,
      orderBookSellPct: orderBook.sellPct,
      orderBookLabel: orderBook.label,
      tradeFlowBuyPct: tradeFlow.buyPct,
      tradeFlowSellPct: tradeFlow.sellPct,
      tradeFlowCount: tradeFlow.count,
      tradeFlowLabel: tradeFlow.label,
    },
    rawSkillOutputs: {
      spotTicker: spotTicker.data,
      futuresTicker: futuresTicker.data,
      funding: funding.data,
      depth: depth.data,
      trades: trades.data,
      openInterest: openInterest.data,
      candleCount: closes.length,
    },
  };

  return {
    symbol,
    price,
    change24h,
    fundingRate,
    rsi,
    trend,
    inputs,
    rawResponses: {
      spotTicker: spotTicker.data,
      futuresTicker: futuresTicker.data,
      funding: funding.data,
      depth: depth.data,
      trades: trades.data,
      openInterest: openInterest.data,
    },
    apiCalls,
  };
}

/** Candle format: [ts, open, high, low, close, ...] */
function computeRsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i]! - closes[i - 1]!;
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round(100 - 100 / (1 + rs));
}

export interface LiveDecision {
  thesis: string;
  reasoning: string;
  confidence: number;
  actionType: 'BUY' | 'SELL' | 'HOLD' | 'SKIP';
  sizePct: number;
  stopLoss?: number;
  takeProfit?: number;
}

function buildMarketContext(signals: LiveSignals): string {
  const b = signals.inputs.bitget;
  if (!b) return '';
  const parts: string[] = [];
  if (b.basisLabel && Math.abs(b.basisPct ?? 0) > 0.02) parts.push(b.basisLabel);
  if (b.orderBookLabel) parts.push(`Order book: ${b.orderBookLabel}`);
  if (b.tradeFlowLabel && b.tradeFlowCount) parts.push(`Recent trades: ${b.tradeFlowLabel}`);
  if (b.openInterestLabel && b.openInterest) parts.push(b.openInterestLabel);
  return parts.length ? ` Bitget also shows: ${parts.join('. ')}.` : '';
}

function alignedBuyPressure(signals: LiveSignals): boolean {
  const b = signals.inputs.bitget;
  return (b?.orderBookBuyPct ?? 50) >= 58 && (b?.tradeFlowBuyPct ?? 50) >= 58;
}

function alignedSellPressure(signals: LiveSignals): boolean {
  const b = signals.inputs.bitget;
  return (b?.orderBookSellPct ?? 50) >= 58 && (b?.tradeFlowSellPct ?? 50) >= 58;
}

export function decideFromSignals(signals: LiveSignals): LiveDecision {
  const { change24h, fundingRate, rsi, trend, price, symbol } = signals;
  const pair = symbol.replace('USDT', '/USDT');
  const changePct = change24h * 100;
  const ctx = buildMarketContext(signals);

  const trending = Math.abs(change24h) > 0.015;

  if (!trending) {
    return {
      thesis: 'Price is moving sideways — no clear buy or sell signal',
      reasoning: `${pair} is at $${price.toLocaleString()}. It only moved ${changePct.toFixed(2)}% in 24h (pretty flat). The bot chose to wait — nothing strong enough to act on.${ctx}`,
      confidence: 78,
      actionType: 'HOLD',
      sizePct: 0,
    };
  }

  if (trend === 'bullish' && rsi < 72 && fundingRate < 0.0003) {
    const stop = Math.round(price * 0.97);
    const tp = Math.round(price * 1.04);
    let confidence = Math.min(85, 60 + Math.round(changePct * 3));
    if (alignedBuyPressure(signals)) confidence = Math.min(88, confidence + 3);
    return {
      thesis: 'Price is trending up — bot wants a small buy with limits',
      reasoning: `Price is up ${changePct.toFixed(2)}% in 24h and momentum looks healthy. Bot wants a small 3% buy with stop-loss at $${stop.toLocaleString()} and take-profit at $${tp.toLocaleString()}. Paper trade only.${ctx}`,
      confidence,
      actionType: 'BUY',
      sizePct: 3,
      stopLoss: stop,
      takeProfit: tp,
    };
  }

  if (trend === 'bearish' || rsi > 75) {
    let confidence = 74;
    if (alignedSellPressure(signals)) confidence = Math.min(82, confidence + 4);
    return {
      thesis: 'Market looks overheated or weak — stay out',
      reasoning: `${rsi > 75 ? 'Momentum score is very high (may be due for a drop).' : 'Price trend is down.'} 24h move: ${changePct.toFixed(2)}%. Bot says hold — don't open new trades.${ctx}`,
      confidence,
      actionType: 'HOLD',
      sizePct: 0,
    };
  }

  if (fundingRate < -0.0002 && rsi < 35) {
    return {
      thesis: 'Price looks beaten down — risky small buy',
      reasoning: `Price has been selling off (momentum score ${rsi}). Bot sees a possible bounce but calls it high risk — small 2% paper buy with a tight stop.${ctx}`,
      confidence: 58,
      actionType: 'BUY',
      sizePct: 2,
      stopLoss: Math.round(price * 0.96),
      takeProfit: Math.round(price * 1.03),
    };
  }

  return {
    thesis: 'Signals disagree — bot says sit this one out',
    reasoning: `Price $${price.toLocaleString()}, 24h ${changePct.toFixed(2)}%, momentum ${rsi}. Nothing lines up clearly — bot skipped trading.${ctx}`,
    confidence: 65,
    actionType: 'SKIP',
    sizePct: 0,
  };
}
