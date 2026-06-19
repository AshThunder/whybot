import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import request from 'supertest';
import { createApp } from '../src/server/app.js';

describe('API', () => {
  let dir: string;
  let app: ReturnType<typeof createApp>['app'];
  let storage: ReturnType<typeof createApp>['storage'];

  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'autopsy-api-'));
    const dbPath = join(dir, 'api-test.db');
    ({ app, storage } = createApp(dbPath));
  });

  after(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('GET /api/health', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.service, 'whybot');
  });

  it('GET /api/decisions empty then after POST', async () => {
    let res = await request(app).get('/api/decisions');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));

    res = await request(app).post('/api/decisions').send({
      agentId: 'api-test',
      agentName: 'API Test',
      thesis: 'Test thesis',
      reasoning: 'Test reasoning',
      confidence: 80,
      inputs: { symbol: 'SOLUSDT', price: 70 },
      action: { type: 'HOLD', symbol: 'SOLUSDT' },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.action.symbol, 'SOLUSDT');

    res = await request(app).get('/api/decisions');
    assert.ok(res.body.length >= 1);
  });

  it('GET /api/stats and /api/summary', async () => {
    const stats = await request(app).get('/api/stats');
    assert.equal(stats.status, 200);
    assert.ok(stats.body.totalDecisions >= 1);

    const summary = await request(app).get('/api/summary');
    assert.equal(summary.status, 200);
    assert.ok(Array.isArray(summary.body.latest));
  });

  it('serves dashboard index', async () => {
    const res = await request(app).get('/');
    assert.equal(res.status, 200);
    assert.match(res.text, /WhyBot/);
  });
});
