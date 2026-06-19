import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express, { type Express } from 'express';
import { AutopsyStorage } from '../core/storage.js';
import { DEFAULT_SYMBOLS, POLL_INTERVAL_MS } from '../config/symbols.js';
import { getBuiltInAgent } from '../config/agent.js';
import { getDbPath } from '../config/paths.js';
import { runAnalysis, getSummary, readExportLog } from './analyze.js';
import { buildCompare } from './compare.js';
import { BitgetHubClient } from '../agent/bitget-hub.js';
import { fetchBitgetUsdtSymbols } from '../agent/bitget-symbols.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createApp(dbPath = getDbPath()): { app: Express; storage: AutopsyStorage } {
  const storage = new AutopsyStorage(dbPath);
  const app = express();

  app.use(cors());
  app.use(express.json());

  const publicDir = join(__dirname, '../../public');
  app.use(express.static(publicDir));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'whybot',
      version: '1.0.0',
      serverTime: new Date().toISOString(),
      vercel: Boolean(process.env.VERCEL),
    });
  });

  app.get('/api/meta', (_req, res) => {
    const decisions = storage.getDecisions(500);
    const agentMap = new Map<string, string>();
    for (const d of decisions) agentMap.set(d.agentId, d.agentName);
    const builtInAgent = getBuiltInAgent();
    if (!agentMap.has(builtInAgent.id)) agentMap.set(builtInAgent.id, builtInAgent.name);
    res.json({
      pollIntervalMs: POLL_INTERVAL_MS,
      defaultSymbols: DEFAULT_SYMBOLS,
      symbols: storage.getSymbols().length ? storage.getSymbols() : [...DEFAULT_SYMBOLS],
      agents: [...agentMap.entries()].map(([id, name]) => ({ id, name })),
      builtInAgent,
      integrateUrl: '/api/decisions',
      serverTime: new Date().toISOString(),
    });
  });

  app.get('/api/symbols/bitget', async (_req, res) => {
    try {
      const hub = new BitgetHubClient({ readOnly: true });
      const symbols = await fetchBitgetUsdtSymbols(hub);
      res.json({ count: symbols.length, symbols });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/stats', (_req, res) => {
    res.json(storage.getStats());
  });

  app.get('/api/sessions', (_req, res) => {
    res.json(storage.getSessions());
  });

  app.get('/api/summary', (req, res) => {
    const agentId = req.query.agentId as string | undefined;
    res.json(getSummary(storage, agentId || undefined));
  });

  app.post('/api/analyze', async (req, res) => {
    try {
      const symbols = Array.isArray(req.body?.symbols) ? req.body.symbols : undefined;
      const result = await runAnalysis(symbols, dbPath);
      res.json({ ok: true, message: `Checked ${result.count} coin${result.count === 1 ? '' : 's'}`, ...result });
    } catch (err) {
      res.status(429).json({ ok: false, error: String(err) });
    }
  });

  app.get('/api/export/log', (_req, res) => {
    const log = readExportLog();
    if (!log) {
      res.status(404).json({ error: 'No log yet — run analysis first' });
      return;
    }
    res.setHeader('Content-Disposition', 'attachment; filename="api-call-log.json"');
    res.json(log);
  });

  app.get('/api/decisions', (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 100), 500);
    const offset = Number(req.query.offset ?? 0);
    const agentId = req.query.agentId as string | undefined;
    const symbol = req.query.symbol as string | undefined;
    res.json(storage.getDecisions(limit, offset, agentId, symbol));
  });

  app.get('/api/trends', (req, res) => {
    const symbol = req.query.symbol as string | undefined;
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    res.json(storage.getTrends(symbol, limit));
  });

  app.get('/api/decisions/:id/compare', (req, res) => {
    const decision = storage.getDecision(req.params.id);
    if (!decision) {
      res.status(404).json({ error: 'Decision not found' });
      return;
    }
    const previous = storage.getPreviousForSymbol(
      decision.action.symbol,
      decision.timestamp,
      decision.id
    );
    res.json(buildCompare(decision, previous));
  });

  app.get('/api/decisions/:id', (req, res) => {
    const decision = storage.getDecision(req.params.id);
    if (!decision) {
      res.status(404).json({ error: 'Decision not found' });
      return;
    }
    res.json(decision);
  });

  app.post('/api/decisions', (req, res) => {
    try {
      const decision = storage.recordDecision(req.body);
      res.status(201).json(decision);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  app.get('*', (_req, res) => {
    const indexPath = join(publicDir, 'index.html');
    if (existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send('Dashboard not found');
    }
  });

  return { app, storage };
}
