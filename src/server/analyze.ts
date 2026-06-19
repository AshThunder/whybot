import { existsSync, readFileSync } from 'node:fs';
import { AutopsyStorage } from '../core/storage.js';
import { BitgetHubClient } from '../agent/bitget-hub.js';
import { runForSymbol, exportApiLog } from '../agent/run-symbol.js';
import { DEFAULT_SYMBOLS, parseSymbolList } from '../config/symbols.js';
import { getDbPath, getApiLogPath } from '../config/paths.js';
import { loadDotEnv } from '../agent/env.js';
import { getBuiltInAgent } from '../config/agent.js';

loadDotEnv();

let analyzing = false;

export async function runAnalysis(symbols?: string[], dbPath = getDbPath()) {
  if (analyzing) throw new Error('Still checking coins — wait a moment and try again');
  analyzing = true;
  try {
    const list = symbols?.length ? symbols : parseSymbolList();
    const storage = new AutopsyStorage(dbPath);
    const hub = new BitgetHubClient({ readOnly: true });
    const { id, name } = getBuiltInAgent();
    const results = [];
    for (const symbol of list) {
      try {
        results.push(await runForSymbol(storage, hub, symbol, { agentId: id, agentName: name }));
      } catch (err) {
        console.error(`Analyze ${symbol} failed:`, err);
      }
    }
    if (results.length) exportApiLog(storage, results[results.length - 1]);
    storage.close();
    return { count: results.length, symbols: list, decisions: results };
  } finally {
    analyzing = false;
  }
}

export function getSummary(storage: AutopsyStorage, agentId?: string) {
  const latest = storage.getLatestPerSymbol(agentId);
  const stats = storage.getStats();

  const warnings: string[] = [];
  for (const d of latest) {
    if (d.risk.flags.length) {
      warnings.push(`${d.action.symbol}: ${plainFlags(d.risk.flags).join(', ')}`);
    }
    if (d.risk.overall < 55) {
      warnings.push(`${d.action.symbol}: low safety score (${d.risk.overall}/100)`);
    }
  }

  return {
    latest: latest.map(simplifyDecision),
    stats,
    warnings,
    symbols: storage.getSymbols().length ? storage.getSymbols() : [...DEFAULT_SYMBOLS],
  };
}

function plainFlags(flags: string[]): string[] {
  const map: Record<string, string> = {
    OVERSIZED_POSITION: 'bet too big',
    ABOVE_MAX_ALLOCATION: 'over size limit',
    NO_STOP_LOSS: 'no stop-loss set',
    NO_RISK_CONTROLS: 'no safety limits',
    THESIS_MISMATCH: 'words don’t match action',
    OVERCONFIDENT: 'too sure, lost money',
    EXTREME_GREED_ENTRY: 'bought in greed zone',
    EXTREME_FEAR_EXIT: 'sold in fear zone',
  };
  return flags.map((f) => map[f] ?? f.toLowerCase().replace(/_/g, ' '));
}

function safetyLabel(score: number): 'Good' | 'OK' | 'Risky' {
  if (score >= 75) return 'Good';
  if (score >= 55) return 'OK';
  return 'Risky';
}

function bitgetSnapshot(d: import('../core/types.js').AgentDecision) {
  const b = d.inputs.bitget;
  if (!b) return null;
  return {
    basisPct: b.basisPct,
    orderBookBuyPct: b.orderBookBuyPct,
    tradeFlowBuyPct: b.tradeFlowBuyPct,
    openInterestLabel: b.openInterestLabel,
  };
}

function simplifyDecision(d: import('../core/types.js').AgentDecision) {
  return {
    id: d.id,
    symbol: d.action.symbol,
    action: d.action.type,
    price: d.inputs.price,
    safetyScore: d.risk.overall,
    safetyGrade: d.risk.grade,
    safetyLabel: safetyLabel(d.risk.overall),
    summary: d.thesis,
    time: d.timestamp,
    isLive: (d.tags ?? []).includes('LIVE'),
    hasBitget: Boolean(d.inputs.bitget),
    bitget: bitgetSnapshot(d),
  };
}

export function readExportLog(): object | null {
  const path = getApiLogPath();
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}
