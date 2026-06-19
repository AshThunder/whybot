import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assessDecision } from '../src/core/scorer.js';

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
