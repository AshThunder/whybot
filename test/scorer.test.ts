import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assessDecision } from '../src/core/scorer.js';

const liveInputs = {
  symbol: 'BTCUSDT',
  price: 63000,
  sentiment: { fundingRate: 0.0001, fearGreedIndex: 52 },
  technical: { rsi: 52, trend: 'neutral' as const },
  bitget: {
    orderBookBuyPct: 51,
    orderBookSellPct: 49,
    tradeFlowBuyPct: 50,
    tradeFlowSellPct: 50,
    tradeFlowCount: 100,
  },
};

describe('assessDecision', () => {
  it('scores HOLD highly when no position change', () => {
    const risk = assessDecision(
      'Price is flat',
      'Wait for clarity',
      75,
      { symbol: 'BTCUSDT', price: 63000 },
      { type: 'HOLD', symbol: 'BTCUSDT' },
      { maxPositionPct: 10 }
    );
    assert.ok(risk.overall >= 70);
    assert.ok(['A', 'B'].includes(risk.grade));
    assert.equal(risk.flags.length, 0);
  });

  it('differentiates passive decisions instead of a flat 82', () => {
    const flatHold = assessDecision(
      'Price is moving sideways — no clear buy or sell signal',
      'BTC/USDT is pretty flat. The bot chose to wait.',
      78,
      liveInputs,
      { type: 'HOLD', symbol: 'BTCUSDT' }
    );

    const bearishHold = assessDecision(
      'Market looks overheated or weak — stay out',
      'Momentum score is very high. Bot says hold — do not open new trades.',
      74,
      {
        ...liveInputs,
        technical: { rsi: 78, trend: 'bearish' },
        bitget: {
          ...liveInputs.bitget,
          orderBookSellPct: 62,
          tradeFlowSellPct: 61,
        },
      },
      { type: 'HOLD', symbol: 'BTCUSDT' }
    );

    const mixedSkip = assessDecision(
      'Signals disagree — bot says sit this one out',
      'Nothing lines up clearly — bot skipped trading.',
      65,
      {
        ...liveInputs,
        technical: { rsi: 55, trend: 'bullish' },
        sentiment: { fundingRate: -0.00025, fearGreedIndex: 48 },
        bitget: {
          orderBookBuyPct: 62,
          orderBookSellPct: 38,
          tradeFlowBuyPct: 40,
          tradeFlowSellPct: 60,
          tradeFlowCount: 100,
        },
      },
      { type: 'SKIP', symbol: 'BTCUSDT' }
    );

    assert.notEqual(flatHold.overall, bearishHold.overall);
    assert.notEqual(flatHold.overall, mixedSkip.overall);
    assert.notEqual(bearishHold.overall, mixedSkip.overall);
    assert.ok(bearishHold.overall >= flatHold.overall);
    assert.ok(mixedSkip.overall >= 70);
  });

  it('flags oversized BUY positions', () => {
    const risk = assessDecision(
      'Strong momentum',
      'Buy big',
      90,
      { symbol: 'BTCUSDT', price: 63000 },
      { type: 'BUY', symbol: 'BTCUSDT', sizePct: 25, stopLoss: 60000 },
      { maxPositionPct: 10 }
    );
    assert.ok(risk.flags.includes('OVERSIZED_POSITION') || risk.flags.includes('ABOVE_MAX_ALLOCATION'));
    assert.ok(risk.overall < 70);
  });

  it('flags BUY without stop-loss', () => {
    const risk = assessDecision(
      'Breakout',
      'Buy now',
      80,
      { symbol: 'BTCUSDT' },
      { type: 'BUY', symbol: 'BTCUSDT', sizePct: 3 },
      { maxPositionPct: 10 }
    );
    assert.ok(risk.flags.includes('NO_RISK_CONTROLS'));
  });
});
