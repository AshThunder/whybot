import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { assessFromInput } from './scorer.js';
import type {
  AgentDecision,
  AgentSession,
  DashboardStats,
  RecordDecisionInput,
  TrendPoint,
} from './types.js';

export class AutopsyStorage {
  private db: Database.Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        agent_name TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        decision_count INTEGER DEFAULT 0,
        avg_risk_score REAL DEFAULT 0,
        total_pnl REAL
      );

      CREATE TABLE IF NOT EXISTS decisions (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        agent_name TEXT NOT NULL,
        session_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        thesis TEXT NOT NULL,
        reasoning TEXT NOT NULL,
        confidence REAL NOT NULL,
        inputs_json TEXT NOT NULL,
        action_json TEXT NOT NULL,
        outcome_json TEXT,
        risk_json TEXT NOT NULL,
        mcp_calls_json TEXT,
        tags_json TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );

      CREATE INDEX IF NOT EXISTS idx_decisions_timestamp ON decisions(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_decisions_agent ON decisions(agent_id);
      CREATE INDEX IF NOT EXISTS idx_decisions_session ON decisions(session_id);
    `);
  }

  ensureSession(agentId: string, agentName: string, sessionId?: string): string {
    const id = sessionId ?? uuidv4();
    const existing = this.db.prepare('SELECT id FROM sessions WHERE id = ?').get(id);
    if (!existing) {
      this.db.prepare(`
        INSERT INTO sessions (id, agent_id, agent_name, started_at)
        VALUES (?, ?, ?, ?)
      `).run(id, agentId, agentName, new Date().toISOString());
    }
    return id;
  }

  recordDecision(input: RecordDecisionInput): AgentDecision {
    const sessionId = this.ensureSession(input.agentId, input.agentName, input.sessionId);
    const risk = assessFromInput(input);
    const decision: AgentDecision = {
      id: uuidv4(),
      agentId: input.agentId,
      agentName: input.agentName,
      sessionId,
      timestamp: input.timestamp ?? new Date().toISOString(),
      thesis: input.thesis,
      reasoning: input.reasoning,
      confidence: input.confidence,
      inputs: input.inputs,
      action: input.action,
      outcome: input.outcome,
      risk,
      mcpToolCalls: input.mcpToolCalls,
      tags: input.tags,
    };

    this.db.prepare(`
      INSERT INTO decisions (
        id, agent_id, agent_name, session_id, timestamp,
        thesis, reasoning, confidence,
        inputs_json, action_json, outcome_json, risk_json,
        mcp_calls_json, tags_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      decision.id,
      decision.agentId,
      decision.agentName,
      decision.sessionId,
      decision.timestamp,
      decision.thesis,
      decision.reasoning,
      decision.confidence,
      JSON.stringify(decision.inputs),
      JSON.stringify(decision.action),
      decision.outcome ? JSON.stringify(decision.outcome) : null,
      JSON.stringify(decision.risk),
      decision.mcpToolCalls ? JSON.stringify(decision.mcpToolCalls) : null,
      decision.tags ? JSON.stringify(decision.tags) : null
    );

    this.refreshSessionStats(sessionId);
    return decision;
  }

  private refreshSessionStats(sessionId: string): void {
    const stats = this.db.prepare(`
      SELECT COUNT(*) as count, AVG(json_extract(risk_json, '$.overall')) as avgRisk,
             SUM(json_extract(outcome_json, '$.pnl')) as totalPnl
      FROM decisions WHERE session_id = ?
    `).get(sessionId) as { count: number; avgRisk: number; totalPnl: number | null };

    this.db.prepare(`
      UPDATE sessions SET decision_count = ?, avg_risk_score = ?, total_pnl = ? WHERE id = ?
    `).run(stats.count, stats.avgRisk ?? 0, stats.totalPnl, sessionId);
  }

  getDecisions(limit = 100, offset = 0, agentId?: string, symbol?: string): AgentDecision[] {
    let query = 'SELECT * FROM decisions';
    const params: unknown[] = [];
    const where: string[] = [];

    if (agentId) {
      where.push('agent_id = ?');
      params.push(agentId);
    }
    if (symbol) {
      where.push(`json_extract(action_json, '$.symbol') = ?`);
      params.push(symbol);
    }
    if (where.length) query += ` WHERE ${where.join(' AND ')}`;
    query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return (this.db.prepare(query).all(...params) as Record<string, string>[]).map(this.rowToDecision);
  }

  getSymbols(): string[] {
    const rows = this.db.prepare(`
      SELECT DISTINCT json_extract(action_json, '$.symbol') as symbol
      FROM decisions WHERE symbol IS NOT NULL ORDER BY symbol
    `).all() as { symbol: string }[];
    return rows.map((r) => r.symbol).filter(Boolean);
  }

  /** Latest decision for each trading pair (optional agent filter) */
  getLatestPerSymbol(agentId?: string): AgentDecision[] {
    const symbols = this.getSymbols();
    return symbols
      .map((sym) => {
        const rows = this.getDecisions(1, 0, agentId, sym);
        return rows[0];
      })
      .filter((d): d is AgentDecision => !!d);
  }

  getDecision(id: string): AgentDecision | null {
    const row = this.db.prepare('SELECT * FROM decisions WHERE id = ?').get(id);
    return row ? this.rowToDecision(row as Record<string, string>) : null;
  }

  getPreviousForSymbol(symbol: string, beforeTimestamp: string, excludeId?: string): AgentDecision | null {
    let query = `
      SELECT * FROM decisions
      WHERE json_extract(action_json, '$.symbol') = ?
        AND timestamp < ?
    `;
    const params: unknown[] = [symbol, beforeTimestamp];
    if (excludeId) {
      query += ' AND id != ?';
      params.push(excludeId);
    }
    query += ' ORDER BY timestamp DESC LIMIT 1';
    const row = this.db.prepare(query).get(...params);
    return row ? this.rowToDecision(row as Record<string, string>) : null;
  }

  getTrends(symbol?: string, limit = 50): TrendPoint[] {
    let query = `
      SELECT id, timestamp,
        json_extract(inputs_json, '$.price') as price,
        json_extract(action_json, '$.symbol') as symbol,
        json_extract(action_json, '$.type') as action,
        json_extract(risk_json, '$.overall') as safety
      FROM decisions
    `;
    const params: unknown[] = [];
    if (symbol) {
      query += ` WHERE json_extract(action_json, '$.symbol') = ?`;
      params.push(symbol);
    }
    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    const rows = (this.db.prepare(query).all(...params) as {
      id: string;
      timestamp: string;
      price: number | null;
      symbol: string;
      action: string;
      safety: number;
    }[]).reverse();

    return rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      symbol: r.symbol,
      price: r.price != null ? Number(r.price) : null,
      safetyScore: Number(r.safety),
      action: r.action,
    }));
  }

  getSessions(): AgentSession[] {
    const rows = this.db.prepare('SELECT * FROM sessions ORDER BY started_at DESC').all();
    return (rows as Record<string, unknown>[]).map((r) => ({
      id: r.id as string,
      agentId: r.agent_id as string,
      agentName: r.agent_name as string,
      startedAt: r.started_at as string,
      endedAt: r.ended_at as string | undefined,
      decisionCount: r.decision_count as number,
      avgRiskScore: r.avg_risk_score as number,
      totalPnl: r.total_pnl as number | undefined,
    }));
  }

  getStats(): DashboardStats {
    const total = this.db.prepare('SELECT COUNT(*) as c FROM decisions').get() as { c: number };
    const agents = this.db.prepare('SELECT COUNT(DISTINCT agent_id) as c FROM decisions').get() as { c: number };
    const sessions = this.db.prepare('SELECT COUNT(*) as c FROM sessions').get() as { c: number };
    const avgRisk = this.db.prepare(`
      SELECT AVG(json_extract(risk_json, '$.overall')) as avg FROM decisions
    `).get() as { avg: number };
    const avgConf = this.db.prepare('SELECT AVG(confidence) as avg FROM decisions').get() as { avg: number };

    const grades = this.db.prepare(`
      SELECT json_extract(risk_json, '$.grade') as grade, COUNT(*) as count
      FROM decisions GROUP BY grade
    `).all() as { grade: string; count: number }[];

    const actions = this.db.prepare(`
      SELECT json_extract(action_json, '$.type') as action, COUNT(*) as count
      FROM decisions GROUP BY action
    `).all() as { action: string; count: number }[];

    const flagged = this.db.prepare(`
      SELECT COUNT(*) as c FROM decisions
      WHERE json_array_length(json_extract(risk_json, '$.flags')) > 0
    `).get() as { c: number };

    const gradeDistribution: Record<string, number> = {};
    for (const g of grades) gradeDistribution[g.grade] = g.count;

    const actionDistribution: Record<string, number> = {};
    for (const a of actions) actionDistribution[a.action] = a.count;

    return {
      totalDecisions: total.c,
      totalAgents: agents.c,
      totalSessions: sessions.c,
      avgRiskScore: Math.round(avgRisk.avg ?? 0),
      gradeDistribution,
      actionDistribution,
      flaggedDecisions: flagged.c,
      avgConfidence: Math.round(avgConf.avg ?? 0),
    };
  }

  clear(): void {
    this.db.exec('DELETE FROM decisions; DELETE FROM sessions;');
  }

  close(): void {
    this.db.close();
  }

  private rowToDecision(row: Record<string, string>): AgentDecision {
    return {
      id: row.id,
      agentId: row.agent_id,
      agentName: row.agent_name,
      sessionId: row.session_id,
      timestamp: row.timestamp,
      thesis: row.thesis,
      reasoning: row.reasoning,
      confidence: Number(row.confidence),
      inputs: JSON.parse(row.inputs_json),
      action: JSON.parse(row.action_json),
      outcome: row.outcome_json ? JSON.parse(row.outcome_json) : undefined,
      risk: JSON.parse(row.risk_json),
      mcpToolCalls: row.mcp_calls_json ? JSON.parse(row.mcp_calls_json) : undefined,
      tags: row.tags_json ? JSON.parse(row.tags_json) : undefined,
    };
  }
}
