import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseOrderBook,
  parseTradeFlow,
  parseOpenInterest,
  parseSpotFuturesBasis,
} from '../src/agent/bitget-parsers.js';

describe('bitget-parsers', () => {
  it('parseOrderBook detects buy-side pressure', () => {
    const book = parseOrderBook({
      bids: [['100', '10'], ['99', '5']],
      asks: [['101', '2'], ['102', '1']],
    });
    assert.ok(book.buyPct >= 58);
    assert.match(book.label, /buy/i);
  });

  it('parseTradeFlow counts buy vs sell volume', () => {
    const flow = parseTradeFlow([
      { side: 'buy', price: '100', size: '1' },
      { side: 'buy', price: '100', size: '2' },
      { side: 'sell', price: '100', size: '0.5' },
    ]);
    assert.equal(flow.count, 3);
    assert.ok(flow.buyPct > flow.sellPct);
    assert.match(flow.label, /buy/i);
  });

  it('parseOpenInterest reads futures OI', () => {
    const oi = parseOpenInterest({ openInterestList: [{ symbol: 'BTCUSDT', size: '12500.5' }] });
    assert.equal(oi.size, 12500.5);
    assert.match(oi.label, /contracts open/i);
  });

  it('parseSpotFuturesBasis computes gap', () => {
    const basis = parseSpotFuturesBasis(100, 100.5);
    assert.ok(basis.pct > 0);
    assert.match(basis.label, /above spot/i);
  });
});
