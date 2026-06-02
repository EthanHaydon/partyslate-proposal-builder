// Slide 9 of the "PartySlate Proposal Sales" deck.
// Tier-driven Investment Summary. Inputs:
//   metroClass: 'standard' | 'major'  → picks the price grid column
//   tier:       'Portfolio' | 'Premier' | 'Platinum'
//   discountPct: 0..100  (multi-location group discount)
//   upfront10:  boolean  → adds 10% off the discounted price if true

const COLORS = {
  bg: '#FFFFFF',
  title: '#000000',
  body: '#333333',
  muted: '#8A8A8A',
  border: '#E5E5E5',
  gold: '#B69853',
  raspberry: '#B3446C',
}

// Monthly prices straight off PDF pages 9 & 10.
export const PRICE_GRID = {
  Portfolio: { standard: 795, major: 895 },
  Premier:   { standard: 995, major: 1195 },
  Platinum:  { standard: 1395, major: 1695 },
}

// Per-tier features. Headline + supporting line + bullets.
// Source: same PDF, pages 9 & 10 (left-to-right cards).
const TIER_DETAILS = {
  Portfolio: {
    headline: 'Close deals faster',
    blurb: 'Sales-ready photo tools to move inquiries forward.',
    bullets: [
      'Unlimited photo storage with AI-powered photo search',
      'Canva Integration',
      'Public Profile with all features unlocked',
      'Tier 3 directory boost',
      'Complete onboarding',
      'Support Access',
    ],
  },
  Premier: {
    headline: 'Book more events',
    blurb: 'Added exposure and integrations to convert more inquiries.',
    bullets: [
      'Unlimited photo storage with AI-powered photo search',
      'Canva Integration',
      'Public Profile with all features unlocked',
      'Tier 2 directory boost',
      'Photo posting service (8 event albums)',
      'Tripleseat integration',
      'Complete onboarding',
      'Support Access',
    ],
  },
  Platinum: {
    headline: 'Drive revenue',
    blurb: 'Leverage every tool to drive revenue, with full-service support.',
    bullets: [
      'Unlimited photo storage with AI-powered photo search',
      'Canva Integration',
      'Complimentary Photo Hub setup',
      'Public Profile with all features unlocked',
      'Top tier directory boost',
      'Photo posting service (unlimited albums)',
      'Tripleseat integration',
      'Custom concierge onboarding',
      'Dedicated Customer Success Manager',
      'Advanced analytics & performance reviews',
    ],
  },
}

export function renderPricingTiersHtml({
  metroClass = 'standard',
  tier = 'Premier',
  discountPct = 0,
  upfront10 = false,
}) {
  const cls = (metroClass || 'standard').toLowerCase()
  const monthly = (PRICE_GRID[tier] && PRICE_GRID[tier][cls]) || 0
  const list = monthly * 12
  const discountFraction = Math.max(0, Math.min(100, Number(discountPct) || 0)) / 100
  const groupDiscountAmt = list * discountFraction
  const discounted = list - groupDiscountAmt
  const upfrontSavings = upfront10 ? discounted * 0.10 : 0
  const final = discounted - upfrontSavings
  const totalSavings = list - final

  const tierInfo = TIER_DETAILS[tier] || TIER_DETAILS.Premier
  const bulletsHtml = tierInfo.bullets.map(b => `<li>${esc(b)}</li>`).join('')

  const metroLabel = cls === 'major' ? 'Major Metros' : 'Standard Metros'
  const discountLabel = discountFraction > 0
    ? `${Math.round(discountFraction * 100)}% Group Discount`
    : 'None'

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Investment Summary — ${esc(tier)}</title>
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
    font-weight: 200;
    color: ${COLORS.body};
    padding: 0.55in 0.6in;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5in;
    overflow: hidden;
  }

  /* Left column — package summary */
  .left h1 {
    font-weight: 400;
    font-size: 32pt;
    color: ${COLORS.title};
    letter-spacing: -0.01em;
    line-height: 1;
    margin-bottom: 0.28in;
  }
  .left .row {
    margin-bottom: 0.16in;
    font-size: 14pt;
    color: ${COLORS.title};
    line-height: 1.35;
  }
  .left .row b { font-weight: 500; }
  .left .blurb {
    font-size: 12pt;
    color: ${COLORS.muted};
    font-weight: 300;
    margin: -0.05in 0 0.18in 0;
    line-height: 1.4;
  }
  .left ul {
    list-style: none;
    padding: 0;
    margin: 0.04in 0 0.16in 0.04in;
  }
  .left li {
    font-size: 12pt;
    color: ${COLORS.body};
    line-height: 1.4;
    padding-left: 0.22in;
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

  /* Right column — pricing graphic */
  .right {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.14in;
  }
  .right .eyebrow {
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
  .tier.discounted { border-color: ${COLORS.gold}; }
  .tier.discounted .label { color: ${COLORS.title}; }
  .tier.discounted .amount {
    font-size: 28pt;
    color: ${COLORS.title};
  }
  .tier.final {
    background: #000;
    border-color: #000;
    padding: 0.32in;
  }
  .tier.final .label { color: rgba(255,255,255,0.7); }
  .tier.final .amount {
    font-size: 36pt;
    color: #fff;
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
    text-align: center;
    font-size: 10pt;
    color: ${COLORS.title};
    letter-spacing: 0.16em;
    text-transform: uppercase;
    font-weight: 400;
  }
  .total-callout b { font-weight: 500; color: ${COLORS.raspberry}; }

  .footer {
    position: absolute;
    left: 0.6in;
    bottom: 0.42in;
    font-size: 11pt;
    letter-spacing: 0.02em;
  }
  .footer .party { font-family: 'Outfit', system-ui, sans-serif; font-weight: 700; }
  .footer .slate { font-family: Georgia, serif; font-style: italic; font-weight: 400; }
</style>
</head>
<body>
  <div class="left">
    <h1>Investment Summary</h1>
    <div class="row"><b>Package Recommendation:</b> ${esc(tier)}</div>
    ${tierInfo.headline ? `<div class="blurb"><b style="color:${COLORS.raspberry};font-weight:500">${esc(tierInfo.headline)}.</b> ${esc(tierInfo.blurb)}</div>` : ''}
    <div class="row"><b>Includes:</b></div>
    <ul>${bulletsHtml}</ul>
    <div class="row"><b>Discounting:</b> ${esc(discountLabel)}</div>
    <div class="row"><b>Billing:</b> Annual${upfront10 ? ' · Upfront (−10%)' : ''}</div>
  </div>

  <div class="right">
    <div class="eyebrow">Your Investment · ${esc(metroLabel)}</div>
    <div class="tier list">
      <div class="label">List Price</div>
      <div class="amount">${fmt(list)}</div>
    </div>
    ${discountFraction > 0 ? `
    <div class="savings">
      <span>${Math.round(discountFraction * 100)}% Group Discount</span>
      <span class="amt">−${fmt(groupDiscountAmt)}</span>
    </div>` : ''}
    <div class="tier discounted">
      <div class="label">Discounted</div>
      <div class="amount">${fmt(discounted)}</div>
    </div>
    ${upfront10 ? `
    <div class="savings">
      <span>Upfront Payment Savings (10%)</span>
      <span class="amt">−${fmt(upfrontSavings)}</span>
    </div>` : ''}
    <div class="tier final">
      <div class="label">Final${upfront10 ? ' (Upfront)' : ''}</div>
      <div class="amount">${fmt(final)}</div>
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
