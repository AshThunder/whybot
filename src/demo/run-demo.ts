import { writeFileSync } from 'node:fs';
import { AutopsyStorage } from '../core/storage.js';
import { AutopsySession } from '../core/logger.js';
import { ensureWritableDirs, getDbPath, getApiLogPath } from '../config/paths.js';
import type { McpToolCall } from '../core/types.js';

const DB_PATH = getDbPath();
const seedOnly = process.argv.includes('--seed-only');

function mcpCall(tool: string, module: string, params: Record<string, unknown>, summary: string, ms: number): McpToolCall {
  return {
    tool,
    module,
    params,
    responseSummary: summary,
    durationMs: ms,
    timestamp: new Date().toISOString(),
  };
}

async function runDemo() {
  ensureWritableDirs();

  const storage = new AutopsyStorage(DB_PATH);
  storage.clear();

  const session = new AutopsySession(storage, 'regime-router-v1', 'Regime Router Agent', undefined, {
    portfolioValue: 10000,
    maxPositionPct: 10,
  });

  const decisions = [
    {
      offsetHours: -72,
      thesis: 'BTC in trending regime — ride momentum with controlled size',
      reasoning: 'Macro neutral, sentiment moderate (F&G 58), technical breakout above $104k resistance. Funding positive but not extreme. Entering long with tight stop below breakout level.',
      confidence: 72,
      inputs: {
        symbol: 'BTCUSDT',
        price: 104250,
        sentiment: { fearGreedIndex: 58, fundingRate: 0.012, longShortRatio: 1.08, summary: 'Neutral-to-broken positioning' },
        macro: { dxy: 104.2, nasdaqChange: 0.4, fedSignal: 'hold', summary: 'Macro backdrop stable, no imminent catalyst' },
        technical: { rsi: 62, trend: 'bullish' as const, support: 102800, resistance: 104500, summary: 'Breakout confirmed on 4H, RSI not overbought' },
      },
      action: { type: 'BUY' as const, symbol: 'BTCUSDT', sizePct: 5, price: 104250, stopLoss: 102500, takeProfit: 108000, orderType: 'limit' },
      outcome: { pnl: 187.5, pnlPct: 1.88, balanceAfter: 10187.5, executed: true, executionDelayMs: 340, slippagePct: 0.02 },
      mcp: [
        mcpCall('sentiment_analyze', 'skill-hub', { symbol: 'BTCUSDT' }, 'F&G: 58, funding: +0.012%', 890),
        mcpCall('technical_analysis', 'skill-hub', { symbol: 'BTCUSDT', interval: '4H' }, 'Bullish breakout, RSI 62', 1200),
        mcpCall('futures_place_order', 'futures', { symbol: 'BTCUSDT', side: 'buy', size: 0.048 }, 'Order filled @ 104,248', 2100),
      ],
    },
    {
      offsetHours: -48,
      thesis: 'Regime shift detected — reduce exposure before mean reversion',
      reasoning: 'F&G spiked to 78 (greed zone) while funding flipped negative. On-chain shows exchange inflow spike. Technical RSI 74 overbought. Reducing long by 50%.',
      confidence: 81,
      inputs: {
        symbol: 'BTCUSDT',
        price: 106100,
        sentiment: { fearGreedIndex: 78, fundingRate: -0.008, longShortRatio: 1.35, summary: 'Crowded longs, funding divergence' },
        onChain: { whaleFlow: 'inflow' as const, exchangeNetflow: 2400, summary: 'Large BTC deposits to exchanges — distribution signal' },
        technical: { rsi: 74, trend: 'bullish' as const, support: 104000, resistance: 107000, summary: 'Overbought, divergence forming' },
      },
      action: { type: 'REDUCE' as const, symbol: 'BTCUSDT', sizePct: 2.5, price: 106100, stopLoss: 104800, orderType: 'market' },
      outcome: { pnl: 92.3, pnlPct: 0.92, balanceAfter: 10279.8, executed: true, executionDelayMs: 180, slippagePct: 0.04 },
      mcp: [
        mcpCall('market_intel', 'skill-hub', { symbol: 'BTCUSDT' }, 'Exchange inflow +2400 BTC', 950),
        mcpCall('sentiment_analyze', 'skill-hub', { symbol: 'BTCUSDT' }, 'F&G: 78, funding: -0.008%', 870),
        mcpCall('futures_place_order', 'futures', { symbol: 'BTCUSDT', side: 'sell', size: 0.024 }, 'Partial close @ 106,095', 1800),
      ],
    },
    {
      offsetHours: -24,
      thesis: 'Panic regime — stay flat, do not catch falling knife',
      reasoning: 'Macro risk-off: DXY surging, Nasdaq -1.8%. F&G dropped to 22 (fear). Agent detected regime=CRISIS. No new positions despite oversold RSI.',
      confidence: 88,
      inputs: {
        symbol: 'BTCUSDT',
        price: 101400,
        sentiment: { fearGreedIndex: 22, fundingRate: -0.035, longShortRatio: 0.82, summary: 'Extreme fear, shorts building' },
        macro: { dxy: 106.1, nasdaqChange: -1.8, fedSignal: 'hawkish', summary: 'Risk-off macro, flight to USD' },
        technical: { rsi: 28, trend: 'bearish' as const, support: 98000, resistance: 103000, summary: 'Oversold but no reversal confirmation' },
      },
      action: { type: 'HOLD' as const, symbol: 'BTCUSDT' },
      outcome: { executed: false, notes: 'Correctly avoided -4.2% further drop over next 12h' },
      mcp: [
        mcpCall('macro_analyze', 'skill-hub', {}, 'Risk-off: DXY +0.8%, NDX -1.8%', 1100),
        mcpCall('sentiment_analyze', 'skill-hub', { symbol: 'BTCUSDT' }, 'F&G: 22 — extreme fear', 820),
      ],
    },
    {
      offsetHours: -6,
      thesis: 'Contrarian long — fear/sentiment divergence after capitulation',
      reasoning: 'F&G at 18 (extreme fear) but funding deeply negative (-0.04) suggesting short overcrowding. On-chain outflow resumes. Entering small contrarian long.',
      confidence: 65,
      inputs: {
        symbol: 'BTCUSDT',
        price: 99800,
        sentiment: { fearGreedIndex: 18, fundingRate: -0.042, longShortRatio: 0.71, summary: 'Capitulation signals, short squeeze setup' },
        onChain: { whaleFlow: 'outflow' as const, exchangeNetflow: -1800, summary: 'Accumulation — BTC leaving exchanges' },
        technical: { rsi: 24, trend: 'bearish' as const, support: 98000, resistance: 102000, summary: 'Capitulation wick, potential reversal zone' },
      },
      action: { type: 'BUY' as const, symbol: 'BTCUSDT', sizePct: 3, price: 99800, stopLoss: 97500, takeProfit: 104000, orderType: 'limit' },
      outcome: { pnl: -67.4, pnlPct: -0.67, balanceAfter: 10212.4, executed: true, executionDelayMs: 520, slippagePct: 0.06 },
      mcp: [
        mcpCall('sentiment_analyze', 'skill-hub', { symbol: 'BTCUSDT' }, 'F&G: 18, funding: -0.042%', 900),
        mcpCall('market_intel', 'skill-hub', { symbol: 'BTCUSDT' }, 'Exchange outflow -1800 BTC', 980),
        mcpCall('futures_place_order', 'futures', { symbol: 'BTCUSDT', side: 'buy', size: 0.03 }, 'Order filled @ 99,860', 2300),
      ],
    },
    {
      offsetHours: -2,
      thesis: 'Oversized revenge trade — agent override rejected',
      reasoning: 'LLM suggested 15% portfolio allocation to recover losses. Agent risk layer blocked: exceeds max 10% per position. Downgraded to 5% with mandatory stop.',
      confidence: 45,
      inputs: {
        symbol: 'BTCUSDT',
        price: 100200,
        sentiment: { fearGreedIndex: 25, fundingRate: -0.028, summary: 'Still fearful, slight recovery' },
        technical: { rsi: 32, trend: 'neutral' as const, summary: 'Bouncing but no trend confirmation' },
      },
      action: { type: 'BUY' as const, symbol: 'BTCUSDT', sizePct: 15, price: 100200, orderType: 'market' },
      outcome: { executed: false, notes: 'Blocked by risk layer — resized to 5% with stop at 98500' },
      mcp: [
        mcpCall('system_get_capabilities', 'meta', {}, '58 tools available', 45),
      ],
      tags: ['BLOCKED', 'RISK_OVERRIDE'],
    },
    {
      offsetHours: -1,
      thesis: 'Disciplined re-entry after risk override',
      reasoning: 'Same setup as previous but respecting 5% max with stop-loss. Thesis unchanged but position sized correctly.',
      confidence: 55,
      inputs: {
        symbol: 'BTCUSDT',
        price: 100350,
        sentiment: { fearGreedIndex: 27, fundingRate: -0.025, summary: 'Fear easing slightly' },
        technical: { rsi: 35, trend: 'neutral' as const, support: 98000, resistance: 102000, summary: 'Range-bound recovery attempt' },
      },
      action: { type: 'BUY' as const, symbol: 'BTCUSDT', sizePct: 5, price: 100350, stopLoss: 98500, takeProfit: 103500, orderType: 'limit' },
      outcome: { pnl: 12.1, pnlPct: 0.12, balanceAfter: 10224.5, executed: true, executionDelayMs: 290, slippagePct: 0.03 },
      mcp: [
        mcpCall('futures_place_order', 'futures', { symbol: 'BTCUSDT', side: 'buy', size: 0.05 }, 'Order filled @ 100,348', 1950),
      ],
    },
  ];

  const recorded = [];
  for (const d of decisions) {
    for (const call of d.mcp) {
      session.logMcpCall(call);
    }

    const decision = session.record({
      thesis: d.thesis,
      reasoning: d.reasoning,
      confidence: d.confidence,
      inputs: d.inputs,
      action: d.action,
      outcome: d.outcome,
      tags: d.tags,
      timestamp: new Date(Date.now() + d.offsetHours * 3600000).toISOString(),
    });
    recorded.push(decision);
  }

  // Second agent — simpler bot with poor decisions (contrast)
  const badBot = new AutopsySession(storage, 'naive-llm-trader', 'Naive LLM Trader', undefined, {
    portfolioValue: 5000,
    maxPositionPct: 10,
  });

  badBot.logMcpCall(mcpCall('spot_place_order', 'spot', { symbol: 'ETHUSDT', side: 'buy' }, 'Market buy ETH', 1500));
  const badDecision = badBot.record({
    thesis: 'ETH looks good',
    reasoning: 'The market seems bullish and ETH has been going up. I think we should buy.',
    confidence: 92,
    inputs: {
      symbol: 'ETHUSDT',
      price: 3850,
      sentiment: { fearGreedIndex: 82, summary: 'Extreme greed' },
    },
    action: { type: 'BUY', symbol: 'ETHUSDT', sizePct: 18, price: 3850, orderType: 'market' },
    outcome: { pnl: -142.0, pnlPct: -2.84, balanceAfter: 4858, executed: true, slippagePct: 0.15 },
    tags: ['NO_RISK_CONTROLS', 'OVERCONFIDENT'],
  });

  const exportPath = getApiLogPath();
  const allDecisions = storage.getDecisions(500);
  writeFileSync(exportPath, JSON.stringify({
    exportedAt: new Date().toISOString(),
    description: 'Verifiable WhyBot API call log — Bitget Hackathon submission artifact',
    totalDecisions: allDecisions.length,
    decisions: allDecisions,
  }, null, 2));

  const stats = storage.getStats();
  console.log('\n  Demo data seeded successfully');
  console.log('  ────────────────────────────');
  console.log(`  Decisions:  ${stats.totalDecisions}`);
  console.log(`  Agents:     ${stats.totalAgents}`);
  console.log(`  Avg Risk:   ${stats.avgRiskScore}/100`);
  console.log(`  Flagged:    ${stats.flaggedDecisions}`);
  console.log(`  Export:     ${exportPath}`);
  console.log(`\n  Run: npm run dev\n`);

  storage.close();

  if (seedOnly) {
    console.log('  (--seed-only: server not started)\n');
  }
}

runDemo().catch(console.error);
