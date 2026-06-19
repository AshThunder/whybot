import type { AgentDecision, CompareChange } from '../core/types.js';

function fmtPrice(n?: number): string {
  if (n == null) return '—';
  return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtPct(before: number, after: number): string {
  const pct = ((after - before) / before) * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function buildCompare(current: AgentDecision, previous: AgentDecision | null) {
  if (!previous) {
    return { previous: null, changes: [] as CompareChange[] };
  }

  const changes: CompareChange[] = [];

  if (current.inputs.price != null && previous.inputs.price != null) {
    changes.push({
      label: 'Price',
      before: fmtPrice(previous.inputs.price),
      after: fmtPrice(current.inputs.price),
      note: fmtPct(previous.inputs.price, current.inputs.price),
    });
  }

  if (current.action.type !== previous.action.type) {
    changes.push({
      label: 'Bot choice',
      before: previous.action.type,
      after: current.action.type,
    });
  }

  if (current.risk.overall !== previous.risk.overall) {
    const delta = current.risk.overall - previous.risk.overall;
    const sign = delta >= 0 ? '+' : '';
    changes.push({
      label: 'Safety score',
      before: `${previous.risk.overall}/100`,
      after: `${current.risk.overall}/100`,
      note: `${sign}${delta}`,
    });
  }

  const curRsi = current.inputs.technical?.rsi;
  const prevRsi = previous.inputs.technical?.rsi;
  if (curRsi != null && prevRsi != null && curRsi !== prevRsi) {
    changes.push({
      label: 'RSI',
      before: String(prevRsi),
      after: String(curRsi),
      note: curRsi > prevRsi ? 'more bullish' : 'more bearish',
    });
  }

  if (current.confidence !== previous.confidence) {
    changes.push({
      label: 'Confidence',
      before: `${previous.confidence}%`,
      after: `${current.confidence}%`,
    });
  }

  if (current.thesis !== previous.thesis) {
    changes.push({
      label: 'Summary',
      before: previous.thesis.slice(0, 60) + (previous.thesis.length > 60 ? '…' : ''),
      after: current.thesis.slice(0, 60) + (current.thesis.length > 60 ? '…' : ''),
    });
  }

  return {
    previous: {
      id: previous.id,
      time: fmtTime(previous.timestamp),
      action: previous.action.type,
      safetyScore: previous.risk.overall,
    },
    changes,
  };
}
