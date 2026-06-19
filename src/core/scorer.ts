import type {
  AgentAction,
  DecisionOutcome,
  MarketInputs,
  RecordDecisionInput,
  RiskAssessment,
} from './types.js';

interface ScoringContext {
  portfolioValue?: number;
  maxPositionPct?: number;
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

function gradeFromScore(score: number): RiskAssessment['grade'] {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

function scorePositionSizing(
  action: AgentAction,
  ctx: ScoringContext
): { score: number; rationale: string; flag?: string } {
  if (action.type === 'HOLD' || action.type === 'SKIP') {
    return { score: 90, rationale: 'No position change — sizing risk minimal.' };
  }

  const sizePct = action.sizePct ?? (action.size && ctx.portfolioValue
    ? (action.size * (action.price ?? 1)) / ctx.portfolioValue * 100
    : undefined);

  const maxPct = ctx.maxPositionPct ?? 10;

  if (sizePct === undefined) {
    return {
      score: 50,
      rationale: 'Position size not specified — cannot verify risk limits.',
      flag: 'MISSING_POSITION_SIZE',
    };
  }

  if (sizePct > maxPct * 2) {
    return {
      score: 15,
      rationale: `Position ${sizePct.toFixed(1)}% exceeds 2× max allocation (${maxPct}%).`,
      flag: 'OVERSIZED_POSITION',
    };
  }

  if (sizePct > maxPct) {
    return {
      score: 45,
      rationale: `Position ${sizePct.toFixed(1)}% exceeds max allocation (${maxPct}%).`,
      flag: 'ABOVE_MAX_ALLOCATION',
    };
  }

  return {
    score: 90 - sizePct,
    rationale: `Position ${sizePct.toFixed(1)}% within ${maxPct}% limit.`,
  };
}

function scoreThesisAlignment(
  thesis: string,
  reasoning: string,
  action: AgentAction,
  inputs: MarketInputs
): { score: number; rationale: string; flag?: string } {
  const text = `${thesis} ${reasoning}`.toLowerCase();
  const bullish = /\b(bull|long|buy|upside|breakout|rally)\b/.test(text);
  const bearish = /\b(bear|short|sell|downside|breakdown|dump)\b/.test(text);

  if (action.type === 'HOLD' || action.type === 'SKIP') {
    return { score: 80, rationale: 'Hold/skip action — thesis alignment N/A.' };
  }

  const isLong = action.type === 'BUY';
  const isShort = action.type === 'SELL' || action.type === 'CLOSE';

  if (isLong && bearish && !bullish) {
    return {
      score: 25,
      rationale: 'Action is BUY but reasoning reads bearish — thesis mismatch.',
      flag: 'THESIS_MISMATCH',
    };
  }

  if (isShort && bullish && !bearish) {
    return {
      score: 25,
      rationale: 'Action is SELL/CLOSE but reasoning reads bullish — thesis mismatch.',
      flag: 'THESIS_MISMATCH',
    };
  }

  const sentiment = inputs.sentiment?.fearGreedIndex;
  if (sentiment !== undefined && isLong && sentiment > 85) {
    return {
      score: 40,
      rationale: `Buying into extreme greed (F&G ${sentiment}) — contrarian risk.`,
      flag: 'EXTREME_GREED_ENTRY',
    };
  }

  if (sentiment !== undefined && isShort && sentiment < 15) {
    return {
      score: 40,
      rationale: `Selling into extreme fear (F&G ${sentiment}) — contrarian risk.`,
      flag: 'EXTREME_FEAR_EXIT',
    };
  }

  return { score: 82, rationale: 'Action aligns with stated thesis and market context.' };
}

function scoreRiskControls(action: AgentAction): { score: number; rationale: string; flag?: string } {
  if (action.type === 'HOLD' || action.type === 'SKIP') {
    return { score: 85, rationale: 'No trade executed — stop/take-profit N/A.' };
  }

  const hasSl = action.stopLoss !== undefined;
  const hasTp = action.takeProfit !== undefined;

  if (hasSl && hasTp) {
    return { score: 95, rationale: 'Both stop-loss and take-profit defined.' };
  }
  if (hasSl) {
    return { score: 75, rationale: 'Stop-loss defined; no take-profit.' };
  }
  if (hasTp) {
    return { score: 55, rationale: 'Take-profit without stop-loss — asymmetric risk.', flag: 'NO_STOP_LOSS' };
  }

  return {
    score: 30,
    rationale: 'No stop-loss or take-profit — unbounded downside.',
    flag: 'NO_RISK_CONTROLS',
  };
}

function scoreConfidenceCalibration(
  confidence: number,
  outcome?: DecisionOutcome
): { score: number; rationale: string; flag?: string } {
  if (outcome?.pnlPct === undefined) {
    if (confidence > 85) {
      return { score: 70, rationale: `High confidence (${confidence}%) — outcome pending.` };
    }
    return { score: 75, rationale: 'Outcome not yet recorded for calibration.' };
  }

  const pnl = outcome!.pnlPct!;
  const win = pnl > 0;

  if (confidence > 80 && !win) {
    return {
      score: 35,
      rationale: `High confidence (${confidence}%) but negative outcome (${pnl.toFixed(2)}%).`,
      flag: 'OVERCONFIDENT',
    };
  }

  if (confidence < 40 && win) {
    return {
      score: 60,
      rationale: `Low confidence (${confidence}%) but positive outcome — underconfident.`,
    };
  }

  if ((confidence > 60 && win) || (confidence < 50 && !win)) {
    return { score: 88, rationale: 'Confidence calibrated with outcome.' };
  }

  return { score: 72, rationale: 'Confidence within reasonable range.' };
}

function scoreSignalQuality(inputs: MarketInputs): { score: number; rationale: string } {
  let sources = 0;
  if (inputs.sentiment) sources++;
  if (inputs.macro) sources++;
  if (inputs.technical) sources++;
  if (inputs.onChain) sources++;

  if (sources >= 3) {
    return { score: 90, rationale: `Multi-signal inputs (${sources} sources) — robust context.` };
  }
  if (sources === 2) {
    return { score: 72, rationale: 'Two signal sources — moderate context depth.' };
  }
  if (sources === 1) {
    return { score: 50, rationale: 'Single signal source — thin decision context.' };
  }
  return { score: 30, rationale: 'No structured skill inputs recorded.' };
}

export function assessDecision(
  thesis: string,
  reasoning: string,
  confidence: number,
  inputs: MarketInputs,
  action: AgentAction,
  ctx: ScoringContext = {},
  outcome?: DecisionOutcome
): RiskAssessment {
  const dims = [
    { name: 'Position Sizing', weight: 0.25, ...scorePositionSizing(action, ctx) },
    { name: 'Thesis Alignment', weight: 0.25, ...scoreThesisAlignment(thesis, reasoning, action, inputs) },
    { name: 'Risk Controls', weight: 0.2, ...scoreRiskControls(action) },
    { name: 'Confidence Calibration', weight: 0.15, ...scoreConfidenceCalibration(confidence, outcome) },
    { name: 'Signal Quality', weight: 0.15, ...scoreSignalQuality(inputs) },
  ];

  const flags = dims.flatMap((d) => (d.flag ? [d.flag] : []));
  const overall = clamp(
    dims.reduce((sum, d) => sum + d.score * d.weight, 0)
  );

  const grade = gradeFromScore(overall);
  const summary =
    flags.length === 0
      ? `Decision scored ${overall.toFixed(0)}/100 (${grade}) — no critical flags.`
      : `Decision scored ${overall.toFixed(0)}/100 (${grade}) — ${flags.length} flag(s): ${flags.join(', ')}.`;

  return {
    overall: Math.round(overall),
    grade,
    dimensions: dims.map(({ name, weight, score, rationale }) => ({
      name,
      weight,
      score: Math.round(score),
      rationale,
    })),
    flags,
    summary,
  };
}

export function assessFromInput(input: RecordDecisionInput): RiskAssessment {
  return assessDecision(
    input.thesis,
    input.reasoning,
    input.confidence,
    input.inputs,
    input.action,
    {
      portfolioValue: input.portfolioValue,
      maxPositionPct: input.maxPositionPct,
    },
    input.outcome
  );
}
