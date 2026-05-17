// PartySlate-branded slide for the Market Lookup export.
// Same dimensions and styling vocabulary as the dashboard slide
// (lib/template.js) — Outfit font, white bg, brand colors.

const COLORS = {
  bg: '#FFFFFF',
  title: '#000000',
  section: '#555555',
  body: '#333333',
  muted: '#8A8A8A',
  border: '#E5E5E5',
}

// Stable event-type → color mapping. Stays consistent across markets.
const EVENT_COLORS = {
  Weddings: '#B33A5C',
  Birthdays: '#B89968',
  'Corporate Events': '#000000',
  Celebrations: '#555555',
  Fundraisers: '#888888',
  Mitzvahs: '#BBBBBB',
}
const FALLBACK_COLORS = ['#7A4A4A', '#6B8E8E', '#8B5A8B', '#C8A55A']

const LEVEL_STYLES = {
  HIGH: { bg: '#000000', fg: '#FFFFFF', border: '#000000' },
  MODERATE: { bg: '#FFFFFF', fg: '#000000', border: '#000000' },
  LOW: { bg: '#FFFFFF', fg: '#8A8A8A', border: '#CCCCCC' },
}

export function renderMarketsHtml({ markets, groupName, generated, sourceLabel }) {
  // Union of all event categories across selected markets, ordered by
  // overall prevalence so the legend matches typical bar reading order.
  const totals = new Map()
  for (const m of markets) {
    for (const [cat, pct] of Object.entries(m.event_breakdown)) {
      totals.set(cat, (totals.get(cat) || 0) + pct)
    }
  }
  const categories = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([cat]) => cat)

  let fallbackIdx = 0
  const colorMap = {}
  for (const cat of categories) {
    if (EVENT_COLORS[cat]) {
      colorMap[cat] = EVENT_COLORS[cat]
    } else {
      colorMap[cat] = FALLBACK_COLORS[fallbackIdx++ % FALLBACK_COLORS.length]
    }
  }

  const legendHtml = categories
    .map(
      cat => `
    <div class="legend-item">
      <span class="legend-swatch" style="background:${colorMap[cat]}"></span>
      <span class="legend-label">${esc(cat)}</span>
    </div>`,
    )
    .join('')

  // Show inline % when a segment is large enough to render legibly.
  // 10% ≈ 0.95in of the bar at 13.333in width → fits "29%" comfortably.
  const INLINE_LABEL_MIN = 0.10

  const rowsHtml = markets
    .map(m => {
      const lvl = LEVEL_STYLES[m.traffic_level] || LEVEL_STYLES.MODERATE
      // Bar segments — ordered to match legend order so colors read consistently.
      const segs = categories
        .filter(cat => m.event_breakdown[cat] != null && m.event_breakdown[cat] > 0)
        .map(cat => {
          const pct = m.event_breakdown[cat]
          const w = (pct * 100).toFixed(2)
          const showLabel = pct >= INLINE_LABEL_MIN
          const fg = pickLabelColor(colorMap[cat])
          const label = showLabel ? `<span class="seg-label" style="color:${fg}">${Math.round(pct * 100)}%</span>` : ''
          return `<div class="seg" style="width:${w}%;background:${colorMap[cat]}" title="${esc(cat)} ${(pct * 100).toFixed(1)}%">${label}</div>`
        })
        .join('')
      return `
    <div class="market-row">
      <div class="m-name">${esc(m.metro)}</div>
      <div class="m-pill m-pill-${m.traffic_level.toLowerCase()}" style="background:${lvl.bg};color:${lvl.fg};border-color:${lvl.border}">${m.traffic_level}</div>
      <div class="m-bar">${segs}</div>
    </div>`
    })
    .join('')

  const headerLine = [groupName ? `${groupName}` : null, generated ? `Generated ${generated}` : null]
    .filter(Boolean)
    .join(' · ')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Market Trends — ${esc(groupName || '')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@200;400;500&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: ${COLORS.bg}; }
  body {
    width: 13.333in;
    height: 7.5in;
    font-family: 'Outfit', system-ui, sans-serif;
    font-weight: 200;
    color: ${COLORS.body};
    padding: 0.42in 0.5in 0.34in;
    display: grid;
    grid-template-rows: auto auto 1fr auto;
    gap: 0.18in;
    overflow: hidden;
  }
  .header .title {
    font-weight: 400;
    font-size: 30pt;
    color: ${COLORS.title};
    line-height: 1;
    letter-spacing: -0.01em;
  }
  .header .subtitle {
    font-size: 11pt;
    color: ${COLORS.muted};
    font-weight: 200;
    margin-top: 0.06in;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.22in;
    padding: 0.1in 0.18in;
    background: white;
    border: 1px solid ${COLORS.border};
  }
  .legend-item { display: inline-flex; align-items: center; gap: 0.07in; font-size: 10pt; color: ${COLORS.body}; }
  .legend-swatch { display: inline-block; width: 0.12in; height: 0.12in; }
  .legend-label { font-weight: 400; }

  .markets {
    display: flex;
    flex-direction: column;
    border: 1px solid ${COLORS.border};
    background: white;
    overflow: hidden;
    min-height: 0;
  }
  .markets-head {
    display: grid;
    grid-template-columns: 1.7in 1.1in 1fr;
    align-items: center;
    gap: 0.2in;
    padding: 0.08in 0.24in 0.06in;
    background: white;
  }
  .mh-cell {
    font-size: 10pt;
    font-weight: 400;
    color: ${COLORS.section};
    text-transform: uppercase;
    letter-spacing: 0.18em;
    line-height: 1;
  }
  .market-row {
    display: grid;
    grid-template-columns: 1.7in 1.1in 1fr;
    align-items: center;
    gap: 0.2in;
    padding: 0.02in 0.24in;
    flex: 1 1 0;
    min-height: 0;
  }
  .m-name {
    font-weight: 400;
    font-size: 11pt;
    color: ${COLORS.title};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .m-pill {
    font-weight: 500;
    font-size: 8.5pt;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    border: 1px solid;
    padding: 3pt 0;
    text-align: center;
    width: 0.95in;
    justify-self: start;
    line-height: 1;
  }
  .m-bar {
    display: flex;
    height: 0.2in;
    border: 1px solid ${COLORS.border};
    overflow: hidden;
  }
  .m-bar .seg {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .seg-label {
    font-size: 8.5pt;
    font-weight: 400;
    letter-spacing: 0.02em;
    white-space: nowrap;
  }

  .footer {
    text-align: right;
    font-size: 8pt;
    color: ${COLORS.muted};
    font-weight: 200;
    font-style: italic;
  }
</style>
</head>
<body>
  <div class="header">
    <div class="title">Market Trends</div>
    <div class="subtitle">${headerLine ? esc(headerLine) : ''}</div>
  </div>
  <div class="legend">${legendHtml}</div>
  <div class="markets">
    <div class="markets-head">
      <div class="mh-cell">City</div>
      <div class="mh-cell">Traffic</div>
      <div class="mh-cell">Event Type</div>
    </div>
    ${rowsHtml}
  </div>
  <div class="footer">${esc(sourceLabel || 'Source: PartySlate baseline traffic')}</div>
</body>
</html>`
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]))
}

// Pick legible text color for inline % labels on segments.
// Light segments → black text; dark segments → white text.
function pickLabelColor(hex) {
  const h = hex.replace('#', '')
  if (h.length !== 6) return '#000'
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  // relative luminance approximation
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return lum > 0.55 ? '#000000' : '#FFFFFF'
}
