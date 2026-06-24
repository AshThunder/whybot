/** Draw shareable decision cards and export as PNG */
window.CardExport = (() => {
  const W = 800;
  const MIN_H = 760;
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
    blueSoft: '#eff4ff',
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

  function wrapLines(ctx, text, maxWidth) {
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
    return lines;
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    const lines = wrapLines(ctx, text, maxWidth);
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

  function subLabel(ctx, text, x, y) {
    ctx.fillStyle = COLORS.muted;
    ctx.font = '600 12px Inter, system-ui, sans-serif';
    ctx.fillText(text, x, y);
  }

  function estimateHeight(ctx, data) {
    let h = 96 + 118 + 56 + 72; // header + hero + coin row + section gap
    ctx.font = '600 16px Inter, system-ui, sans-serif';
    h += wrapLines(ctx, data.whyContent.headline, W - 88).length * 22 + 8;
    ctx.font = '400 14px Inter, system-ui, sans-serif';
    h += wrapLines(ctx, data.whyContent.reasoning, W - 88).length * 20 + 24;
    h += 28 + Math.ceil(data.whyContent.signals.length / 3) * 62 + 16;
    if (data.whyContent.bitgetRows.length) {
      h += 28 + Math.ceil(data.whyContent.bitgetRows.length / 4) * 62 + 16;
    }
    if (data.whyContent.bullets.length) {
      h += 28 + data.whyContent.bullets.length * 20 + 16;
    }
    if (data.dimensions.length) h += 18 + data.dimensions.length * 30 + 8;
    if (data.flags.length) h += 46;
    h += 72; // footer
    return Math.max(MIN_H, h);
  }

  function drawSignalGrid(ctx, items, x, y, cols, accent) {
    const gap = 8;
    const boxW = (W - 56 - gap * (cols - 1)) / cols;
    const boxH = 54;
    items.forEach((s, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const bx = x + col * (boxW + gap);
      const by = y + row * (boxH + gap);
      ctx.fillStyle = accent ? COLORS.blueSoft : COLORS.soft;
      roundRect(ctx, bx, by, boxW, boxH, 10);
      ctx.fill();
      if (accent) {
        ctx.strokeStyle = COLORS.primary + '28';
        ctx.lineWidth = 1;
        roundRect(ctx, bx + 0.5, by + 0.5, boxW - 1, boxH - 1, 10);
        ctx.stroke();
      }
      ctx.fillStyle = COLORS.muted;
      ctx.font = '500 10px Inter, system-ui, sans-serif';
      ctx.fillText(s.label, bx + 10, by + 16);
      ctx.fillStyle = COLORS.dark;
      ctx.font = '600 12px "JetBrains Mono", ui-monospace, monospace';
      const val = String(s.value);
      ctx.fillText(val.length > 14 ? val.slice(0, 12) + '…' : val, bx + 10, by + 32);
      ctx.fillStyle = COLORS.muted;
      ctx.font = '400 9px Inter, system-ui, sans-serif';
      const hint = String(s.hint ?? '');
      ctx.fillText(hint.length > 22 ? hint.slice(0, 20) + '…' : hint, bx + 10, by + 46);
    });
    const rows = Math.ceil(items.length / cols);
    return y + rows * (boxH + gap);
  }

  function fromDecision(d) {
    const score = d.risk?.overall ?? 0;
    const pe = PE();
    return {
      symbol: d.action?.symbol ?? '',
      coin: coinLabel(d.action?.symbol),
      action: d.action?.type ?? 'HOLD',
      sizePct: d.action?.sizePct,
      stopLoss: d.action?.stopLoss,
      takeProfit: d.action?.takeProfit,
      price: d.inputs?.price,
      whyContent: pe.buildWhyContent(d),
      actionPlain: pe.actionPlain(d.action?.type, d.action?.sizePct, d.action?.stopLoss, d.action?.takeProfit),
      actionHeadline: pe.actionHeadline(d.action?.type),
      safetyScore: score,
      safetyWord: pe.safetyWord(score),
      grade: d.risk?.grade ?? '—',
      flags: (d.risk?.flags ?? []).map(pe.flagText),
      timestamp: d.timestamp,
      isLive: (d.tags ?? []).includes('LIVE'),
      dimensions: (d.risk?.dimensions ?? []).map(dim => ({
        name: pe.dimName(dim.name),
        score: dim.score,
      })),
    };
  }

  function fromSummary(c, d) {
    if (d) return fromDecision(d);
    const pe = PE();
    return {
      symbol: c.symbol ?? '',
      coin: coinLabel(c.symbol),
      action: c.action,
      sizePct: null,
      stopLoss: null,
      takeProfit: null,
      price: c.price,
      whyContent: {
        headline: pe.simpleThesis(c.summary),
        reasoning: c.summary ?? '',
        signals: [],
        bitgetRows: [],
        bullets: pe.decisionBullets(c.summary, c.action),
      },
      actionPlain: pe.actionPlain(c.action),
      actionHeadline: pe.actionHeadline(c.action),
      safetyScore: c.safetyScore,
      safetyWord: c.safetyLabel ?? pe.safetyWord(c.safetyScore),
      grade: c.safetyGrade ?? '—',
      flags: [],
      timestamp: c.time,
      isLive: c.isLive,
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
    const measureCanvas = document.createElement('canvas');
    const measureCtx = measureCanvas.getContext('2d');
    const H = estimateHeight(measureCtx, data);

    const canvas = document.createElement('canvas');
    const dpr = 2;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const actColor = actionColor(data.action);
    const scColor = safetyColor(data.safetyScore);

    ctx.fillStyle = COLORS.bg;
    roundRect(ctx, 0, 0, W, H, 24);
    ctx.fill();
    ctx.strokeStyle = COLORS.hairline;
    ctx.lineWidth = 1;
    roundRect(ctx, 0.5, 0.5, W - 1, H - 1, 24);
    ctx.stroke();

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
      ctx.font = '600 11px Inter, system-ui, sans-serif';
      ctx.fillText('Live prices', W - 108, 40);
    }

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

    y += 136;
    ctx.fillStyle = COLORS.soft;
    roundRect(ctx, 28, y, W - 56, 56, 14);
    ctx.fill();

    const iconSize = 40;
    const iconX = 44;
    const iconY = y + 8;
    const iconImg = window.CoinIcons ? await window.CoinIcons.load(data.symbol) : null;
    if (iconImg) window.CoinIcons.draw(ctx, iconImg, iconX, iconY, iconSize);
    else if (window.CoinIcons) window.CoinIcons.drawFallback(ctx, data.symbol, iconX, iconY, iconSize);

    const textX = iconX + iconSize + 12;
    ctx.fillStyle = COLORS.dark;
    ctx.font = '700 22px Inter, system-ui, sans-serif';
    ctx.fillText(data.coin, textX, y + 36);
    const coinW = ctx.measureText(data.coin).width;
    ctx.font = '500 24px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillText(fmtPrice(data.price), textX + coinW + 14, y + 36);

    ctx.textAlign = 'right';
    ctx.font = '600 13px Inter, system-ui, sans-serif';
    ctx.fillStyle = scColor;
    ctx.fillText(`Safety: ${data.safetyScore}/100 · ${data.safetyWord}`, W - 44, y + 36);
    ctx.textAlign = 'left';

    y += 72;
    sectionLabel(ctx, '2 · Why', 28, y);
    y += 18;

    const whyTop = y;
    let contentY = whyTop + 16;

    ctx.font = '600 16px Inter, system-ui, sans-serif';
    const headlineLines = wrapLines(ctx, data.whyContent.headline, W - 88);
    ctx.font = '400 14px Inter, system-ui, sans-serif';
    const reasoningLines = wrapLines(ctx, data.whyContent.reasoning, W - 88);
    const signalRows = data.whyContent.signals.length ? Math.ceil(data.whyContent.signals.length / 3) : 0;
    const bitgetRows = data.whyContent.bitgetRows.length ? Math.ceil(data.whyContent.bitgetRows.length / 4) : 0;
    const bulletLines = data.whyContent.bullets.reduce((sum, b) => {
      ctx.font = '400 13px Inter, system-ui, sans-serif';
      return sum + Math.min(2, wrapLines(ctx, b, W - 104).length);
    }, 0);

    let whyH = 16;
    whyH += headlineLines.length * 22 + 8;
    whyH += reasoningLines.length * 20 + 16;
    if (signalRows) whyH += 28 + signalRows * 62 + 12;
    if (bitgetRows) whyH += 28 + bitgetRows * 62 + 12;
    if (data.whyContent.bullets.length) whyH += 28 + bulletLines * 18 + 12;
    whyH += 12;

    ctx.fillStyle = COLORS.soft;
    roundRect(ctx, 28, whyTop, W - 56, whyH, 14);
    ctx.fill();
    ctx.strokeStyle = COLORS.hairline;
    ctx.lineWidth = 1;
    roundRect(ctx, 28.5, whyTop + 0.5, W - 57, whyH - 1, 14);
    ctx.stroke();

    ctx.fillStyle = COLORS.dark;
    ctx.font = '600 16px Inter, system-ui, sans-serif';
    contentY = wrapText(ctx, data.whyContent.headline, 44, contentY, W - 88, 22) + 8;

    ctx.fillStyle = '#2d3238';
    ctx.font = '400 14px Inter, system-ui, sans-serif';
    contentY = wrapText(ctx, data.whyContent.reasoning, 44, contentY, W - 88, 20) + 16;

    if (data.whyContent.signals.length) {
      subLabel(ctx, 'Signals the bot looked at', 44, contentY);
      contentY += 14;
      contentY = drawSignalGrid(ctx, data.whyContent.signals, 44, contentY, 3, false) + 12;
    }

    if (data.whyContent.bitgetRows.length) {
      subLabel(ctx, 'Bitget market depth', 44, contentY);
      contentY += 14;
      contentY = drawSignalGrid(ctx, data.whyContent.bitgetRows, 44, contentY, 4, true) + 12;
    }

    if (data.whyContent.bullets.length) {
      subLabel(ctx, 'How the bot decided', 44, contentY);
      contentY += 16;
      ctx.font = '400 13px Inter, system-ui, sans-serif';
      for (const bullet of data.whyContent.bullets) {
        ctx.fillStyle = COLORS.primary;
        ctx.beginPath();
        ctx.arc(50, contentY - 4, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2d3238';
        contentY = wrapText(ctx, bullet, 60, contentY, W - 104, 18, 2) + 6;
      }
    }

    y = whyTop + whyH + 16;

    if (data.dimensions.length) {
      y += 8;
      sectionLabel(ctx, '3 · Was it a safe choice?', 28, y);
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

    ctx.strokeStyle = COLORS.hairline;
    ctx.beginPath();
    ctx.moveTo(28, H - 52);
    ctx.lineTo(W - 28, H - 52);
    ctx.stroke();
    ctx.fillStyle = COLORS.muted;
    ctx.font = '400 11px Inter, system-ui, sans-serif';
    ctx.fillText(fmtTime(data.timestamp), 28, H - 28);
    const foot = 'WhyBot · whybotai.vercel.app';
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
