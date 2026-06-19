import { AutopsyStorage } from './storage.js';
import { assessFromInput } from './scorer.js';
import type {
  AgentDecision,
  McpToolCall,
  RecordDecisionInput,
} from './types.js';

export { assessFromInput, assessDecision } from './scorer.js';
export { AutopsyStorage } from './storage.js';
export type * from './types.js';

/**
 * Drop-in wrapper for any trading agent integrated with WhyBot.
 * Records the full decision cycle: inputs → reasoning → action → risk score.
 */
export class AutopsySession {
  private storage: AutopsyStorage;
  private sessionId: string;
  private mcpCallBuffer: McpToolCall[] = [];

  constructor(
    storage: AutopsyStorage,
    private agentId: string,
    private agentName: string,
    sessionId?: string,
    private options: {
      portfolioValue?: number;
      maxPositionPct?: number;
    } = {}
  ) {
    this.storage = storage;
    this.sessionId = storage.ensureSession(agentId, agentName, sessionId);
  }

  get id(): string {
    return this.sessionId;
  }

  /** Log an MCP tool call (Bitget Agent Hub integration point). */
  logMcpCall(call: Omit<McpToolCall, 'timestamp'>): void {
    this.mcpCallBuffer.push({ ...call, timestamp: new Date().toISOString() });
  }

  /** Record a complete agent decision with automatic risk scoring. */
  record(input: Omit<RecordDecisionInput, 'agentId' | 'agentName' | 'sessionId'>): AgentDecision {
    const mcpCalls = [...this.mcpCallBuffer];
    this.mcpCallBuffer = [];

    return this.storage.recordDecision({
      ...input,
      agentId: this.agentId,
      agentName: this.agentName,
      sessionId: this.sessionId,
      mcpToolCalls: mcpCalls.length > 0 ? mcpCalls : input.mcpToolCalls,
      portfolioValue: input.portfolioValue ?? this.options.portfolioValue,
      maxPositionPct: input.maxPositionPct ?? this.options.maxPositionPct,
    });
  }

  /** Preview risk score without persisting (useful during agent planning). */
  previewRisk(input: Omit<RecordDecisionInput, 'agentId' | 'agentName' | 'sessionId'>) {
    return assessFromInput({
      ...input,
      agentId: this.agentId,
      agentName: this.agentName,
      portfolioValue: input.portfolioValue ?? this.options.portfolioValue,
      maxPositionPct: input.maxPositionPct ?? this.options.maxPositionPct,
    });
  }
}
