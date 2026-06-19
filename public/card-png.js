/** Draw shareable decision cards and export as PNG */
window.CardExport = (() => {
  const W = 800;
  const H = 760;
  const PE = () => window.PlainEnglish;
  const COLORS = {
    bg: '#ffffff',
    dark: '#0a0b0d',
    primary: '#0052ff',
    muted: '#7c828a',
    hairline: '#dee1e6',
    soft: '#f7f7f7',
    up: '#05b169',
    down: '#cf202f',
    white: '#ffffff',
  };

  function coinLabel(sym) {
    return sym?.replace('USDT', '') ?? '?';
  }

  function safetyColor(score) {
    if (score >= 75) return COLORS.up;
    if (score >= 55) return COLORS.primary;
    return COLORS.down;
  }

  function actionColor(type) {
    if (type === 'BUY') return COLORS.up;
    if (type === 'SELL' || type === 'CLOSE') return COLORS.down;
    if (type === 'SKIP') return COLORS.primary;
    return COLORS.muted;
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    const words = String(text ?? '').split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = test;
    }
    if (line) lines.push(line);
    const shown = maxLines ? lines.slice(0, maxLines) : lines;
    if (maxLines && lines.length > maxLines) {
      shown[maxLines - 1] = shown[maxLines - 1].replace(/\s+\S+$/, '') + '…';
    }
    shown.forEach((ln, i) => ctx.fillText(ln, x, y + i * lineHeight));
    return y + shown.length * lineHeight;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function sectionLabel(ctx, text, x, y) {
    ctx.fillStyle = COLORS.muted;
    ctx.font = '600 11px Inter, system-ui, sans-serif';
    ctx.fillText(text.toUpperCase(), x, y);
  }

  function fromDecision(d) {
    const inp = d.inputs ?? {};
    const sent = inp.sentiment ?? {};
    const tech = inp.technical ?? {};
    const bg = inp.bitget ?? {};
    const score = d.risk?.overall ?? 0;
    const pe = PE();
    const change = sent.summary?.match(/24h [-+0-9.]+%/)?.[0]?.replace('24h ', '') ?? '—';
    return {
      coin: coinLabel(d.action?.symbol),
      action: d.action?.type ?? 'HOLD',
      sizePct: d.action?.sizePct,
      stopLoss: d.action?.stopLoss,
      takeProfit: d.action?.takeProfit,
      price: inp.price,
      why: pe.explainWhy(d.thesis, d.reasoning),
      actionPlain: pe.actionPlain(d.action?.type, d.action?.sizePct, d.action?.stopLoss, d.action?.takeProfit),
      actionHeadline: pe.actionHeadline(d.action?.type),
      safetyScore: score,
      safetyWord: pe.safetyWord(score),
      grade: d.risk?.grade ?? '—',
      confidence: d.confidence,
      change24h: change,
      funding: sent.fundingRate != null ? `${(sent.fundingRate * 100).toFixed(4)}%` : '—',
      rsi: tech.rsi != null ? String(tech.rsi) : '—',
      rsiHint: pe.rsiHint(tech.rsi),
      basis: bg.basisPct != null ? `${bg.basisPct >= 0 ? '+' : ''}${Number(bg.basisPct).toFixed(3)}%` : '—',
      openInterest: bg.openInterestLabel ?? '—',
      orderBook: bg.orderBookBuyPct != null ? `${bg.orderBookBuyPct}% bids` : '—',
      tradeFlow: bg.tradeFlowBuyPct != null ? `${bg.tradeFlowBuyPct}% buys` : '—',
      flags: (d.risk?.flags ?? []).slice(0, 3).map(pe.flagText),
      timestamp: d.timestamp,
      isLive: (d.tags ?? []).includes('LIVE'),
      paperOnly: d.outcome?.executed !== true,
      dimensions: (d.risk?.dimensions ?? []).slice(0, 3).map(d => ({
        name: pe.dimName(d.name),
        score: d.score,
      })),
    };
  }

  function fromSummary(c, d) {
    if (d) return fromDecision(d);
    const pe = PE();
    return {
      coin: coinLabel(c.symbol),
      action: c.action,
      sizePct: null,
      stopLoss: null,
      takeProfit: null,
      price: c.price,
      why: pe.simpleThesis(c.summary),
      actionPlain: pe.actionPlain(c.action),
      actionHeadline: pe.actionHeadline(c.action),
      safetyScore: c.safetyScore,
      safetyWord: c.safetyLabel ?? pe.safetyWord(c.safetyScore),
      grade: c.safetyGrade ?? '—',
      confidence: null,
      change24h: '—',
      funding: '—',
      rsi: '—',
      rsiHint: '',
      basis: '—',
      openInterest: '—',
      orderBook: '—',
      tradeFlow: '—',
      flags: [],
      timestamp: c.time,
      isLive: c.isLive,
      paperOnly: true,
      dimensions: [],
    };
  }

  function fmtTime(iso) {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  function fmtPrice(n) {
    if (n == null) return '—';
    return '$' + Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  async function drawCard(data) {
    await document.fonts.ready;
    const canvas = document.createElement('canvas');
    const dpr = 2;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const actColor = actionColor(data.action);
    const scColor = safetyColor(data.safetyScore);

    // Frame
    ctx.fillStyle = COLORS.bg;
    roundRect(ctx, 0, 0, W, H, 24);
    ctx.fill();
    ctx.strokeStyle = COLORS.hairline;
    ctx.lineWidth = 1;
    roundRect(ctx, 0.5, 0.5, W - 1, H - 1, 24);
    ctx.stroke();

    // Header
    ctx.fillStyle = COLORS.dark;
    roundRect(ctx, 0, 0, W, 72, 24);
    ctx.fill();
    ctx.fillRect(0, 48, W, 24);
    ctx.fillStyle = COLORS.white;
    ctx.font = '600 20px Inter, system-ui, sans-serif';
    ctx.fillText('WhyBot', 28, 36);
    ctx.font = '400 12px Inter, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('Bot decision report', 28, 54);
    if (data.isLive) {
      ctx.fillStyle = 'rgba(5,177,105,0.25)';
      roundRect(ctx, W - 132, 22, 104, 28, 14);
      ctx.fill();
      ctx.fillStyle = COLORS.up;
      ctx.beginPath();
      ctx.arc(W - 118, 36, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.up;
      ctx.font = '600 11px Inter, system-ui, sans-serif';
      ctx.fillText('Live prices', W - 108, 40);
    }

    // ── 1. WHAT THE BOT DID (hero) ──
    let y = 96;
    sectionLabel(ctx, '1 · What the bot did', 28, y);
    y += 14;

    ctx.fillStyle = actColor + '12';
    ctx.strokeStyle = actColor + '55';
    ctx.lineWidth = 2;
    roundRect(ctx, 28, y, W - 56, 118, 16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = actColor;
    ctx.font = '800 48px Inter, system-ui, sans-serif';
    ctx.fillText(data.actionHeadline, 48, y + 52);

    ctx.fillStyle = COLORS.dark;
    ctx.font = '600 15px Inter, system-ui, sans-serif';
    wrapText(ctx, data.actionPlain, 48, y + 72, W - 96, 20, 2);

    ctx.fillStyle = COLORS.muted;
    ctx.font = '500 11px Inter, system-ui, sans-serif';
    ctx.fillText('Paper only — no real money moved', 48, y + 112);

    // Coin + price + safety (row under hero)
    y += 136;
    ctx.fillStyle = COLORS.soft;
    roundRect(ctx, 28, y, W - 56, 56, 14);
    ctx.fill();

    ctx.fillStyle = COLORS.dark;
    ctx.font = '700 22px Inter, system-ui, sans-serif';
    ctx.fillText(data.coin, 44, y + 36);
    ctx.font = '500 24px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillText(fmtPrice(data.price), 120, y + 36);

    ctx.textAlign = 'right';
    ctx.font = '600 13px Inter, system-ui, sans-serif';
    ctx.fillStyle = scColor;
    ctx.fillText(`Safety: ${data.safetyScore}/100 · ${data.safetyWord}`, W - 44, y + 36);
    ctx.textAlign = 'left';

    // ── 2. WHY ──
    y += 72;
    sectionLabel(ctx, '2 · Why', 28, y);
    y += 18;
    ctx.fillStyle = '#2d3238';
    ctx.font = '400 15px Inter, system-ui, sans-serif';
    y = wrapText(ctx, data.why, 28, y, W - 56, 22, 3) + 8;

    // ── 3. MARKET SNAPSHOT ──
    sectionLabel(ctx, '3 · Market snapshot', 28, y);
    y += 16;
    const stats = [
      { label: '24h price move', value: data.change24h },
      { label: 'Market fee', value: data.funding },
      { label: 'Momentum score', value: data.rsi + data.rsiHint },
      { label: 'How sure', value: data.confidence != null ? `${data.confidence}%` : '—' },
    ];
    const boxW = (W - 56 - 18) / 4;
    stats.forEach((s, i) => {
      const x = 28 + i * (boxW + 6);
      ctx.fillStyle = COLORS.soft;
      roundRect(ctx, x, y, boxW, 54, 10);
      ctx.fill();
      ctx.fillStyle = COLORS.muted;
      ctx.font = '500 10px Inter, system-ui, sans-serif';
      ctx.fillText(s.label, x + 10, y + 18);
      ctx.fillStyle = COLORS.dark;
      ctx.font = '600 13px "JetBrains Mono", ui-monospace, monospace';
      const val = String(s.value);
      const trimmed = val.length > 14 ? val.slice(0, 12) + '…' : val;
      ctx.fillText(trimmed, x + 10, y + 38);
    });
    y += 68;

    const hasBitget = data.basis !== '—' || data.orderBook !== '—';
    if (hasBitget) {
      sectionLabel(ctx, 'Bitget market depth', 28, y);
      y += 16;
      const bgStats = [
        { label: 'Spot/futures gap', value: data.basis },
        { label: 'Open interest', value: data.openInterest },
        { label: 'Order book', value: data.orderBook },
        { label: 'Trade flow', value: data.tradeFlow },
      ];
      bgStats.forEach((s, i) => {
        const x = 28 + i * (boxW + 6);
        ctx.fillStyle = COLORS.soft;
        roundRect(ctx, x, y, boxW, 54, 10);
        ctx.fill();
        ctx.fillStyle = COLORS.muted;
        ctx.font = '500 10px Inter, system-ui, sans-serif';
        ctx.fillText(s.label, x + 10, y + 18);
        ctx.fillStyle = COLORS.dark;
        ctx.font = '600 12px "JetBrains Mono", ui-monospace, monospace';
        const val = String(s.value);
        const trimmed = val.length > 16 ? val.slice(0, 14) + '…' : val;
        ctx.fillText(trimmed, x + 10, y + 38);
      });
      y += 68;
    }

    // ── 4. WAS IT SAFE? ──
    if (data.dimensions.length) {
      sectionLabel(ctx, '4 · Was it a safe choice?', 28, y);
      y += 18;
      data.dimensions.forEach((dim) => {
        ctx.fillStyle = COLORS.muted;
        ctx.font = '500 11px Inter, system-ui, sans-serif';
        ctx.fillText(dim.name, 28, y + 10);
        ctx.fillText(`${dim.score}/100`, W - 44, y + 10);
        ctx.fillStyle = COLORS.hairline;
        roundRect(ctx, 28, y + 16, W - 56, 6, 3);
        ctx.fill();
        const bc = dim.score >= 70 ? COLORS.up : dim.score >= 50 ? COLORS.primary : COLORS.down;
        ctx.fillStyle = bc;
        roundRect(ctx, 28, y + 16, (W - 56) * (dim.score / 100), 6, 3);
        ctx.fill();
        y += 30;
      });
    }

    // Warnings
    if (data.flags.length) {
      y += 4;
      ctx.fillStyle = '#fef2f2';
      roundRect(ctx, 28, y, W - 56, 34, 10);
      ctx.fill();
      ctx.fillStyle = COLORS.down;
      ctx.font = '600 12px Inter, system-ui, sans-serif';
      ctx.fillText('Problems: ' + data.flags.join(' · '), 40, y + 22);
      y += 42;
    }

    // Footer
    ctx.strokeStyle = COLORS.hairline;
    ctx.beginPath();
    ctx.moveTo(28, H - 52);
    ctx.lineTo(W - 28, H - 52);
    ctx.stroke();
    ctx.fillStyle = COLORS.muted;
    ctx.font = '400 11px Inter, system-ui, sans-serif';
    ctx.fillText(fmtTime(data.timestamp), 28, H - 28);
    const foot = 'WhyBot · Bitget AI Hackathon';
    ctx.fillStyle = COLORS.primary;
    ctx.fillText(foot, W / 2 - ctx.measureText(foot).width / 2, H - 28);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText('Not financial advice', W - 28 - ctx.measureText('Not financial advice').width, H - 28);

    return canvas;
  }

  function downloadCanvas(canvas, filename) {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) return resolve(false);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
        resolve(true);
      }, 'image/png');
    });
  }

  async function downloadDecision(decision) {
    const data = fromDecision(decision);
    const canvas = await drawCard(data);
    return downloadCanvas(canvas, `whybot-${data.coin}-${data.action.toLowerCase()}-${Date.now()}.png`);
  }

  async function downloadSummaryItem(item, decision) {
    const data = fromSummary(item, decision);
    const canvas = await drawCard(data);
    return downloadCanvas(canvas, `whybot-${data.coin}-${data.action.toLowerCase()}-latest.png`);
  }

  async function downloadAll(latestItems, findDecision) {
    let n = 0;
    for (const item of latestItems) {
      await downloadSummaryItem(item, findDecision?.(item.id));
      n++;
      await new Promise((r) => setTimeout(r, 350));
    }
    return n;
  }

  return { downloadDecision, downloadSummaryItem, downloadAll, fromDecision };
})();
