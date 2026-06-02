// Slide 10 — Investment Summary with dynamic pricing graphic.
// Left column preserves the bullets from the original template
// (Profiles / Includes / Discounting / Billing). The "Discounting" %
// is computed from list vs discounted price. The right column is a
// new on-brand pricing graphic: three stacked tiers with savings.

const COLORS = {
  bg: '#FFFFFF',
  title: '#000000',
  body: '#333333',
  muted: '#8A8A8A',
  border: '#E5E5E5',
  divider: '#D6D6D6',
  gold: '#B69853',
  raspberry: '#B3446C',
  cardBg: '#F8F8F8',
}

export function renderPricingHtml({
  listPrice,
  discountedPrice,
  finalPrice,
  profiles = '',
  includes = [],
  discounting = '',
  billing = '',
}) {
  const listN = Number(listPrice) || 0
  const discN = Number(discountedPrice) || 0
  const finalN = Number(finalPrice) || 0

  const discountPct = listN > 0 ? Math.round((1 - discN / listN) * 100) : 30
  const upfrontSavings = Math.max(discN - finalN, 0)
  const totalSavings = Math.max(listN - finalN, 0)

  const includesHtml = (Array.isArray(includes) ? includes : [])
    .map(item => `<li>${esc(item)}</li>`)
    .join('')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Investment Summary</title>
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
    padding: 0.55in 0.6in;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5in;
    overflow: hidden;
  }

  /* ===== Left column: Investment Summary list ===== */
  .left h1 {
    font-weight: 400;
    font-size: 32pt;
    color: ${COLORS.title};
    letter-spacing: -0.01em;
    line-height: 1;
    margin-bottom: 0.35in;
  }
  .left .row {
    margin-bottom: 0.18in;
    font-size: 15pt;
    color: ${COLORS.title};
    line-height: 1.35;
  }
  .left .row b {
    font-weight: 500;
  }
  .left ul {
    list-style: none;
    padding: 0;
    margin: 0.08in 0 0.18in 0.04in;
  }
  .left li {
    font-size: 15pt;
    color: ${COLORS.body};
    line-height: 1.4;
    padding-left: 0.24in;
    position: relative;
  }
  .left li + li { margin-top: 0.04in; }
  .left li::before {
    content: '';
    width: 0.06in;
    height: 0.06in;
    border-radius: 50%;
    background: ${COLORS.title};
    position: absolute;
    left: 0.04in;
    top: 0.08in;
  }

  /* ===== Right column: pricing graphic ===== */
  .right {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.14in;
  }
  .right .eyebrow {
    font-family: 'Outfit', system-ui, sans-serif;
    font-weight: 400;
    font-size: 10pt;
    text-transform: uppercase;
    letter-spacing: 0.22em;
    color: ${COLORS.muted};
    margin-bottom: 0.04in;
  }
  .tier {
    background: white;
    border: 1px solid ${COLORS.border};
    padding: 0.22in 0.28in;
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    column-gap: 0.18in;
  }
  .tier .label {
    font-size: 10.5pt;
    color: ${COLORS.muted};
    text-transform: uppercase;
    letter-spacing: 0.18em;
    font-weight: 400;
  }
  .tier .amount {
    font-weight: 200;
    color: ${COLORS.title};
    line-height: 1;
    text-align: right;
  }
  .tier.list .amount {
    font-size: 22pt;
    color: ${COLORS.muted};
    text-decoration: line-through;
  }
  .tier.discounted {
    border-color: ${COLORS.gold};
  }
  .tier.discounted .label { color: ${COLORS.title}; }
  .tier.discounted .amount {
    font-size: 28pt;
    color: ${COLORS.title};
  }
  .tier.final {
    background: #000000;
    border-color: #000000;
    padding: 0.32in 0.32in;
  }
  .tier.final .label { color: rgba(255,255,255,0.7); }
  .tier.final .amount {
    font-size: 36pt;
    color: #FFFFFF;
    font-weight: 400;
  }
  .savings {
    display: grid;
    grid-template-columns: auto auto;
    align-items: baseline;
    column-gap: 0.12in;
    padding-left: 0.28in;
    font-size: 10pt;
    color: ${COLORS.raspberry};
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 0.18em;
  }
  .savings .amt {
    font-size: 13pt;
    font-weight: 500;
    letter-spacing: 0.04em;
  }
  .total-callout {
    margin-top: 0.16in;
    padding: 0.12in 0.18in;
    text-align: center;
    font-size: 10pt;
    color: ${COLORS.title};
    letter-spacing: 0.16em;
    text-transform: uppercase;
    font-weight: 400;
  }
  .total-callout b {
    font-weight: 500;
    color: ${COLORS.raspberry};
  }

  /* ===== Footer wordmark (matches template footer) ===== */
  .footer {
    position: absolute;
    left: 0.6in;
    bottom: 0.42in;
    font-size: 11pt;
    letter-spacing: 0.02em;
  }
  .footer .party {
    font-family: 'Outfit', system-ui, sans-serif;
    font-weight: 700;
  }
  .footer .slate {
    font-family: Georgia, serif;
    font-style: italic;
    font-weight: 400;
  }
</style>
</head>
<body>
  <div class="left">
    <h1>Investment Summary</h1>
    <div class="row"><b>Profiles:</b> ${esc(profiles)}</div>
    <div class="row"><b>Includes:</b></div>
    <ul>${includesHtml}</ul>
    <div class="row"><b>Discounting:</b> ${esc(discounting)}</div>
    <div class="row"><b>Billing:</b> ${esc(billing)}</div>
  </div>

  <div class="right">
    <div class="eyebrow">Your Investment</div>
    <div class="tier list">
      <div class="label">List Price</div>
      <div class="amount">${fmt(listN)}</div>
    </div>
    <div class="savings">
      <span>${discountPct}% Group Discount</span>
      <span class="amt">−${fmt(listN - discN)}</span>
    </div>
    <div class="tier discounted">
      <div class="label">Discounted</div>
      <div class="amount">${fmt(discN)}</div>
    </div>
    <div class="savings">
      <span>Upfront Payment Savings</span>
      <span class="amt">−${fmt(upfrontSavings)}</span>
    </div>
    <div class="tier final">
      <div class="label">Final (Upfront)</div>
      <div class="amount">${fmt(finalN)}</div>
    </div>
    <div class="total-callout">
      Total savings vs. list <b>${fmt(totalSavings)}</b>
    </div>
  </div>

  </body>
</html>`
}

function fmt(n) {
  const v = Math.round(Number(n) || 0)
  return '$' + v.toLocaleString('en-US')
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]))
}
