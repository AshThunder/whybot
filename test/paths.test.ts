import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getDbPath, getApiLogPath, getDataDir } from '../src/config/paths.js';

describe('paths', () => {
  it('uses project data dir locally', () => {
    const prev = process.env.VERCEL;
    delete process.env.VERCEL;
    delete process.env.AUTOPSY_DB_PATH;
    assert.match(getDataDir(), /data$/);
    assert.match(getDbPath(), /whybot\.db$/);
    assert.match(getApiLogPath(), /api-call-log\.json$/);
    if (prev) process.env.VERCEL = prev;
  });

  it('uses /tmp on Vercel', () => {
    const prev = process.env.VERCEL;
    process.env.VERCEL = '1';
    delete process.env.AUTOPSY_DB_PATH;
    assert.match(getDbPath(), /^\/tmp\//);
    process.env.VERCEL = prev;
  });
});
