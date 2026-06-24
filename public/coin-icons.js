/** Token icons via cryptocurrency-icons CDN (128px PNG) */
window.CoinIcons = (() => {
  const CDN = 'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@0.18.1/128/color';

  function ticker(symbol) {
    return String(symbol || '').replace(/USDT$/i, '').toLowerCase();
  }

  function url(symbol) {
    return `${CDN}/${ticker(symbol)}.png`;
  }

  function markup(symbol, size = 32, className = '') {
    const t = ticker(symbol);
    const label = t.slice(0, 3).toUpperCase();
    const src = url(symbol);
    return `<span class="coin-icon inline-flex shrink-0 items-center justify-center rounded-full border border-hairline bg-white overflow-hidden ${className}" style="width:${size}px;height:${size}px" title="${label}">
      <img src="${src}" alt="${label}" class="w-full h-full object-cover" width="${size}" height="${size}" loading="lazy" decoding="async" onerror="this.style.display='none';this.parentElement.querySelector('[data-coin-fallback]')?.classList.remove('hidden')"/>
      <span data-coin-fallback class="hidden absolute inset-0 flex items-center justify-center bg-soft text-[10px] font-bold text-muted">${label}</span>
    </span>`;
  }

  function load(symbol) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url(symbol);
    });
  }

  function draw(ctx, img, x, y, size) {
    if (!img) return;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, x, y, size, size);
    ctx.restore();
    ctx.strokeStyle = '#dee1e6';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2 - 0.5, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawFallback(ctx, symbol, x, y, size) {
    const label = ticker(symbol).slice(0, 3).toUpperCase();
    ctx.fillStyle = '#f7f7f7';
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#dee1e6';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#7c828a';
    ctx.font = `700 ${Math.max(9, Math.round(size * 0.28))}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + size / 2, y + size / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  return { ticker, url, markup, load, draw, drawFallback };
})();
