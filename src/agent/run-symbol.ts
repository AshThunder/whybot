import { writeFileSync } from 'node:fs';
import { AutopsyStorage } from '../core/storage.js';
import { AutopsySession } from '../core/logger.js';
import { BitgetHubClient } from './bitget-hub.js';
import { fetchLiveSignals, decideFromSignals } from './signals.js';
import { ensureWritableDirs, getApiLogPath } from '../config/paths.js';
import { DEFAULT_AGENT_ID, DEFAULT_AGENT_NAME } from '../config/agent.js';
import type { AgentDecision } from '../core/types.js';

export async function runForSymbol(
  storage: AutopsyStorage,
  hub: BitgetHubClient,
  symbol: string,
  options: {
    agentId?: string;
    agentName?: string;
    portfolioValue?: number;
    maxPositionPct?: number;
  } = {}
): Promise<AgentDecision> {
  const agentId = options.agentId ?? DEFAULT_AGENT_ID;
  const agentName = options.agentName ?? DEFAULT_AGENT_NAME;

  const session = new AutopsySession(storage, agentId, agentName, undefined, {
    portfolioValue: options.portfolioValue ?? 10000,
    maxPositionPct: options.maxPositionPct ?? 10,
  });

  const signals = await fetchLiveSignals(hub, symbol);
  for (const call of signals.apiCalls) {
    session.logMcpCall(hub.toMcpCall(call.module, call.tool, call.args, call.result));
  }

  if (!signals.apiCalls[0]?.result.ok) {
    throw new Error(`Bitget API failed for ${symbol}: ${signals.apiCalls[0]?.result.error}`);
  }

  const decision = decideFromSignals(signals);

  if (hub.hasAuth) {
    const balResult = await hub.call('account', 'get_account_assets', {});
    session.logMcpCall(hub.toMcpCall('account', 'get_account_assets', {}, balResult));
  }

  return session.record({
    thesis: decision.thesis,
    reasoning: decision.reasoning,
    confidence: decision.confidence,
    inputs: signals.inputs,
    action: {
      type: decision.actionType,
      symbol,
      sizePct: decision.sizePct || undefined,
      price: signals.price,
      stopLoss: decision.stopLoss,
      takeProfit: decision.takeProfit,
      orderType: 'analysis-only',
    },
    outcome: {
      executed: false,
      notes: 'Live analysis from real Bitget API data. Read-only — no order placed.',
    },
    tags: ['LIVE', 'BITGET_API'],
  });
}

export function exportApiLog(storage: AutopsyStorage, latest?: AgentDecision): string {
  ensureWritableDirs();
  const exportPath = getApiLogPath();
  const allDecisions = storage.getDecisions(500);
  writeFileSync(exportPath, JSON.stringify({
    exportedAt: new Date().toISOString(),
    source: 'live-agent',
    totalDecisions: allDecisions.length,
    latestDecision: latest ?? allDecisions[0],
    decisions: allDecisions,
  }, null, 2));
  return exportPath;
}
