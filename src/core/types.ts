export type ActionType = 'BUY' | 'SELL' | 'HOLD' | 'CLOSE' | 'REDUCE' | 'SKIP';

export interface MarketInputs {
  symbol: string;
  price?: number;
  sentiment?: {
    fearGreedIndex?: number;
    fundingRate?: number;
    longShortRatio?: number;
    summary?: string;
  };
  macro?: {
    dxy?: number;
    nasdaqChange?: number;
    fedSignal?: string;
    summary?: string;
  };
  technical?: {
    rsi?: number;
    trend?: 'bullish' | 'bearish' | 'neutral';
    support?: number;
    resistance?: number;
    summary?: string;
  };
  onChain?: {
    whaleFlow?: 'inflow' | 'outflow' | 'neutral';
    exchangeNetflow?: number;
    summary?: string;
  };
  /** Extra public Bitget market data (no API keys) */
  bitget?: {
    spotPrice?: number;
    futuresPrice?: number;
    basisPct?: number;
    basisLabel?: string;
    openInterest?: number;
    openInterestLabel?: string;
    orderBookBuyPct?: number;
    orderBookSellPct?: number;
    orderBookLabel?: string;
    tradeFlowBuyPct?: number;
    tradeFlowSellPct?: number;
    tradeFlowCount?: number;
    tradeFlowLabel?: string;
  };
  rawSkillOutputs?: Record<string, unknown>;
}

export interface AgentAction {
  type: ActionType;
  symbol: string;
  size?: number;
  sizePct?: number;
  price?: number;
  orderType?: string;
  stopLoss?: number;
  takeProfit?: number;
}

export interface DecisionOutcome {
  pnl?: number;
  pnlPct?: number;
  balanceAfter?: number;
  executed?: boolean;
  executionDelayMs?: number;
  slippagePct?: number;
  notes?: string;
}

export interface RiskDimension {
  name: string;
  score: number;
  weight: number;
  rationale: string;
}

export interface RiskAssessment {
  overall: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  dimensions: RiskDimension[];
  flags: string[];
  summary: string;
}

export interface AgentDecision {
  id: string;
  agentId: string;
  agentName: string;
  timestamp: string;
  sessionId: string;
  thesis: string;
  reasoning: string;
  confidence: number;
  inputs: MarketInputs;
  action: AgentAction;
  outcome?: DecisionOutcome;
  risk: RiskAssessment;
  mcpToolCalls?: McpToolCall[];
  tags?: string[];
}

export interface McpToolCall {
  tool: string;
  module?: string;
  params: Record<string, unknown>;
  responseSummary?: string;
  durationMs?: number;
  timestamp: string;
}

export interface AgentSession {
  id: string;
  agentId: string;
  agentName: string;
  startedAt: string;
  endedAt?: string;
  decisionCount: number;
  avgRiskScore: number;
  totalPnl?: number;
}

export interface DashboardStats {
  totalDecisions: number;
  totalAgents: number;
  totalSessions: number;
  avgRiskScore: number;
  gradeDistribution: Record<string, number>;
  actionDistribution: Record<string, number>;
  flaggedDecisions: number;
  avgConfidence: number;
}

export interface TrendPoint {
  id: string;
  timestamp: string;
  symbol: string;
  price: number | null;
  safetyScore: number;
  action: string;
}

export interface CompareChange {
  label: string;
  before: string;
  after: string;
  note?: string;
}

export interface RecordDecisionInput {
  agentId: string;
  agentName: string;
  sessionId?: string;
  thesis: string;
  reasoning: string;
  confidence: number;
  inputs: MarketInputs;
  action: AgentAction;
  outcome?: DecisionOutcome;
  mcpToolCalls?: McpToolCall[];
  portfolioValue?: number;
  maxPositionPct?: number;
  tags?: string[];
  timestamp?: string;
}
