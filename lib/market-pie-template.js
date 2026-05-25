// Slide 6 of the "PartySlate Proposal Sales" deck.
// One metro: title + donut chart of event mix on the left, city/traffic/legend
// on the right. Source data is one entry from public/markets.json.

const COLORS = {
  bg: '#FFFFFF',
  title: '#000000',
  body: '#333333',
  muted: '#8A8A8A',
  section: '#8A8A8A',
  divider: '#D6D6D6',
}

// Same event-type → color mapping as market-template.js (existing markets slide)
// so the brand reads consistently across both templates.
const EVENT_COLORS = {
  Weddings: '#B33A5C',
  Birthdays: '#B89968',
  Celebrations: '#555555',
  'Corporate Events': '#000000',
  Fundraisers: '#888888',
  Mitzvahs: '#BBBBBB',
}
const FALLBACK_COLORS = ['#7A4A4A', '#6B8E8E', '#8B5A8B', '#C8A55A']

export function renderMarketPieHtml({ market }) {
  if (!market) {
    return renderError('No metro selected.')
  }

  // Order segments by event-color map first (stable), then by any extras.
  const entries = Object.entries(market.event_breakdown || {})
    .filter(([, pct]) => typeof pct === 'number' && pct > 0)
  // Use a stable ordering — match EVENT_COLORS key order; tack extras on the end.
  const orderIdx = (cat) => {
    const keys = Object.keys(EVENT_COLORS)
    const i = keys.indexOf(cat)
    return i === -1 ? 999 : i
  }
  entries.sort((a, b) => orderIdx(a[0]) - orderIdx(b[0]))

  let fallback = 0
  const segments = entries.map(([cat, pct]) => ({
    cat,
    pct,
    color: EVENT_COLORS[cat] || FALLBACK_COLORS[fallback++ % FALLBACK_COLORS.length],
  }))

  const donutSvg = buildDonutSvg(segments)
  const legendHtml = segments
    .map(s => `
      <div class="legend-row">
        <span class="legend-swatch" style="background:${s.color}"></span>
        <span class="legend-name">${esc(s.cat)}</span>
        <span class="legend-pct">${Math.round(s.pct * 100)}%</span>
      </div>`)
    .join('')

  const traffic = (market.traffic_level || 'MODERATE').toUpperCase()

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Market trends — ${esc(market.metro)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@200;300;400;500&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: ${COLORS.bg}; }
  body {
    width: 13.333in;
    height: 7.5in;
    font-family: 'Outfit', system-ui, sans-serif;
    font-weight: 300;
    color: ${COLORS.body};
    padding: 0.42in 0.55in 0.36in;
    display: grid;
    grid-template-rows: auto auto 1fr;
    gap: 0.16in;
    overflow: hidden;
  }
  .head .title {
    font-weight: 400;
    font-size: 32pt;
    color: ${COLORS.title};
    line-height: 1.05;
    letter-spacing: -0.01em;
  }
  .head .sub {
    margin-top: 0.06in;
    font-size: 13pt;
    color: ${COLORS.muted};
    font-weight: 300;
  }
  .rule {
    height: 1px;
    background: ${COLORS.divider};
    width: 100%;
  }
  .body {
    display: grid;
    grid-template-columns: 1.25fr 1fr;
    gap: 0.4in;
    align-items: center;
    min-height: 0;
  }
  .donut-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .donut-wrap svg {
    width: 4.6in;
    height: 4.6in;
    display: block;
  }
  .meta {
    display: flex;
    flex-direction: column;
    gap: 0.22in;
  }
  .label {
    font-size: 10pt;
    color: ${COLORS.section};
    text-transform: uppercase;
    letter-spacing: 0.22em;
    font-weight: 400;
  }
  .city-name {
    font-size: 28pt;
    font-weight: 400;
    color: ${COLORS.title};
    line-height: 1.05;
    margin-top: 0.05in;
    letter-spacing: -0.01em;
  }
  .traffic-pill {
    display: inline-block;
    margin-top: 0.06in;
    background: #000;
    color: #fff;
    font-weight: 500;
    font-size: 11pt;
    letter-spacing: 0.22em;
    padding: 9pt 28pt;
    line-height: 1;
  }
  .traffic-pill.moderate { background: #555; }
  .traffic-pill.low      { background: #BBB; color: #333; }

  .legend {
    display: grid;
    grid-template-columns: auto 1fr auto;
    column-gap: 0.16in;
    row-gap: 0.08in;
    align-items: center;
    margin-top: 0.04in;
  }
  .legend-row {
    display: contents;
  }
  .legend-swatch {
    width: 0.18in;
    height: 0.18in;
    border-radius: 2px;
  }
  .legend-name {
    font-size: 12pt;
    color: ${COLORS.title};
    font-weight: 300;
  }
  .legend-pct {
    font-size: 12pt;
    color: ${COLORS.body};
    font-weight: 400;
    text-align: right;
  }

  .footer-mark {
    position: absolute;
    left: 0.55in;
    bottom: 0.32in;
    font-size: 11pt;
    letter-spacing: 0.02em;
  }
  .footer-mark .party { font-family: 'Outfit', system-ui, sans-serif; font-weight: 700; }
  .footer-mark .slate { font-family: Georgia, serif; font-style: italic; font-weight: 400; }
</style>
</head>
<body>
  <div class="head">
    <div class="title">Market trends: ${esc(market.metro)}</div>
    <div class="sub">Booking mix and demand</div>
  </div>
  <div class="rule"></div>
  <div class="body">
    <div class="donut-wrap">${donutSvg}</div>
    <div class="meta">
      <div>
        <div class="label">City</div>
        <div class="city-name">${esc(market.metro)}</div>
      </div>
      <div>
        <div class="label">Traffic</div>
        <div class="traffic-pill ${traffic.toLowerCase()}">${esc(traffic)}</div>
      </div>
      <div>
        <div class="label">Event mix</div>
        <div class="legend">${legendHtml}</div>
      </div>
    </div>
  </div>
  <div class="footer-mark"><span class="party">PARTY</span><span class="slate">SLATE</span></div>
</body>
</html>`
}

function buildDonutSvg(segments) {
  const total = segments.reduce((s, x) => s + x.pct, 0) || 1
  // Normalize (input is already 0..1 fractions; recompute defensively).
  const normalized = segments.map(s => ({ ...s, frac: s.pct / total }))

  const W = 400, H = 400
  const cx = W / 2, cy = H / 2
  const outer = 170
  const inner = 105
  const labelR = (outer + inner) / 2

  let start = -Math.PI / 2 // start at top (12 o'clock)
  const parts = []
  for (const s of normalized) {
    const sweep = s.frac * 2 * Math.PI
    const end = start + sweep
    const large = sweep > Math.PI ? 1 : 0

    const x1 = cx + outer * Math.cos(start)
    const y1 = cy + outer * Math.sin(start)
    const x2 = cx + outer * Math.cos(end)
    const y2 = cy + outer * Math.sin(end)
    const x3 = cx + inner * Math.cos(end)
    const y3 = cy + inner * Math.sin(end)
    const x4 = cx + inner * Math.cos(start)
    const y4 = cy + inner * Math.sin(start)

    const d = [
      `M ${x1.toFixed(2)} ${y1.toFixed(2)}`,
      `A ${outer} ${outer} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
      `L ${x3.toFixed(2)} ${y3.toFixed(2)}`,
      `A ${inner} ${inner} 0 ${large} 0 ${x4.toFixed(2)} ${y4.toFixed(2)}`,
      'Z',
    ].join(' ')

    parts.push(`<path d="${d}" fill="${s.color}" />`)

    // Label position: center of the slice on the labelR ring. Only render if
    // segment is large enough to fit "NN%" comfortably (~6% of the circle).
    if (s.frac >= 0.06) {
      const lx = cx + labelR * Math.cos(start + sweep / 2)
      const ly = cy + labelR * Math.sin(start + sweep / 2)
      const labelFill = pickLabelColor(s.color)
      parts.push(
        `<text x="${lx.toFixed(2)}" y="${ly.toFixed(2)}" text-anchor="middle" dominant-baseline="central" fill="${labelFill}" font-family="Outfit, system-ui, sans-serif" font-weight="500" font-size="18">${Math.round(s.frac * 100)}%</text>`
      )
    }

    start = end
  }
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`
}

function pickLabelColor(hex) {
  const h = hex.replace('#', '')
  if (h.length !== 6) return '#000'
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return lum > 0.55 ? '#000000' : '#FFFFFF'
}

function renderError(msg) {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body style="font-family: sans-serif; padding: 40px;">${esc(msg)}</body></html>`
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]))
}
