/** Turn bot jargon into plain English (dashboard + PNG cards) */
window.PlainEnglish = (() => {
  const THESIS = {
    'Range-bound regime — no edge for directional entry':
      'Price is moving sideways. No clear reason to buy or sell.',
    'Price is moving sideways — no clear buy or sell signal':
      'Price is moving sideways. No clear reason to buy or sell.',
    'Trending bullish regime — controlled long with defined risk':
      'Price is trending up. Bot wants a small buy with a stop-loss.',
    'Overbought or bearish regime — reduce risk, no new longs':
      'Market looks overheated or weak. Bot says stay out.',
    'Contrarian setup — negative funding + oversold RSI':
      'Price looks beaten down. Bot sees a risky bounce play.',
    'Mixed signals — insufficient conviction':
      'Signals disagree. Bot says sit this one out.',
    'Signals disagree — bot says sit this one out':
      'Signals disagree. Bot says sit this one out.',
  };

  const DIM = {
    'Position Sizing': 'Bet size',
    'Thesis Alignment': 'Words match action',
    'Risk Controls': 'Safety limits',
    'Confidence Calibration': 'Confidence vs result',
    'Signal Quality': 'Data quality',
  };

  const FLAG = {
    NO_STOP_LOSS: 'No stop-loss',
    OVERSIZED_POSITION: 'Bet too big',
    OVERCONFIDENT: 'Too confident',
    ABOVE_MAX_ALLOCATION: 'Over size limit',
    NO_RISK_CONTROLS: 'No safety limits',
    THESIS_MISMATCH: 'Words don’t match action',
    EXTREME_GREED_ENTRY: 'Bought in greed zone',
    EXTREME_FEAR_EXIT: 'Sold in fear zone',
  };

  function simpleThesis(text) {
    if (!text) return 'No summary available.';
    return THESIS[text] ?? text
      .replace(/range-bound regime/gi, 'sideways market')
      .replace(/no edge for directional entry/gi, 'no clear buy or sell signal')
      .replace(/regime/gi, 'market')
      .replace(/directional entry/gi, 'new trade')
      .replace(/insufficient conviction/gi, 'not enough confidence')
      .replace(/contrarian setup/gi, 'risky bounce idea')
      .replace(/oversold/gi, 'beaten down')
      .replace(/overbought/gi, 'overheated')
      .replace(/longs/gi, 'buys')
      .replace(/consolidation/gi, 'flat price action');
  }

  function actionHeadline(type) {
    const map = {
      BUY: 'BUY',
      SELL: 'SELL',
      HOLD: 'HOLD',
      SKIP: 'SKIP',
      CLOSE: 'CLOSE',
      REDUCE: 'REDUCE',
    };
    return map[type] ?? type;
  }

  function actionPlain(type, sizePct, stopLoss, takeProfit) {
    switch (type) {
      case 'BUY':
        return sizePct
          ? `Buy ${sizePct}% of the portfolio${stopLoss ? ` · stop-loss at $${Number(stopLoss).toLocaleString()}` : ''}${takeProfit ? ` · take-profit at $${Number(takeProfit).toLocaleString()}` : ''}`
          : 'Buy — bot wants to enter a position';
      case 'SELL':
        return 'Sell — bot wants to exit or cut the position';
      case 'HOLD':
        return 'Do nothing — wait and watch. No trade placed.';
      case 'SKIP':
        return 'Skip — bot chose not to trade at all';
      case 'CLOSE':
        return 'Close — bot wants to shut the position completely';
      case 'REDUCE':
        return 'Reduce — bot wants to make the position smaller';
      default:
        return 'No action taken';
    }
  }

  function actionVerb(type) {
    switch (type) {
      case 'BUY': return 'wanted to BUY';
      case 'SELL': return 'wanted to SELL';
      case 'HOLD': return 'chose to WAIT (hold)';
      case 'SKIP': return 'chose to SKIP trading';
      case 'CLOSE': return 'wanted to CLOSE the trade';
      case 'REDUCE': return 'wanted to REDUCE size';
      default: return 'took no action';
    }
  }

  function explainWhy(thesis, reasoning) {
    const plain = simpleThesis(thesis);
    if (plain !== thesis) return plain;
    if (reasoning) {
      // Split on sentence boundaries only — not decimal points ($0.08)
      const firstSentence = reasoning.split(/\.\s+/)[0]?.trim() ?? reasoning;
      const short = firstSentence.endsWith('.') ? firstSentence : firstSentence + '.';
      return short.length > 160 ? short.slice(0, 157) + '…' : short;
    }
    return plain;
  }

  function rsiHint(rsi) {
    const n = Number(rsi);
    if (Number.isNaN(n)) return '';
    if (n >= 70) return ' · hot (may drop)';
    if (n <= 30) return ' · cold (may bounce)';
    return ' · neutral';
  }

  function safetyWord(score) {
    if (score >= 75) return 'Good';
    if (score >= 55) return 'OK';
    return 'Risky';
  }

  function dimName(name) {
    return DIM[name] ?? name;
  }

  function flagText(f) {
    return FLAG[f] ?? f.replace(/_/g, ' ').toLowerCase();
  }

  function trendLabel(trend) {
    if (trend === 'bullish') return 'Up';
    if (trend === 'bearish') return 'Down';
    if (trend === 'neutral') return 'Flat';
    return trend ?? '—';
  }

  function trendHint(trend, rsi) {
    if (trend === 'bullish') return 'Price momentum points up';
    if (trend === 'bearish') return 'Price momentum points down';
    const n = Number(rsi);
    if (!Number.isNaN(n) && n >= 45 && n <= 55) return 'No strong direction';
    return 'Mixed or unclear trend';
  }

  function fundingHint(rate) {
    if (rate == null) return '';
    const pct = rate * 100;
    if (pct > 0.01) return 'Longs pay shorts';
    if (pct < -0.01) return 'Shorts pay longs';
    return 'Near neutral';
  }

  function change24hFromSentiment(sent) {
    return sent?.summary?.match(/24h ([-+0-9.]+%)/)?.[1] ?? null;
  }

  function decisionBullets(thesis, actionType) {
    const bullets = [];
    const t = (thesis ?? '').toLowerCase();
    if (t.includes('sideways') || t.includes('range-bound')) {
      bullets.push('24h price move was small — not enough trend to trade');
      bullets.push('Bot waits rather than guessing direction');
    } else if (t.includes('disagree') || t.includes('mixed')) {
      bullets.push('Price, momentum, and funding did not line up');
      bullets.push('Bot skipped rather than force a trade');
    } else if (t.includes('trending up') || t.includes('bullish')) {
      bullets.push('Price and momentum looked healthy');
      bullets.push('Bot sized a small buy with stop-loss limits');
    } else if (t.includes('overheated') || t.includes('bearish') || t.includes('weak')) {
      bullets.push('Market looked stretched or weak');
      bullets.push('Bot avoided opening new longs');
    } else if (t.includes('beaten down') || t.includes('contrarian')) {
      bullets.push('Price sold off — possible bounce but high risk');
      bullets.push('Bot only considered a small size with tight stop');
    }
    if (actionType === 'HOLD') bullets.push('Final call: wait and watch (no order)');
    else if (actionType === 'SKIP') bullets.push('Final call: no trade this check');
    else if (actionType === 'BUY') bullets.push('Final call: enter a small long (paper only)');
    return bullets;
  }

  return {
    simpleThesis, actionHeadline, actionPlain, actionVerb, explainWhy,
    rsiHint, safetyWord, dimName, flagText, trendLabel, trendHint,
    fundingHint, change24hFromSentiment, decisionBullets,
  };
})();
