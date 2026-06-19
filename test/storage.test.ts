import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AutopsyStorage } from '../src/core/storage.js';

describe('AutopsyStorage', () => {
  let dir: string;
  let dbPath: string;
  let storage: AutopsyStorage;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'autopsy-test-'));
    dbPath = join(dir, 'test.db');
    storage = new AutopsyStorage(dbPath);
  });

  after(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('records and retrieves decisions', () => {
    const d = storage.recordDecision({
      agentId: 'test-agent',
      agentName: 'Test Agent',
      thesis: 'Sideways market',
      reasoning: 'No trade',
      confidence: 75,
      inputs: { symbol: 'BTCUSDT', price: 63000 },
      action: { type: 'HOLD', symbol: 'BTCUSDT' },
      tags: ['TEST'],
    });
    assert.ok(d.id);
    assert.equal(d.risk.overall, d.risk.overall);
    const found = storage.getDecision(d.id);
    assert.equal(found?.action.type, 'HOLD');
    assert.equal(storage.getDecisions(10).length, 1);
  });

  it('returns latest per symbol', () => {
    storage.recordDecision({
      agentId: 'test-agent',
      agentName: 'Test Agent',
      thesis: 'ETH flat',
      reasoning: 'Wait',
      confidence: 70,
      inputs: { symbol: 'ETHUSDT', price: 1700 },
      action: { type: 'HOLD', symbol: 'ETHUSDT' },
    });
    const latest = storage.getLatestPerSymbol();
    const symbols = latest.map((d) => d.action.symbol);
    assert.ok(symbols.includes('BTCUSDT'));
    assert.ok(symbols.includes('ETHUSDT'));
  });

  it('computes stats', () => {
    const stats = storage.getStats();
    assert.ok(stats.totalDecisions >= 2);
    assert.ok(stats.avgRiskScore > 0);
  });
});
