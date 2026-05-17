const COLORS = {
  bg: '#FFFFFF',
  venues: '#B33A5C',
  events: '#B89968',
  metros: '#000000',
  title: '#000000',
  section: '#555555',
  body: '#333333',
  muted: '#8A8A8A',
  border: '#E5E5E5',
}

export function renderHtml(d) {
  const maxVenue = d.venues[0]?.count || 1
  const maxEvent = d.eventTypes[0]?.count || 1
  const maxMetro = d.metros[0]?.count || 1

  const bars = (rows, max, color) =>
    rows
      .map(
        r => `
    <div class="bar-row">
      <div class="bar-name">${esc(r.name)}</div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${((r.count / max) * 100).toFixed(2)}%;background:${color}"></div>
      </div>
      <div class="bar-value">${r.count}</div>
    </div>`,
      )
      .join('')

  const dateRange = d.dateRange.start && d.dateRange.end
    ? `${d.dateRange.start} – ${d.dateRange.end}`
    : ''

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>PartySlate Inquiries — ${esc(d.groupName)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@200;400&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: ${COLORS.bg}; }
  body {
    width: 13.333in;
    height: 7.5in;
    font-family: 'Outfit', system-ui, sans-serif;
    font-weight: 200;
    color: ${COLORS.body};
    padding: 0.38in 0.45in 0.32in;
    display: grid;
    grid-template-rows: auto auto 1fr auto;
    gap: 0.16in;
    overflow: hidden;
  }
  .header .title {
    font-weight: 400;
    font-size: 32pt;
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
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.16in; }
  .kpi-card {
    background: white;
    border: 1px solid ${COLORS.border};
    padding: 0.16in 0.2in 0.18in;
    border-radius: 2px;
  }
  .kpi-label {
    font-size: 10pt;
    color: ${COLORS.section};
    text-transform: uppercase;
    letter-spacing: 0.18em;
    font-weight: 400;
    margin-bottom: 0.06in;
  }
  .kpi-value {
    font-size: 38pt;
    color: ${COLORS.title};
    font-weight: 400;
    line-height: 1;
  }
  .panels {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    gap: 0.16in;
    min-height: 0;
  }
  .panel {
    background: white;
    border: 1px solid ${COLORS.border};
    padding: 0.18in 0.22in 0.16in;
    border-radius: 2px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
  }
  .panel.venues { grid-row: 1 / 3; grid-column: 1; }
  .panel.events { grid-row: 1; grid-column: 2; }
  .panel.metros { grid-row: 2; grid-column: 2; }
  .panel-title {
    font-size: 11pt;
    color: ${COLORS.section};
    text-transform: uppercase;
    letter-spacing: 0.18em;
    font-weight: 400;
    margin-bottom: 0.14in;
    flex: 0 0 auto;
  }
  .bars {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    flex: 1 1 auto;
    min-height: 0;
    gap: 0.04in;
  }
  .bar-row {
    display: grid;
    grid-template-columns: 1.6in 1fr 0.3in;
    column-gap: 0.1in;
    align-items: center;
    font-size: 9pt;
    line-height: 1.1;
  }
  .bar-name {
    text-align: right;
    color: ${COLORS.body};
    font-weight: 200;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bar-track { width: 100%; }
  .bar-fill { height: 0.13in; min-width: 1px; }
  .bar-value {
    color: ${COLORS.title};
    font-weight: 400;
    text-align: left;
  }
  .panel.events .bar-row,
  .panel.metros .bar-row {
    grid-template-columns: 1.4in 1fr 0.3in;
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
    <div class="title">PartySlate Inquiries — ${esc(d.groupName)}</div>
    <div class="subtitle">${dateRange ? `Inquiries from ${dateRange} · ` : ''}Generated ${esc(d.generated)}</div>
  </div>
  <div class="kpis">
    ${kpi('Total Inquiries', d.totals.inquiries)}
    ${kpi('Venues', d.totals.venues)}
    ${kpi('Metros', d.totals.metros)}
    ${kpi('Event Categories', d.totals.eventCategories)}
  </div>
  <div class="panels">
    <div class="panel venues">
      <div class="panel-title">Top 20 Venues by Inquiry Volume</div>
      <div class="bars">${bars(d.venues, maxVenue, COLORS.venues)}</div>
    </div>
    <div class="panel events">
      <div class="panel-title">Event Type</div>
      <div class="bars">${bars(d.eventTypes, maxEvent, COLORS.events)}</div>
    </div>
    <div class="panel metros">
      <div class="panel-title">Top 10 Metros</div>
      <div class="bars">${bars(d.metros, maxMetro, COLORS.metros)}</div>
    </div>
  </div>
  <div class="footer">
    Source: PartySlate inquiry export${dateRange ? ` · ${dateRange}` : ''} · ${d.totals.inquiries} inquiries · ${d.totals.venues} venues · ${d.totals.metros} metros
  </div>
</body>
</html>`
}

function kpi(label, value) {
  return `<div class="kpi-card"><div class="kpi-label">${esc(label)}</div><div class="kpi-value">${esc(value)}</div></div>`
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]))
}
