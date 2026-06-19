import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SYMBOLS, parseSymbolList, coinLabel } from '../src/config/symbols.js';

describe('parseSymbolList', () => {
  it('returns defaults when empty', () => {
    assert.deepEqual(parseSymbolList(''), [...DEFAULT_SYMBOLS]);
    assert.deepEqual(parseSymbolList(undefined), [...DEFAULT_SYMBOLS]);
  });

  it('parses comma-separated pairs', () => {
    assert.deepEqual(parseSymbolList('btcusdt, ETHUSDT'), ['BTCUSDT', 'ETHUSDT']);
  });

  it('coinLabel strips USDT suffix', () => {
    assert.equal(coinLabel('BTCUSDT'), 'BTC');
    assert.equal(coinLabel('ETHUSDT'), 'ETH');
  });
});

describe('DEFAULT_SYMBOLS', () => {
  it('includes 10 tokens', () => {
    assert.equal(DEFAULT_SYMBOLS.length, 10);
    assert.ok(DEFAULT_SYMBOLS.includes('BTCUSDT'));
    assert.ok(DEFAULT_SYMBOLS.includes('ARBUSDT'));
  });
});
