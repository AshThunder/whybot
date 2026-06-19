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

type MarketDirection = 'bullish' | 'bearish' | 'neutral' | 'mixed';

interface MarketClarity {
  direction: MarketDirection;
  /** 0–100 — how strong / one-sided the signal is */
  strength: number;
}

function hasBitgetSignals(inputs: MarketInputs): boolean {
  const b = inputs.bitget;
  if (!b) return false;
  return (
    b.orderBookBuyPct !== undefined ||
    b.tradeFlowCount !== undefined ||
    b.openInterest !== undefined ||
    b.basisPct !== undefined
  );
}

/** Infer directional bias and strength from recorded market inputs. */
function marketClarity(inputs: MarketInputs): MarketClarity {
  const rsi = inputs.technical?.rsi ?? 50;
  const trend = inputs.technical?.trend ?? 'neutral';
  const funding = inputs.sentiment?.fundingRate ?? 0;
  const obBuy = inputs.bitget?.orderBookBuyPct ?? 50;
  const obSell = inputs.bitget?.orderBookSellPct ?? 50;
  const flowBuy = inputs.bitget?.tradeFlowBuyPct ?? 50;
  const flowSell = inputs.bitget?.tradeFlowSellPct ?? 50;

  let bullish = 0;
  let bearish = 0;

  if (trend === 'bullish') bullish++;
  if (trend === 'bearish') bearish++;
  if (trend === 'neutral') {
    /* flat trend — no vote */
  }
  if (rsi >= 58 && rsi <= 72) bullish++;
  if (rsi <= 42) bearish++;
  if (rsi > 75) bearish++;
  if (funding > 0.0003) bullish++;
  if (funding < -0.0002) bearish++;
  if (obBuy >= 58 && flowBuy >= 58) bullish++;
  if (obSell >= 58 && flowSell >= 58) bearish++;

  const total = bullish + bearish;
  if (total === 0) {
    return { direction: 'neutral', strength: 25 };
  }

  const spread = Math.abs(bullish - bearish);
  if (bullish > 0 && bearish > 0 && spread <= 1) {
    return { direction: 'mixed', strength: clamp(35 + total * 8, 0, 70) };
  }

  const direction: MarketDirection = bullish > bearish ? 'bullish' : 'bearish';
  return { direction, strength: clamp(45 + spread * 14 + total * 4, 0, 95) };
}

function reasoningMatchesPassiveAction(thesis: string, reasoning: string): boolean {
  return /\b(wait|skip|sideways|flat|unclear|no edge|sit out|overheated|weak|neutral|nothing lines up|beaten down|risky)\b/i.test(
    `${thesis} ${reasoning}`
  );
}

function scorePositionSizing(
  action: AgentAction,
  ctx: ScoringContext,
  confidence: number,
  inputs: MarketInputs
): { score: number; rationale: string; flag?: string } {
  if (action.type === 'HOLD' || action.type === 'SKIP') {
    const clarity = marketClarity(inputs);
    if (action.type === 'SKIP' && clarity.direction === 'mixed' && confidence <= 70) {
      return {
        score: 94,
        rationale: 'Zero exposure is appropriate while signals conflict.',
      };
    }
    if (
      action.type === 'HOLD' &&
      clarity.direction === 'bullish' &&
      clarity.strength >= 72 &&
      confidence >= 80
    ) {
      return {
        score: 84,
        rationale: 'No size taken despite a clear setup — conservative but safe.',
      };
    }
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
  const bullishText = /\b(bull|long|buy|upside|breakout|rally)\b/.test(text);
  const bearishText = /\b(bear|short|sell|downside|breakdown|dump|overheated|weak)\b/.test(text);

  if (action.type === 'HOLD' || action.type === 'SKIP') {
    const clarity = marketClarity(inputs);
    const rsi = inputs.technical?.rsi ?? 50;
    let score: number;
    let rationale: string;
    let flag: string | undefined;

    if (clarity.direction === 'mixed' || clarity.direction === 'neutral') {
      score = action.type === 'SKIP' ? 86 : 78;
      rationale =
        clarity.direction === 'mixed'
          ? 'Waiting out conflicting signals matches the thesis.'
          : 'Flat market — patience aligns with sideways conditions.';
    } else if (clarity.direction === 'bearish' || rsi > 75) {
      score = 95;
      rationale = 'Staying out of a weak or overheated market fits the thesis.';
    } else if (clarity.direction === 'bullish' && clarity.strength >= 68) {
      score = action.type === 'SKIP' ? 64 : 70;
      rationale = 'Clear bullish setup present — passive stance may miss the edge.';
      flag = 'PASSED_CLEAR_SETUP';
    } else {
      score = 80;
      rationale = 'Hold/skip is reasonable but signals are only moderately clear.';
    }

    if (reasoningMatchesPassiveAction(thesis, reasoning)) score += 4;
    if (bullishText && !bearishText && clarity.direction !== 'bullish') score += 3;
    if (bullishText && clarity.direction === 'bullish' && clarity.strength >= 68) score -= 6;

    return {
      score: clamp(score),
      rationale,
      flag,
    };
  }

  const isLong = action.type === 'BUY';
  const isShort = action.type === 'SELL' || action.type === 'CLOSE';

  if (isLong && bearishText && !bullishText) {
    return {
      score: 25,
      rationale: 'Action is BUY but reasoning reads bearish — thesis mismatch.',
      flag: 'THESIS_MISMATCH',
    };
  }

  if (isShort && bullishText && !bearishText) {
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

function scoreRiskControls(
  action: AgentAction,
  inputs: MarketInputs
): { score: number; rationale: string; flag?: string } {
  if (action.type === 'HOLD' || action.type === 'SKIP') {
    const clarity = marketClarity(inputs);
    const rsi = inputs.technical?.rsi ?? 50;

    if (action.type === 'SKIP' && clarity.direction === 'mixed') {
      return {
        score: 89,
        rationale: 'Skipping an ambiguous setup preserves capital.',
      };
    }
    if (rsi > 75 || clarity.direction === 'bearish') {
      return {
        score: 94,
        rationale: 'Flat stance avoids downside in weak or overheated conditions.',
      };
    }
    if (clarity.direction === 'bullish' && clarity.strength >= 68) {
      return {
        score: 74,
        rationale: 'Strong setup available — staying flat forgoes defined entry risk/reward.',
      };
    }
    if (clarity.direction === 'neutral') {
      return { score: 83, rationale: 'No trade in a quiet market — risk contained.' };
    }
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
  action: AgentAction,
  inputs: MarketInputs,
  outcome?: DecisionOutcome
): { score: number; rationale: string; flag?: string } {
  if (outcome?.pnlPct === undefined) {
    const clarity = marketClarity(inputs);
    const ambiguous = clarity.direction === 'mixed' || clarity.direction === 'neutral';
    const passive = action.type === 'HOLD' || action.type === 'SKIP';

    if (passive && ambiguous) {
      if (confidence >= 62 && confidence <= 82) {
        return {
          score: action.type === 'SKIP' ? 81 : 76,
          rationale: `Confidence (${confidence}%) fits an unclear setup.`,
        };
      }
      if (confidence > 85) {
        return {
          score: 56,
          rationale: `Overconfident (${confidence}%) for a muddled market.`,
          flag: 'OVERCONFIDENT_PASSIVE',
        };
      }
      if (confidence < 55) {
        return {
          score: action.type === 'SKIP' ? 80 : 74,
          rationale: `Low confidence (${confidence}%) suits waiting for clarity.`,
        };
      }
    }

    if (passive && clarity.direction === 'bearish') {
      const score = clamp(76 + (confidence - 60) * 0.45);
      return {
        score,
        rationale: `Confidence (${confidence}%) vs defensive stance in weak conditions.`,
      };
    }

    if (passive && clarity.direction === 'bullish' && clarity.strength >= 68) {
      const score = clamp(88 - Math.max(0, confidence - 55) * 0.4);
      return {
        score,
        rationale:
          confidence >= 75
            ? `High confidence (${confidence}%) but no trade despite bullish signals.`
            : `Moderate confidence (${confidence}%) while passing a setup.`,
      };
    }

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
  if (hasBitgetSignals(inputs)) sources++;

  if (sources >= 4) {
    return { score: 94, rationale: `Rich multi-source inputs (${sources} sources).` };
  }
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
    { name: 'Position Sizing', weight: 0.25, ...scorePositionSizing(action, ctx, confidence, inputs) },
    { name: 'Thesis Alignment', weight: 0.25, ...scoreThesisAlignment(thesis, reasoning, action, inputs) },
    { name: 'Risk Controls', weight: 0.2, ...scoreRiskControls(action, inputs) },
    {
      name: 'Confidence Calibration',
      weight: 0.15,
      ...scoreConfidenceCalibration(confidence, action, inputs, outcome),
    },
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
