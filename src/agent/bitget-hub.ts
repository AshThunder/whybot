import { loadConfig, buildTools, BitgetRestClient } from 'bitget-core';
import type { McpToolCall } from '../core/types.js';

export interface BitgetCallResult<T = unknown> {
  ok: boolean;
  data?: T;
  endpoint?: string;
  requestTime?: string;
  error?: string;
  durationMs: number;
}

type ToolDef = ReturnType<typeof buildTools>[number];

export class BitgetHubClient {
  private config;
  private client;
  private tools: ToolDef[];
  private paperTrading: boolean;

  constructor(options: { readOnly?: boolean; paperTrading?: boolean } = {}) {
    const readOnly = options.readOnly ?? true;
    // bitget-core: paperTrading and readOnly cannot both be true
    this.paperTrading = readOnly
      ? false
      : (options.paperTrading ?? process.env.BITGET_PAPER_TRADING === 'true');
    this.config = loadConfig({
      modules: 'spot,futures,account',
      readOnly,
      paperTrading: this.paperTrading,
    });
    this.client = new BitgetRestClient(this.config);
    this.tools = buildTools(this.config);
  }

  get hasAuth(): boolean {
    return this.config.hasAuth;
  }

  async call(module: string, toolName: string, args: Record<string, unknown> = {}): Promise<BitgetCallResult> {
    const start = Date.now();
    const tool = this.tools.find((t) => t.module === module && t.name === toolName);
    if (!tool) {
      return { ok: false, error: `Tool not found: ${module}.${toolName}`, durationMs: 0 };
    }

    try {
      const result = await tool.handler(args, { config: this.config, client: this.client }) as {
        endpoint?: string;
        requestTime?: string;
        data?: unknown;
      };
      return {
        ok: true,
        data: result.data,
        endpoint: result.endpoint,
        requestTime: result.requestTime,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message, durationMs: Date.now() - start };
    }
  }

  toMcpCall(module: string, toolName: string, args: Record<string, unknown>, result: BitgetCallResult): McpToolCall {
    return {
      tool: toolName,
      module,
      params: args,
      responseSummary: result.ok
        ? summarizeResponse(toolName, result.data)
        : `Error: ${result.error}`,
      durationMs: result.durationMs,
      timestamp: result.requestTime ?? new Date().toISOString(),
    };
  }
}

function summarizeResponse(tool: string, data: unknown): string {
  if (!data) return 'OK';
  if (Array.isArray(data)) {
    if (tool.includes('candles')) return `${data.length} candles`;
    if (tool.includes('ticker') && data[0] && typeof data[0] === 'object') {
      const t = data[0] as Record<string, string>;
      return `${t.symbol ?? 'ticker'} @ ${t.lastPr ?? t.last}`;
    }
    return `${data.length} records`;
  }
  if (typeof data === 'object' && data !== null) {
    const d = data as Record<string, unknown>;
    if (d.currentFundRate) return `funding: ${JSON.stringify(d.currentFundRate).slice(0, 80)}`;
    return JSON.stringify(data).slice(0, 120);
  }
  return String(data).slice(0, 120);
}

export function isAuthError(result: BitgetCallResult): boolean {
  return !result.ok && (result.error?.includes('credentials') ?? false);
}
