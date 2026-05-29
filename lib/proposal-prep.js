// Per-template preparation. Each prepare function returns:
//   { pdfFile, pptxFile, htmls, descriptors }
//
// `htmls` is a map of pngKey → html (one entry per dynamic slide).
// `descriptors` is the OUTPUT slide order. Each entry is one of:
//   { kind: 'dynamic', pngKey, canvasIdx, bg }
//   { kind: 'static',  sourceIdx, canvasIdx, photoSlot? }
//
// canvasIdx (1-indexed) is the source slide that gets either kept as-is
// (static) or replaced with the dynamic image (dynamic). The PPTX assembler
// uses canvasIdx to identify which source slide to modify; the PDF assembler
// ignores it.
//
// pngKey looks up bytes in the rendered-slides map (PDFs for PDF flow,
// PNGs for PPTX flow). bg is the per-slide background colour used to fill
// letterbox bars in the PDF assembly.

import * as xlsxLib from 'xlsx'
import { parseCsv, computeAggregates } from './parse.js'
import { renderHtml as renderDashboardHtml } from './template.js'
import { renderMarketsHtml } from './market-template.js'
import { renderCoverHtml } from './cover-template.js'
import { renderPricingHtml } from './pricing-template.js'
import { renderComparisonHtml } from './comparison-template.js'
import { renderMarketPieHtml } from './market-pie-template.js'
import { renderPricingTiersHtml } from './pricing-tiers-template.js'
import { getMarkets, currentMonthYear } from './render-helpers.js'

// ===== Executive Group Deal =====
export function prepareExecutiveGroupDeal(body, errors) {
  const {
    companyName,
    csv,
    listPrice,
    discountedPrice,
    finalPrice,
    investmentSummary,
    comparison,
  } = body

  if (!csv || typeof csv !== 'string') errors.push('missing csv')
  const list = Number(listPrice)
  const disc = Number(discountedPrice)
  const fin = Number(finalPrice)
  if (!Number.isFinite(list) || !Number.isFinite(disc) || !Number.isFinite(fin)) {
    errors.push('pricing fields must be numbers (listPrice, discountedPrice, finalPrice)')
  }
  if (errors.length) return null

  const rows = parseCsv(csv)
  const data = computeAggregates(rows, companyName)
  const metrosInCsv = [...new Set(
    rows.map(r => (r.company_metro_area || '').trim()).filter(Boolean),
  )]
  const markets = getMarkets()
  const byName = new Map(markets.markets.map(m => [m.metro, m]))
  const LEVEL_RANK = { HIGH: 0, MODERATE: 1, LOW: 2 }
  const selectedMarkets = metrosInCsv
    .map(m => byName.get(m))
    .filter(Boolean)
    .sort((a, b) =>
      (LEVEL_RANK[a.traffic_level] - LEVEL_RANK[b.traffic_level]) ||
      (b.traffic_actual - a.traffic_actual),
    )

  const cmp = comparison || {}
  const includeComparison = !!(cmp.include && cmp.xlsxBase64)
  let comparisonHtml = null
  if (includeComparison) {
    const { current, proposed } = parseComparisonXlsx(cmp.xlsxBase64)
    const todayStats = statsFromSheet(current)
    const proposedSheetStats = statsFromSheet(proposed)
    const proposedAnnualSpend = disc
    const propertiesAdded = Math.max(
      proposedSheetStats.accountCount - todayStats.accountCount,
      0,
    )
    const deltaSpend = proposedAnnualSpend - todayStats.annualSpend
    comparisonHtml = renderComparisonHtml({
      title: (cmp.title || '').trim() || `${companyName.trim()} partnership — today vs. proposed`,
      subtitle: (cmp.subtitle || '').trim(),
      today: {
        subtitle: (cmp.todaySubtitle || '').trim() || 'Multiple contracts and renewal dates',
        annualSpend: todayStats.annualSpend,
        accountCount: todayStats.accountCount,
        wpcPaid: todayStats.wpcPaid,
        clientPaid: todayStats.clientPaid,
        bullets: Array.isArray(cmp.todayBullets) ? cmp.todayBullets : [],
      },
      proposed: {
        subtitle: (cmp.proposedSubtitle || '').trim() || 'Single enterprise contract, single renewal',
        annualSpend: proposedAnnualSpend,
        propertiesAdded,
        deltaSpend,
        bullets: Array.isArray(cmp.proposedBullets) ? cmp.proposedBullets : [],
      },
    })
  }

  const { month, year } = currentMonthYear()
  const monthYearLabel = `${month} ${year}`
  const summary = investmentSummary || {}

  const htmls = {
    cover: renderCoverHtml({ companyName: companyName.trim(), month, year }),
    dashboard: renderDashboardHtml(data),
    markets: renderMarketsHtml({
      markets: selectedMarkets,
      groupName: companyName.trim(),
      generated: monthYearLabel,
      sourceLabel: `Source: PartySlate baseline traffic · ${selectedMarkets.length} market${selectedMarkets.length === 1 ? '' : 's'}`,
    }),
    pricing: renderPricingHtml({
      listPrice: list,
      discountedPrice: disc,
      finalPrice: fin,
      profiles: typeof summary.profiles === 'string' ? summary.profiles : '',
      includes: Array.isArray(summary.includes) ? summary.includes : [],
      discounting: typeof summary.discounting === 'string' ? summary.discounting : '',
      billing: typeof summary.billing === 'string' ? summary.billing : '',
    }),
  }
  if (comparisonHtml) htmls.comparison = comparisonHtml

  // Source slide canvas mapping (1-indexed):
  // 1 cover · 2 Quick Snapshot · 3 Goals · 4 Why · 5 Stats ·
  // 6 Dashboard · 7 Markets · 8 CS Support · 9 Integrations ·
  // 10 Pricing · 11 Marketing Activities · 12 Trusted · 13 Closer
  const descriptors = [
    { kind: 'dynamic', pngKey: 'cover',     canvasIdx: 1,  bg: 'black' },
    { kind: 'static',  sourceIdx: 1,        canvasIdx: 2,  photoSlot: 0 },
    { kind: 'static',  sourceIdx: 2,        canvasIdx: 3,  photoSlot: 1 },
    { kind: 'static',  sourceIdx: 3,        canvasIdx: 4,  photoSlot: 2 },
    { kind: 'static',  sourceIdx: 4,        canvasIdx: 5 },
    { kind: 'dynamic', pngKey: 'dashboard', canvasIdx: 6,  bg: 'white' },
    { kind: 'dynamic', pngKey: 'markets',   canvasIdx: 7,  bg: 'white' },
  ]
  if (comparisonHtml) {
    // INSERT — PDF flow handles this; PPTX flow skips for v1.
    descriptors.push({ kind: 'dynamic', pngKey: 'comparison', canvasIdx: null, bg: 'white' })
  }
  descriptors.push(
    { kind: 'static',  sourceIdx: 7,        canvasIdx: 8 },
    { kind: 'static',  sourceIdx: 8,        canvasIdx: 9 },
    { kind: 'dynamic', pngKey: 'pricing',   canvasIdx: 10, bg: 'white' },
    { kind: 'static',  sourceIdx: 10,       canvasIdx: 11, photoSlot: 3 },
    { kind: 'static',  sourceIdx: 11,       canvasIdx: 12 },
    { kind: 'static',  sourceIdx: 12,       canvasIdx: 13 },
  )

  return {
    pdfFile: 'template.pdf',
    pptxFile: 'template.pptx',
    htmls,
    descriptors,
  }
}

// ===== PartySlate Proposal Sales =====
export function preparePartySlateProposalSales(body, errors) {
  const {
    companyName,
    metro,
    metroClass,
    subscriptionTier,
    discountTier,
    upfront10,
  } = body

  if (!metro || typeof metro !== 'string') errors.push('missing metro')
  const cls = (metroClass || '').toString().toLowerCase()
  if (cls !== 'standard' && cls !== 'major') errors.push('metroClass must be "standard" or "major"')
  const VALID_TIERS = new Set(['Portfolio', 'Premier', 'Platinum'])
  if (!VALID_TIERS.has(subscriptionTier)) errors.push('subscriptionTier must be Portfolio | Premier | Platinum')
  const dt = Number(discountTier)
  if (!Number.isFinite(dt) || dt < 0 || dt > 100) errors.push('discountTier must be a number 0–100')
  if (errors.length) return null

  const markets = getMarkets()
  const market = markets.markets.find(m => m.metro === metro)
  if (!market) {
    errors.push(`no baseline data for metro "${metro}"`)
    return null
  }

  const { month, year } = currentMonthYear()
  const htmls = {
    cover: renderCoverHtml({ companyName: companyName.trim(), month, year }),
    marketPie: renderMarketPieHtml({ market }),
    pricingTiers: renderPricingTiersHtml({
      metroClass: cls,
      tier: subscriptionTier,
      discountPct: dt,
      upfront10: !!upfront10,
    }),
  }

  // Standard deck (14 source slides → 13 output). The PDF and PPTX exports
  // of the source deck have DIFFERENT internal orderings for slides 9–12, so
  // sourceIdx (PDF page index, 0-indexed) and canvasIdx (PPTX slide file
  // number, 1-indexed) point at different things:
  //
  //   PDF page order      | PPTX slide file order
  //   9  Standard tier    | slide9.xml  Extra Value
  //   10 Major tier       | slide10.xml Standard tier
  //   11 Investment ex.   | slide11.xml Major tier
  //   12 Extra Value      | slide12.xml Investment Summary (placeholder)
  //
  // Output order (both formats): Extra Value (w/ photo) → matching tier grid
  // → dynamic Investment Summary → Trusted → Closer. One tier grid + the
  // placeholder are dropped.
  const matchingTierSourceIdx = cls === 'major' ? 9 : 8   // PDF: page 10 or 9
  const matchingTierCanvasIdx = cls === 'major' ? 11 : 10 // PPTX: slide11 or slide10

  return {
    pdfFile: 'template-standard.pdf',
    pptxFile: 'template-standard.pptx',
    htmls,
    descriptors: [
      { kind: 'dynamic', pngKey: 'cover',        canvasIdx: 1,  bg: 'black' },
      { kind: 'static',  sourceIdx: 1,           canvasIdx: 2,  photoSlot: 0 },
      { kind: 'static',  sourceIdx: 2,           canvasIdx: 3,  photoSlot: 1 },
      { kind: 'static',  sourceIdx: 3,           canvasIdx: 4,  photoSlot: 2 },
      { kind: 'static',  sourceIdx: 4,           canvasIdx: 5 },
      { kind: 'dynamic', pngKey: 'marketPie',    canvasIdx: 6,  bg: 'white' },
      { kind: 'static',  sourceIdx: 6,           canvasIdx: 7 },
      { kind: 'static',  sourceIdx: 7,           canvasIdx: 8 },
      // Slot 9: Extra Value with photo 3.
      // PDF page 12 = sourceIdx 11. PPTX slide9.xml = canvasIdx 9.
      { kind: 'static',  sourceIdx: 11,          canvasIdx: 9,  photoSlot: 3 },
      // Slot 10: matching tier grid.
      { kind: 'static',  sourceIdx: matchingTierSourceIdx, canvasIdx: matchingTierCanvasIdx },
      // Slot 11: dynamic Investment Summary. PPTX replaces slide12.xml
      // (Investment Summary placeholder); PDF assembly ignores canvasIdx.
      { kind: 'dynamic', pngKey: 'pricingTiers', canvasIdx: 12, bg: 'white' },
      { kind: 'static',  sourceIdx: 12,          canvasIdx: 13 }, // Trusted
      { kind: 'static',  sourceIdx: 13,          canvasIdx: 14 }, // Closer
    ],
  }
}

// ===== Helpers used by Executive prep =====
export function statsFromSheet(rows) {
  const accounts = rows.filter(r => (r['Company Name'] || '').trim().length > 0)
  let annualSpend = 0
  let wpcPaid = 0
  let clientPaid = 0
  for (const r of accounts) {
    const tcv = r['Group Tcv']
    if (typeof tcv === 'number' && Number.isFinite(tcv)) {
      annualSpend += tcv
      wpcPaid += 1
    } else if (typeof tcv === 'string') {
      if (/paid by facility/i.test(tcv)) clientPaid += 1
      else wpcPaid += 1
    } else {
      wpcPaid += 1
    }
  }
  return { accountCount: accounts.length, annualSpend, wpcPaid, clientPaid }
}

export function parseComparisonXlsx(base64) {
  const buf = Buffer.from(base64, 'base64')
  const wb = xlsxLib.read(buf, { type: 'buffer' })
  const findSheet = (re) => {
    const name = wb.SheetNames.find(n => re.test(n))
    return name ? xlsxLib.utils.sheet_to_json(wb.Sheets[name], { defval: '' }) : []
  }
  return {
    current: findSheet(/^current$|^today$/i),
    proposed: findSheet(/^proposed$|^proposal$/i),
  }
}
