let decisions = [];
let selectedId = null;
let lastCount = 0;
const ANALYZE_BTN_IDLE = '<span class="material-symbols-outlined text-lg">play_arrow</span> Check market';
const ANALYZE_BTN_BUSY = '<span class="material-symbols-outlined text-lg animate-spin">progress_activity</span> Checking…';

function analyzeButtons() {
  return [...document.querySelectorAll('[data-analyze-btn]')];
}

function setAnalyzeButtons(busy) {
  for (const btn of analyzeButtons()) {
    btn.disabled = busy;
    btn.innerHTML = busy ? ANALYZE_BTN_BUSY : ANALYZE_BTN_IDLE;
  }
}

let analyzeBusy = false;
let summary = { latest: [], warnings: [] };
let trends = [];
let compareCache = {};
let activeTab = 'overview';
let meta = { builtInAgent: { id: 'live-regime-router', name: 'Live Regime Router' }, agents: [] };

const $ = (id) => document.getElementById(id);

async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Error ${res.status}`);
  }
  return res.json();
}

function toast(msg, ok = true) {
  const el = $('toast');
  el.textContent = msg;
  el.className = `fixed bottom-6 right-6 z-50 toast max-w-sm px-4 py-3 rounded-xl text-sm shadow-lg border ${ok ? 'bg-dark text-white border-white/10' : 'bg-red-600 text-white'}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

function fmtTime(iso) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s ?? '';
  return d.innerHTML;
}

function coinLabel(sym) {
  return sym?.replace('USDT', '') ?? '?';
}

function actionStyle(type) {
  if (type === 'BUY') return 'text-up bg-up/10';
  if (type === 'SELL') return 'text-down bg-down/10';
  return 'text-muted bg-soft';
}

function safetyStyle(label) {
  if (label === 'Good') return 'text-up';
  if (label === 'Risky') return 'text-down';
  return 'text-primary';
}

async function downloadCardById(id) {
  try {
    let d = decisions.find(x => x.id === id);
    if (!d) d = await api(`/api/decisions/${id}`);
    await CardExport.downloadDecision(d);
    toast('PNG card saved!');
  } catch (e) {
    toast(e.message, false);
  }
}

async function downloadAllCards() {
  const items = summary.latest ?? [];
  if (!items.length) {
    toast('Run a check first', false);
    return;
  }
  const btn = $('downloadAllCardsBtn');
  btn.disabled = true;
  btn.textContent = 'Making cards…';
  try {
    const n = await CardExport.downloadAll(items, (id) => decisions.find(d => d.id === id));
    toast(`Saved ${n} PNG cards`);
  } catch (e) {
    toast(e.message, false);
  } finally {
    btn.disabled = false;
    btn.textContent = 'All PNGs';
  }
}

function filteredDecisions() {
  let list = [...decisions];
  const q = $('searchBox').value.trim().toLowerCase();
  if (q) {
    list = list.filter(d =>
      d.thesis?.toLowerCase().includes(q) ||
      d.reasoning?.toLowerCase().includes(q) ||
      d.action?.symbol?.toLowerCase().includes(q) ||
      d.action?.type?.toLowerCase().includes(q)
    );
  }
  const action = $('actionFilter').value;
  if (action) list = list.filter(d => d.action.type === action);
  if ($('problemsOnly').checked) list = list.filter(d => (d.risk?.flags ?? []).length > 0);
  const sort = $('sortFilter').value;
  if (sort === 'oldest') list.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  else if (sort === 'safest') list.sort((a, b) => b.risk.overall - a.risk.overall);
  else if (sort === 'riskiest') list.sort((a, b) => a.risk.overall - b.risk.overall);
  return list;
}

function filteredCoins() {
  const items = [...(summary.latest ?? [])].sort((a, b) => coinLabel(a.symbol).localeCompare(coinLabel(b.symbol)));
  const q = ($('coinSearch')?.value ?? '').trim().toLowerCase();
  if (!q) return items;
  return items.filter(c =>
    c.symbol?.toLowerCase().includes(q) ||
    c.action?.toLowerCase().includes(q) ||
    c.summary?.toLowerCase().includes(q)
  );
}

function renderBars(containerId, data, colors) {
  const box = $(containerId);
  const entries = Object.entries(data ?? {}).filter(([, v]) => v > 0);
  if (!entries.length) {
    box.innerHTML = '<p class="text-muted text-sm">No data yet — run Check market.</p>';
    return;
  }
  const max = Math.max(...entries.map(([, v]) => v));
  box.innerHTML = entries.map(([k, v]) => {
    const pct = Math.round((v / max) * 100);
    const color = colors[k] ?? 'bg-primary';
    return `<div class="flex items-center gap-3">
      <span class="w-12 shrink-0 font-semibold">${esc(k)}</span>
      <div class="flex-1 h-2.5 bg-white rounded-full overflow-hidden border border-hairline"><div class="h-full ${color}" style="width:${pct}%"></div></div>
      <span class="w-6 text-right font-mono text-sm">${v}</span>
    </div>`;
  }).join('');
}

function renderTrendChart() {
  const canvas = $('trendChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.parentElement.clientWidth;
  const h = 160;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  if (!trends.length) {
    ctx.fillStyle = '#7c828a';
    ctx.font = '13px Inter, sans-serif';
    ctx.fillText('Run a check to see the chart', 12, h / 2);
    return;
  }

  const pad = { l: 36, r: 12, t: 12, b: 24 };
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;

  ctx.strokeStyle = '#dee1e6';
  ctx.lineWidth = 1;
  for (let y = 0; y <= 100; y += 25) {
    const py = pad.t + plotH - (y / 100) * plotH;
    ctx.beginPath();
    ctx.moveTo(pad.l, py);
    ctx.lineTo(w - pad.r, py);
    ctx.stroke();
    ctx.fillStyle = '#7c828a';
    ctx.font = '11px JetBrains Mono, monospace';
    ctx.fillText(String(y), 4, py + 3);
  }

  const n = trends.length;
  const points = trends.map((t, i) => ({
    x: pad.l + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW),
    y: pad.t + plotH - (t.safetyScore / 100) * plotH,
    t,
  }));

  ctx.strokeStyle = '#0052ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();

  points.forEach((p) => {
    const color = p.t.action === 'BUY' ? '#05b169' : p.t.action === 'SELL' ? '#cf202f' : '#7c828a';
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
  });
}

function renderCoinList() {
  const box = $('coinList');
  const items = filteredCoins();
  if (!summary.latest?.length) {
    box.innerHTML = '<p class="p-6 text-sm text-muted text-center">No data yet.<br/>Click <strong>Check market</strong>.</p>';
    return;
  }
  if (!items.length) {
    box.innerHTML = '<p class="p-6 text-sm text-muted text-center">No coins match your filter.</p>';
    return;
  }
  box.innerHTML = items.map(c => {
    const active = c.id === selectedId;
    const hasDepth = Boolean(c.bitget || c.hasBitget);
    return `
      <button type="button" data-pick="${esc(c.id)}" class="coin-row w-full text-left px-5 py-4 hover:bg-soft transition-colors border-l-[3px] border-transparent ${active ? 'active' : ''}">
        <div class="flex items-start justify-between gap-2 mb-1.5">
          <div class="flex items-center gap-2.5 min-w-0">
            ${window.CoinIcons?.markup(c.symbol, 36) ?? ''}
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-bold text-xl">${coinLabel(c.symbol)}</span>
                ${hasDepth ? '<span class="w-2.5 h-2.5 rounded-full bg-primary shrink-0" title="Bitget depth loaded"></span>' : '<span class="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" title="Needs re-check"></span>'}
              </div>
            </div>
          </div>
          <span class="text-sm font-bold px-2.5 py-1 rounded-full shrink-0 ${actionStyle(c.action)}">${c.action}</span>
        </div>
        <div class="flex items-center justify-between gap-2 text-base">
          <span class="font-mono text-lg">$${Number(c.price).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          <span class="${safetyStyle(c.safetyLabel)} font-semibold">${c.safetyScore}/100</span>
        </div>
        <p class="text-sm text-muted mt-1.5 line-clamp-1">${esc(window.PlainEnglish?.simpleThesis(c.summary) ?? c.summary)}</p>
      </button>`;
  }).join('');

  box.querySelectorAll('[data-pick]').forEach(el => {
    el.addEventListener('click', () => selectDecision(el.dataset.pick));
  });
}

function renderWarnings() {
  const box = $('warningsBox');
  const w = summary.warnings ?? [];
  if (!w.length) {
    box.classList.add('hidden');
    return;
  }
  box.classList.remove('hidden');
  box.innerHTML = `<p class="font-semibold text-down mb-1">Heads up — ${w.length} issue${w.length > 1 ? 's' : ''}</p><ul class="list-disc pl-5 text-down/90 space-y-0.5">${w.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
}

function renderTimeline() {
  const list = filteredDecisions();
  const box = $('timeline');
  if (!list.length) {
    box.innerHTML = '<p class="p-5 text-sm text-muted text-center">No matches.</p>';
    return;
  }
  box.innerHTML = list.map(d => {
    const live = (d.tags ?? []).includes('LIVE');
    const flagged = (d.risk?.flags ?? []).length > 0;
    const active = d.id === selectedId;
    return `
      <button type="button" data-id="${d.id}" class="w-full text-left p-4 border-b border-hairline ${active ? 'bg-blue-50 border-l-4 border-l-primary' : 'hover:bg-soft'}">
        <div class="flex justify-between mb-1.5 items-center gap-2">
          <span class="flex items-center gap-2 min-w-0">
            ${window.CoinIcons?.markup(d.action.symbol, 22) ?? ''}
            <span class="text-xs font-bold ${actionStyle(d.action.type)} px-2 py-0.5 rounded">${d.action.type} ${coinLabel(d.action.symbol)}</span>
          </span>
          <span class="text-xs font-mono ${d.risk.overall >= 75 ? 'text-up' : d.risk.overall < 55 ? 'text-down' : 'text-muted'}">${d.risk.overall}/100</span>
        </div>
        <p class="text-sm line-clamp-2 mb-1">${esc(window.PlainEnglish?.simpleThesis(d.thesis) ?? d.thesis)}</p>
        <p class="text-xs text-muted">${fmtTime(d.timestamp)}${live ? ' · live' : ''}${flagged ? ' · ⚠' : ''}</p>
      </button>`;
  }).join('');
  box.querySelectorAll('[data-id]').forEach(el => el.addEventListener('click', () => selectDecision(el.dataset.id)));
}

function renderCompare(compare) {
  if (!compare?.previous) {
    return `<p class="text-base text-muted p-5 rounded-xl bg-soft border border-hairline">First check for this coin — nothing to compare yet.</p>`;
  }
  if (!compare.changes.length) {
    return `<p class="text-base text-muted p-5 rounded-xl bg-soft border border-hairline">Same as last check (${compare.previous.time}).</p>`;
  }
  return `<div class="space-y-3">
    <p class="text-sm text-muted mb-2">Compared to ${esc(compare.previous.time)} (${compare.previous.action}, ${compare.previous.safetyScore}/100)</p>
    ${compare.changes.map(c => `
      <div class="flex flex-wrap gap-x-2 gap-y-1 p-4 rounded-lg bg-soft border border-hairline text-base">
        <span class="font-medium">${esc(c.label)}:</span>
        <span class="text-muted">${esc(c.before)}</span><span>→</span><span class="font-medium">${esc(c.after)}</span>
      </div>`).join('')}
  </div>`;
}

function renderBitgetPanel(b, symbol) {
  if (!b) {
    return `
      <div class="p-5 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 text-sm">
        <p class="font-semibold text-amber-900 mb-2">Bitget depth not loaded for this check</p>
        <p class="text-amber-900/80 mb-3">Re-check to fetch order book, recent trades, open interest, and spot/futures gap.</p>
        <button type="button" data-recheck-detail="${esc(symbol)}" class="px-4 py-2 rounded-lg bg-primary text-white font-medium hover:bg-blue-700">
          Re-check ${coinLabel(symbol)}
        </button>
      </div>`;
  }
  const basis = b.basisPct != null ? `${b.basisPct >= 0 ? '+' : ''}${Number(b.basisPct).toFixed(3)}%` : '—';
  return `
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="p-5 rounded-xl bg-blue-50 border border-primary/20">
        <span class="text-sm text-muted block mb-1">Spot vs futures</span>
        <strong class="text-xl font-mono block">${basis}</strong>
        <span class="text-sm text-muted">${esc(b.basisLabel ?? '')}</span>
      </div>
      <div class="p-5 rounded-xl bg-blue-50 border border-primary/20">
        <span class="text-sm text-muted block mb-1">Open interest</span>
        <strong class="text-xl font-mono block">${b.openInterest ? Number(b.openInterest).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}</strong>
        <span class="text-sm text-muted">${esc(b.openInterestLabel ?? '')}</span>
      </div>
      <div class="p-5 rounded-xl bg-blue-50 border border-primary/20">
        <span class="text-sm text-muted block mb-1">Order book</span>
        <strong class="text-xl font-mono block">${b.orderBookBuyPct ?? '—'}% bids</strong>
        <span class="text-sm text-muted">${esc(b.orderBookLabel ?? '')}</span>
      </div>
      <div class="p-5 rounded-xl bg-blue-50 border border-primary/20">
        <span class="text-sm text-muted block mb-1">Trade flow</span>
        <strong class="text-xl font-mono block">${b.tradeFlowBuyPct ?? '—'}% buys</strong>
        <span class="text-sm text-muted">${esc(b.tradeFlowLabel ?? '')}${b.tradeFlowCount ? ` · ${b.tradeFlowCount} trades` : ''}</span>
      </div>
    </div>`;
}

function renderWhyDetail(d) {
  const pe = window.PlainEnglish;
  const why = pe.buildWhyContent(d);

  const signalsHtml = why.signals.map(s => `
    <div class="p-3 rounded-xl bg-white border border-hairline">
      <span class="text-xs text-muted block">${esc(s.label)}</span>
      <strong class="font-mono text-base block">${esc(s.value)}</strong>
      <span class="text-xs text-muted">${esc(s.hint)}</span>
    </div>`).join('');

  const bitgetBlock = why.bitgetRows.length
    ? `
        <div>
          <p class="text-sm font-semibold text-muted mb-2">Bitget market depth</p>
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
            ${why.bitgetRows.map(r => `
              <div class="p-3 rounded-xl bg-blue-50 border border-primary/15">
                <span class="text-xs text-muted block">${esc(r.label)}</span>
                <strong class="font-mono text-base block">${esc(r.value)}</strong>
                <span class="text-xs text-muted">${esc(r.hint)}</span>
              </div>`).join('')}
          </div>
        </div>`
    : '';

  return `
    <div class="p-5 rounded-xl bg-soft border border-hairline space-y-5">
      <div>
        <p class="text-lg font-semibold mb-2">${esc(why.headline)}</p>
        <p class="text-base leading-relaxed text-ink/90">${esc(why.reasoning)}</p>
      </div>

      <div>
        <p class="text-sm font-semibold text-muted mb-2">Signals the bot looked at</p>
        <div class="grid grid-cols-2 lg:grid-cols-3 gap-3">
          ${signalsHtml}
        </div>
      </div>

      ${bitgetBlock}

      ${why.bullets.length ? `
        <div>
          <p class="text-sm font-semibold text-muted mb-2">How the bot decided</p>
          <ul class="space-y-1.5 text-base list-disc pl-5 marker:text-primary">
            ${why.bullets.map(b => `<li>${esc(b)}</li>`).join('')}
          </ul>
        </div>` : ''}
    </div>`;
}

function selectedAgentId() {
  return $('agentFilter')?.value ?? '';
}

function applyAgentHeader() {
  const agentId = selectedAgentId();
  const agent = meta.agents?.find(a => a.id === agentId);
  const builtIn = meta.builtInAgent ?? { name: 'Live Regime Router' };
  const name = agent?.name ?? builtIn.name;
  $('headerAgentName').textContent = agentId ? name : `${builtIn.name} (+ others)`;
  $('headerAgentMode').textContent = agentId ? 'filtered view' : 'all agents';
  $('connectBuiltInName') && ($('connectBuiltInName').textContent = builtIn.name);
}

function populateAgentFilter() {
  const sel = $('agentFilter');
  if (!sel) return;
  const cur = sel.value;
  const agents = meta.agents ?? [];
  sel.innerHTML = '<option value="">All agents</option>' +
    agents.map(a => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('');
  sel.value = cur;
}

function renderDetail(d, compare) {
  const inp = d.inputs ?? {};
  const sent = inp.sentiment ?? {};
  const tech = inp.technical ?? {};
  const bitget = inp.bitget;
  const pe = window.PlainEnglish;
  const flags = (d.risk?.flags ?? []).map(f => pe.flagText(f));
  const actClass = d.action.type === 'BUY' ? 'border-up/40 bg-up/5' : d.action.type === 'SELL' ? 'border-down/40 bg-down/5' : 'border-hairline bg-soft';

  const tabs = [
    { id: 'overview', label: 'Summary' },
    { id: 'market', label: 'Market data' },
    { id: 'safety', label: 'Safety' },
    { id: 'proof', label: 'Proof log' },
  ];

  return `
    <div class="rounded-2xl border border-hairline bg-white overflow-hidden">
      <!-- Header -->
      <div class="p-6 lg:p-8 border-b border-hairline">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div class="flex items-center gap-3 mb-2">
              ${window.CoinIcons?.markup(d.action.symbol, 48) ?? ''}
              <h2 class="text-4xl font-bold">${coinLabel(d.action.symbol)}</h2>
              <span class="text-base font-bold px-3.5 py-1.5 rounded-full ${actionStyle(d.action.type)}">${d.action.type}</span>
            </div>
            <p class="text-base text-muted">${fmtTime(d.timestamp)} · ${esc(d.agentName ?? 'Unknown agent')} · Paper only · ${d.confidence}% confident</p>
          </div>
          <div class="flex items-center gap-4">
            <div class="text-center px-5 py-3 rounded-xl bg-soft border border-hairline">
              <p class="text-sm text-muted">Safety</p>
              <p class="text-4xl font-mono leading-none ${d.risk.overall >= 75 ? 'text-up' : d.risk.overall < 55 ? 'text-down' : 'text-primary'}">${d.risk.overall}</p>
              <p class="text-sm mt-1">${pe.safetyWord(d.risk.overall)} · ${d.risk.grade}</p>
            </div>
            <div class="flex flex-col gap-2">
              <button type="button" data-recheck-detail="${esc(d.action.symbol)}" class="text-sm px-4 py-2.5 rounded-lg border border-primary text-primary hover:bg-blue-50 font-medium">Re-check</button>
              <button type="button" id="cardPngBtn" class="text-sm px-4 py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-blue-700">PNG</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Hero action -->
      <div class="p-6 lg:p-8 border-b border-hairline ${actClass} border-l-4 ${d.action.type === 'BUY' ? 'border-l-up' : d.action.type === 'SELL' ? 'border-l-down' : 'border-l-hairline'}">
        <p class="text-sm font-semibold text-muted uppercase tracking-wide mb-3">What the bot did</p>
        <p class="text-5xl lg:text-6xl font-bold mb-3 ${d.action.type === 'BUY' ? 'text-up' : d.action.type === 'SELL' ? 'text-down' : 'text-ink'}">${d.action.type}</p>
        <p class="text-lg">${esc(pe.actionPlain(d.action.type, d.action.sizePct, d.action.stopLoss, d.action.takeProfit))}</p>
      </div>

      <!-- Tabs -->
      <div class="px-6 pt-5 pb-4 border-b border-hairline flex flex-wrap gap-2">
        ${tabs.map(t => `<button type="button" data-tab="${t.id}" class="tab-btn text-base px-5 py-2.5 rounded-lg border border-hairline hover:bg-soft ${activeTab === t.id ? 'active' : 'bg-white'}">${t.label}</button>`).join('')}
      </div>

      <div class="p-6 lg:p-8">
        <div data-panel="overview" class="${activeTab === 'overview' ? '' : 'hidden'} space-y-6">
          <div>
            <h3 class="text-lg font-semibold mb-3">Why</h3>
            ${renderWhyDetail(d)}
          </div>
          ${flags.length ? `<div class="p-4 rounded-xl bg-red-50 border border-down/20 text-base text-down"><strong>Problems:</strong> ${flags.join(', ')}</div>` : ''}
          <div>
            <h3 class="text-lg font-semibold mb-3">What changed</h3>
            ${renderCompare(compare)}
          </div>
          <details class="rounded-xl border border-hairline">
            <summary class="px-5 py-4 text-base font-medium">Full bot notes</summary>
            <p class="px-5 pb-5 text-base text-muted leading-relaxed">${esc(d.reasoning)}</p>
          </details>
          <div class="flex flex-wrap gap-3 pt-3 border-t border-hairline">
            <button type="button" id="shareBtn" class="text-sm px-4 py-2.5 rounded-lg border border-hairline hover:bg-soft">Copy link</button>
            <button type="button" id="exportBtn" class="text-sm px-4 py-2.5 rounded-lg border border-hairline hover:bg-soft">Save JSON</button>
          </div>
        </div>

        <div data-panel="market" class="${activeTab === 'market' ? '' : 'hidden'} space-y-6">
          <div>
            <h3 class="text-lg font-semibold mb-3">Price &amp; momentum</h3>
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div class="p-4 rounded-xl bg-soft border border-hairline"><span class="text-sm text-muted block mb-1">Price</span><strong class="font-mono text-lg">$${inp.price?.toLocaleString() ?? '—'}</strong></div>
              <div class="p-4 rounded-xl bg-soft border border-hairline"><span class="text-sm text-muted block mb-1">24h move</span><strong class="font-mono text-lg">${sent.summary?.match(/24h [-+0-9.]+%/)?.[0]?.replace('24h ', '') ?? '—'}</strong></div>
              <div class="p-4 rounded-xl bg-soft border border-hairline"><span class="text-sm text-muted block mb-1">Funding</span><strong class="font-mono text-lg">${sent.fundingRate != null ? (sent.fundingRate * 100).toFixed(4) + '%' : '—'}</strong></div>
              <div class="p-4 rounded-xl bg-soft border border-hairline"><span class="text-sm text-muted block mb-1">RSI</span><strong class="font-mono text-lg">${tech.rsi ?? '—'}${pe.rsiHint(tech.rsi)}</strong></div>
            </div>
          </div>
          <div>
            <h3 class="text-lg font-semibold mb-3">Bitget depth (public API)</h3>
            ${renderBitgetPanel(bitget, d.action.symbol)}
          </div>
        </div>

        <div data-panel="safety" class="${activeTab === 'safety' ? '' : 'hidden'} space-y-6">
          <p class="text-base text-muted">${esc(d.risk.summary)}</p>
          <div class="grid sm:grid-cols-2 gap-4 text-base">
            <div class="p-4 rounded-xl bg-soft border border-hairline flex justify-between"><span>Action</span><strong>${d.action.type}</strong></div>
            <div class="p-4 rounded-xl bg-soft border border-hairline flex justify-between"><span>Size</span><strong>${d.action.sizePct ? d.action.sizePct + '%' : 'None'}</strong></div>
            <div class="p-4 rounded-xl bg-soft border border-hairline flex justify-between"><span>Stop loss</span><strong class="font-mono">${d.action.stopLoss ? '$' + d.action.stopLoss.toLocaleString() : 'Not set'}</strong></div>
            <div class="p-4 rounded-xl bg-soft border border-hairline flex justify-between"><span>Result</span><strong>${d.outcome?.executed === false ? 'Paper only' : d.outcome?.pnlPct != null ? d.outcome.pnlPct + '%' : 'Waiting'}</strong></div>
          </div>
          <div class="space-y-4">
            ${(d.risk.dimensions ?? []).map(dim => `
              <div>
                <div class="flex justify-between text-sm mb-1.5"><span>${pe.dimName(dim.name)}</span><span>${dim.score}/100</span></div>
                <div class="h-2.5 bg-soft rounded-full overflow-hidden border border-hairline"><div class="h-full ${dim.score >= 70 ? 'bg-up' : dim.score >= 50 ? 'bg-primary' : 'bg-down'}" style="width:${dim.score}%"></div></div>
              </div>`).join('')}
          </div>
        </div>

        <div data-panel="proof" class="${activeTab === 'proof' ? '' : 'hidden'}">
          <p class="text-sm text-muted mb-3">Real Bitget API calls logged for this check (${(d.mcpToolCalls ?? []).length} calls).</p>
          <div class="space-y-2 max-h-80 overflow-y-auto">
            ${(d.mcpToolCalls ?? []).map(c => `
              <div class="p-3 rounded-lg bg-soft border border-hairline font-mono text-xs">
                <span class="text-primary font-semibold">${esc(c.tool)}</span>
                <span class="text-muted"> · ${esc(c.responseSummary ?? '')} · ${c.durationMs}ms</span>
              </div>`).join('') || '<p class="text-sm text-muted">None logged</p>'}
          </div>
        </div>
      </div>
    </div>`;
}

function bindDetailEvents(d, id) {
  $('shareBtn')?.addEventListener('click', () => {
    const url = location.origin + location.pathname + `#decision=${id}`;
    navigator.clipboard.writeText(url).then(() => toast('Link copied!'));
  });
  $('exportBtn')?.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `decision-${coinLabel(d.action.symbol)}-${id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('JSON saved');
  });
  $('cardPngBtn')?.addEventListener('click', () => downloadCardById(id));
  $('detailContent').querySelectorAll('[data-recheck-detail]').forEach(btn => {
    btn.addEventListener('click', () => runAnalyze([btn.dataset.recheckDetail]));
  });
  $('detailContent').querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      $('detailContent').querySelectorAll('[data-panel]').forEach(p => {
        p.classList.toggle('hidden', p.dataset.panel !== activeTab);
      });
      $('detailContent').querySelectorAll('.tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === activeTab);
      });
    });
  });
}

async function selectDecision(id) {
  selectedId = id;
  let d = decisions.find(x => x.id === id);
  if (!d) {
    try {
      d = await api(`/api/decisions/${id}`);
    } catch {
      toast('Could not load that decision', false);
      return;
    }
  }
  history.replaceState(null, '', `#decision=${id}`);
  $('emptyState').classList.add('hidden');
  $('detailContent').classList.remove('hidden');

  let compare = compareCache[id];
  if (!compare) {
    try {
      compare = await api(`/api/decisions/${id}/compare`);
      compareCache[id] = compare;
    } catch {
      compare = { previous: null, changes: [] };
    }
  }

  $('detailContent').innerHTML = renderDetail(d, compare);
  bindDetailEvents(d, id);
  renderCoinList();
  renderTimeline();
}

function populateSymbolFilter() {
  const syms = [...new Set(decisions.map(d => d.action?.symbol).filter(Boolean))];
  for (const sel of [$('symbolFilter'), $('trendSymbol')]) {
    const cur = sel.value;
    sel.innerHTML = `<option value="">All coins</option>` + syms.map(s => `<option value="${s}">${coinLabel(s)}</option>`).join('');
    sel.value = cur;
  }
}

async function loadTrends() {
  const sym = $('trendSymbol').value;
  const params = new URLSearchParams({ limit: '50' });
  if (sym) params.set('symbol', sym);
  trends = await api('/api/trends?' + params);
  renderTrendChart();
}

let bitgetPairCount = null;

async function loadBitgetPairCount() {
  try {
    const data = await api('/api/symbols/bitget');
    bitgetPairCount = data.count;
    $('statBitgetPairs').textContent = `Bitget pairs: ${data.count.toLocaleString()}`;
  } catch {
    $('statBitgetPairs').textContent = 'Bitget pairs: unavailable';
  }
}

async function refresh(silent = false) {
  try {
    if (!silent) $('refreshBtn')?.classList.add('opacity-50');
    if (bitgetPairCount == null) loadBitgetPairCount();
    meta = await api('/api/meta');
    populateAgentFilter();
    applyAgentHeader();

    const agentId = selectedAgentId();
    const summaryParams = agentId ? `?agentId=${encodeURIComponent(agentId)}` : '';
    summary = await api('/api/summary' + summaryParams);
    renderCoinList();
    renderWarnings();

    const sym = $('symbolFilter').value;
    const params = new URLSearchParams({ limit: '200' });
    if (sym) params.set('symbol', sym);
    if (agentId) params.set('agentId', agentId);
    decisions = await api('/api/decisions?' + params);
    compareCache = {};

    const stats = await api('/api/stats');
    $('statDecisions').textContent = stats.totalDecisions;
    $('statRisk').textContent = stats.avgRiskScore + '/100';
    $('statFlagged').textContent = stats.flaggedDecisions;
    $('statSymbols').textContent = summary.symbols?.length ?? '—';
    $('lastUpdated').textContent = fmtTime(new Date().toISOString());

    renderBars('actionBars', stats.actionDistribution, { BUY: 'bg-up', SELL: 'bg-down', HOLD: 'bg-muted', SKIP: 'bg-primary', CLOSE: 'bg-down', REDUCE: 'bg-down' });
    renderBars('gradeBars', stats.gradeDistribution, { A: 'bg-up', B: 'bg-primary', C: 'bg-primary', D: 'bg-down', F: 'bg-down' });

    populateSymbolFilter();
    await loadTrends();
    renderTimeline();

    if (stats.totalDecisions > lastCount && lastCount > 0) {
      toast(`New check added (${stats.totalDecisions} total)`);
    }
    lastCount = stats.totalDecisions;

    const hashId = location.hash.match(/decision=([^&]+)/)?.[1];
    if (hashId && (decisions.some(d => d.id === hashId) || summary.latest?.some(c => c.id === hashId))) {
      await selectDecision(hashId);
    } else if (selectedId && (decisions.some(d => d.id === selectedId) || summary.latest?.some(c => c.id === selectedId))) {
      await selectDecision(selectedId);
    } else if (summary.latest?.length) {
      await selectDecision(summary.latest[0].id);
    } else {
      $('emptyState').classList.remove('hidden');
      $('detailContent').classList.add('hidden');
      selectedId = null;
    }
  } catch (e) {
    if (!silent) toast(e.message, false);
  } finally {
    $('refreshBtn')?.classList.remove('opacity-50');
  }
}

async function runAnalyze(symbols) {
  if (analyzeBusy) {
    toast('Already checking — wait a moment', false);
    return;
  }
  const single = symbols?.length === 1;
  analyzeBusy = true;
  setAnalyzeButtons(true);
  try {
    const body = symbols?.length ? { symbols } : undefined;
    const res = await api('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : '{}' });
    const label = single ? coinLabel(symbols[0]) : `${res.count} coins`;
    toast(`Done! Checked ${label}`);
    await refresh(true);
  } catch (e) {
    const msg = e.message.includes('already running') || e.message.includes('429')
      ? 'Still checking — wait a moment'
      : e.message;
    toast(msg, false);
  } finally {
    analyzeBusy = false;
    setAnalyzeButtons(false);
  }
}

function navigateTimeline(dir) {
  const list = filteredDecisions();
  if (!list.length) return;
  const idx = list.findIndex(d => d.id === selectedId);
  const next = dir === 'down' ? Math.min(idx + 1, list.length - 1) : Math.max(idx - 1, 0);
  if (next !== idx && list[next]) selectDecision(list[next].id);
}

$('refreshBtn')?.addEventListener('click', () => refresh(false));
for (const btn of analyzeButtons()) {
  btn.addEventListener('click', () => runAnalyze());
}
$('downloadAllCardsBtn')?.addEventListener('click', downloadAllCards);
$('symbolFilter').addEventListener('change', () => refresh(false));
$('agentFilter')?.addEventListener('change', () => refresh(false));
$('trendSymbol').addEventListener('change', loadTrends);
$('searchBox').addEventListener('input', renderTimeline);
$('coinSearch')?.addEventListener('input', renderCoinList);
$('sortFilter').addEventListener('change', renderTimeline);
$('actionFilter').addEventListener('change', renderTimeline);
$('problemsOnly').addEventListener('change', renderTimeline);
window.addEventListener('resize', renderTrendChart);
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea, select')) return;
  if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); navigateTimeline('down'); }
  if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); navigateTimeline('up'); }
});

refresh(false);
