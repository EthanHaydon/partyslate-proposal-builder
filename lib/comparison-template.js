// New slide inserted between "Market Trends" (slide 7) and "Customer Success"
// (slide 8). Side-by-side "today vs. proposed" cards. All numbers come from
// the uploaded xlsx (current + proposed tabs). Narrative bullets and the two
// card subtitles come from the form so each deal can speak its own language.

const COLORS = {
  bg: '#FFFFFF',
  title: '#000000',
  body: '#333333',
  muted: '#8A8A8A',
  caption: '#6B6B6B',
  border: '#E5E5E5',
  cardBg: '#FFFFFF',
  todayBg: '#F4F4F4',
  todayPillBg: '#E5E5E5',
  todayPillFg: '#555555',
  proposedAccent: '#1F3A8A',
  proposedBg: '#F5F8FE',
  proposedPillFg: '#FFFFFF',
  delta: '#15803D',
  dimIcon: '#9CA3AF',
}

export function renderComparisonHtml({
  title = '',
  subtitle = '',
  today: t = {},
  proposed: p = {},
}) {
  // t / p shape:
  // { subtitle, annualSpend (number), accountCount, wpcPaid, clientPaid,
  //   propertiesAdded (proposed only), deltaSpend (proposed only), bullets: string[] }

  const todayBullets = (Array.isArray(t.bullets) ? t.bullets : [])
    .map(b => `<li><span class="mark x">×</span><span class="text">${esc(b)}</span></li>`)
    .join('')
  const proposedBullets = (Array.isArray(p.bullets) ? p.bullets : [])
    .map(b => `<li><span class="mark check">✓</span><span class="text">${esc(b)}</span></li>`)
    .join('')

  // Today caption: literal override if provided, otherwise auto-build from
  // the old xlsx-derived fields (kept for backward compatibility).
  const todayCaption = (typeof t.caption === 'string' && t.caption.length)
    ? t.caption
    : buildCaption(t)
  const proposedDelta = buildProposedDelta(p)

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(title || 'Today vs. Proposed')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@200;300;400;500;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: ${COLORS.bg}; }
  body {
    width: 13.333in;
    height: 7.5in;
    font-family: 'Outfit', system-ui, sans-serif;
    font-weight: 300;
    color: ${COLORS.body};
    padding: 0.4in 0.5in 0.32in;
    display: grid;
    grid-template-rows: auto 1fr;
    gap: 0.18in;
    overflow: hidden;
  }

  .head .title {
    font-weight: 400;
    font-size: 30pt;
    color: ${COLORS.title};
    line-height: 1.05;
    letter-spacing: -0.01em;
  }
  .head .sub {
    margin-top: 0.06in;
    font-size: 12pt;
    color: ${COLORS.caption};
    font-weight: 300;
  }

  .cards {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.3in;
    min-height: 0;
  }

  .card {
    background: ${COLORS.cardBg};
    border: 1px solid ${COLORS.border};
    border-radius: 4px;
    padding: 0.28in 0.32in 0.32in;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }
  .card.today { background: ${COLORS.todayBg}; }
  .card.proposed {
    background: ${COLORS.proposedBg};
    border: 2px solid ${COLORS.proposedAccent};
  }

  .pill {
    display: inline-block;
    align-self: stretch;
    text-align: center;
    border-radius: 999px;
    font-weight: 500;
    font-size: 10pt;
    letter-spacing: 0.22em;
    padding: 6pt 0;
    margin-bottom: 0.18in;
    text-transform: uppercase;
  }
  .pill.today { background: ${COLORS.todayPillBg}; color: ${COLORS.todayPillFg}; }
  .pill.proposed { background: ${COLORS.proposedAccent}; color: ${COLORS.proposedPillFg}; }

  .card .sub {
    font-size: 13pt;
    color: ${COLORS.title};
    font-weight: 300;
    line-height: 1.35;
  }

  .spend-label {
    font-size: 10pt;
    color: ${COLORS.caption};
    font-weight: 400;
    margin-top: 0.18in;
  }
  .spend-value {
    font-size: 48pt;
    font-weight: 400;
    color: ${COLORS.title};
    line-height: 1;
    letter-spacing: -0.02em;
    margin-top: 0.04in;
  }
  .spend-caption {
    margin-top: 0.08in;
    font-size: 11pt;
    color: ${COLORS.caption};
    font-weight: 300;
    min-height: 1.4em; /* reserve space so today + proposed bullets align */
  }
  .spend-caption.delta {
    color: ${COLORS.delta};
    font-weight: 400;
  }

  .bullets-wrap {
    /* sits right after spend-caption; min-height above keeps both sides aligned */
  }
  .divider {
    height: 1px;
    background: ${COLORS.border};
    margin: 0.16in 0 0.18in;
  }

  ul.bullets {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.1in;
  }
  ul.bullets li {
    display: grid;
    grid-template-columns: 0.26in 1fr;
    align-items: start;
    font-size: 11pt;
    color: ${COLORS.body};
    line-height: 1.4;
    font-weight: 300;
  }
  .mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 0.18in;
    height: 0.18in;
    border-radius: 50%;
    font-size: 9pt;
    font-weight: 500;
    line-height: 1;
    margin-top: 0.03in;
  }
  .mark.x {
    background: ${COLORS.todayPillBg};
    color: ${COLORS.dimIcon};
  }
  .mark.check {
    background: ${COLORS.proposedBg};
    color: ${COLORS.proposedAccent};
    border: 1px solid ${COLORS.proposedAccent};
  }
</style>
</head>
<body>
  <div class="head">
    <div class="title">${esc(title)}</div>
    ${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ''}
  </div>

  <div class="cards">
    <div class="card today">
      <div class="pill today">Today</div>
      ${t.subtitle ? `<div class="sub">${esc(t.subtitle)}</div>` : ''}
      <div class="spend-label">Annual spend</div>
      <div class="spend-value">${fmtCurrency(t.annualSpend)}</div>
      <div class="spend-caption">${todayCaption ? esc(todayCaption) : '&nbsp;'}</div>
      <div class="bullets-wrap">${todayBullets ? `<div class="divider"></div><ul class="bullets">${todayBullets}</ul>` : ''}</div>
    </div>

    <div class="card proposed">
      <div class="pill proposed">Proposed</div>
      ${p.subtitle ? `<div class="sub">${esc(p.subtitle)}</div>` : ''}
      <div class="spend-label">Annual spend</div>
      <div class="spend-value">${fmtCurrency(p.annualSpend)}</div>
      <div class="spend-caption delta">${proposedDelta ? esc(proposedDelta) : '&nbsp;'}</div>
      <div class="bullets-wrap">${proposedBullets ? `<div class="divider"></div><ul class="bullets">${proposedBullets}</ul>` : ''}</div>
    </div>
  </div>
</body>
</html>`
}

function buildCaption(t) {
  const parts = []
  if (Number.isFinite(t.accountCount) && t.accountCount > 0) {
    parts.push(`${t.accountCount} paying account${t.accountCount === 1 ? '' : 's'}`)
  }
  const splitParts = []
  if (Number.isFinite(t.wpcPaid) && t.wpcPaid > 0) splitParts.push(`${t.wpcPaid} WPC-paid`)
  if (Number.isFinite(t.clientPaid) && t.clientPaid > 0) splitParts.push(`${t.clientPaid} client-paid`)
  if (splitParts.length) parts.push(splitParts.join(' + '))
  return parts.join(' · ')
}

function buildProposedDelta(p) {
  const parts = []
  if (Number.isFinite(p.deltaSpend)) {
    const sign = p.deltaSpend >= 0 ? '+' : '−'
    parts.push(`${sign}${fmtCurrency(Math.abs(p.deltaSpend))} vs. today`)
  }
  if (Number.isFinite(p.propertiesAdded) && p.propertiesAdded > 0) {
    parts.push(`adds ${p.propertiesAdded} propert${p.propertiesAdded === 1 ? 'y' : 'ies'} to scope`)
  }
  return parts.join(' · ')
}

function fmtCurrency(n) {
  const v = Math.round(Number(n) || 0)
  return '$' + v.toLocaleString('en-US')
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]))
}
