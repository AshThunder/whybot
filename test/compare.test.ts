import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCompare } from '../src/server/compare.js';
import type { AgentDecision } from '../src/core/types.js';

function mockDecision(overrides: Partial<AgentDecision> = {}): AgentDecision {
  return {
    id: '1',
    agentId: 'a',
    agentName: 'Test',
    sessionId: 's',
    timestamp: '2026-06-19T12:00:00.000Z',
    thesis: 'Flat market',
    reasoning: 'Wait',
    confidence: 70,
    inputs: { symbol: 'BTCUSDT', price: 63000, technical: { rsi: 50 } },
    action: { type: 'HOLD', symbol: 'BTCUSDT' },
    risk: {
      overall: 82,
      grade: 'B',
      dimensions: [],
      flags: [],
      summary: 'OK',
    },
    ...overrides,
  };
}

describe('buildCompare', () => {
  it('returns empty changes when no previous decision', () => {
    const result = buildCompare(mockDecision(), null);
    assert.equal(result.previous, null);
    assert.deepEqual(result.changes, []);
  });

  it('detects price and action changes', () => {
    const prev = mockDecision({
      id: '0',
      timestamp: '2026-06-19T11:00:00.000Z',
      inputs: { symbol: 'BTCUSDT', price: 62000, technical: { rsi: 45 } },
      action: { type: 'HOLD', symbol: 'BTCUSDT' },
      risk: { overall: 80, grade: 'B', dimensions: [], flags: [], summary: '' },
    });
    const curr = mockDecision({
      action: { type: 'BUY', symbol: 'BTCUSDT', sizePct: 3, stopLoss: 60000 },
      inputs: { symbol: 'BTCUSDT', price: 63000, technical: { rsi: 55 } },
    });
    const result = buildCompare(curr, prev);
    assert.ok(result.changes.some((c) => c.label === 'Price'));
    assert.ok(result.changes.some((c) => c.label === 'Bot choice'));
  });
});
