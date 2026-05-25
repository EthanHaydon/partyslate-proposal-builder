import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { PDFDocument, rgb } from 'pdf-lib'
import * as xlsxLib from 'xlsx'
import { parseCsv, computeAggregates } from '../lib/parse.js'
import { renderHtml as renderDashboardHtml } from '../lib/template.js'
import { renderMarketsHtml } from '../lib/market-template.js'
import { renderCoverHtml } from '../lib/cover-template.js'
import { renderPricingHtml } from '../lib/pricing-template.js'
import { renderComparisonHtml } from '../lib/comparison-template.js'
import { renderMarketPieHtml } from '../lib/market-pie-template.js'
import { renderPricingTiersHtml } from '../lib/pricing-tiers-template.js'

process.env.AWS_LAMBDA_JS_RUNTIME = process.env.AWS_LAMBDA_JS_RUNTIME || 'nodejs20.x'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = join(__dirname, '..', 'public')
const MARKETS_PATH = join(PUBLIC_DIR, 'markets.json')

const SLIDE_W = 1280
const SLIDE_H = 720
const TARGET_W = 720   // 10 in @ 72 pt
const TARGET_H = 450   // 6.25 in @ 72 pt

// All four photo slots use the same target box (right-column gray placeholder
// on each photo-bearing slide). 55pt T/B inset, full width of the right column.
const PHOTO_TARGET = { x: 367, y: 55, w: 353, h: 340 }

const TEMPLATE_IDS = ['executive-group-deal', 'partyslate-proposal-sales']

let browserPromise
const TEMPLATE_BYTES_CACHE = new Map()
let MARKETS_CACHE = null

async function getBrowser() {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null)
    if (b && b.connected !== false) return b
    browserPromise = null
  }
  const { default: puppeteer } = await import('puppeteer-core')
  const isLinux = process.platform === 'linux'
  if (isLinux) {
    const { default: chromium } = await import('@sparticuz/chromium')
    browserPromise = puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    })
  } else {
    browserPromise = puppeteer.launch({
      headless: 'new',
      executablePath:
        process.env.PUPPETEER_EXECUTABLE_PATH ||
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    })
  }
  return browserPromise
}

function getTemplateBytes(filename) {
  if (!TEMPLATE_BYTES_CACHE.has(filename)) {
    TEMPLATE_BYTES_CACHE.set(filename, readFileSync(join(PUBLIC_DIR, filename)))
  }
  return TEMPLATE_BYTES_CACHE.get(filename)
}

function getMarkets() {
  if (!MARKETS_CACHE) MARKETS_CACHE = JSON.parse(readFileSync(MARKETS_PATH, 'utf8'))
  return MARKETS_CACHE
}

function currentMonthYear() {
  const d = new Date()
  return {
    month: d.toLocaleDateString('en-US', { month: 'long' }),
    year: String(d.getFullYear()),
  }
}

async function renderSlideToPdf(browser, html) {
  const page = await browser.newPage()
  try {
    await page.setViewport({ width: SLIDE_W, height: SLIDE_H, deviceScaleFactor: 1 })
    await page.setContent(html, { waitUntil: 'networkidle0' })
    await page.evaluate(() => document.fonts.ready)
    return await page.pdf({
      width: '13.333in',
      height: '7.5in',
      printBackground: true,
      pageRanges: '1',
    })
  } finally {
    await page.close().catch(() => {})
  }
}

function safeFilename(s) {
  return (s || 'Proposal').trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Proposal'
}

// ---------- Executive Group Deal preparation ----------
function prepareExecutiveGroupDeal(body, errors) {
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

  // CSV → aggregates → metros
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

  // Optional comparison slide
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

  return {
    pdfFile: 'template.pdf',
    htmls,
    buildDescriptors(pdfs) {
      const WHITE = rgb(1, 1, 1)
      const BLACK = rgb(0, 0, 0)
      const descriptors = [
        { kind: 'dynamic', bytes: pdfs.cover,     bg: BLACK },               // 1. Cover
        { kind: 'static',  sourceIdx: 1, photoSlot: 0 },                     // 2. Quick Snapshot
        { kind: 'static',  sourceIdx: 2, photoSlot: 1 },                     // 3. Goals
        { kind: 'static',  sourceIdx: 3, photoSlot: 2 },                     // 4. Why
        { kind: 'static',  sourceIdx: 4 },                                   // 5. Stats
        { kind: 'dynamic', bytes: pdfs.dashboard, bg: WHITE },               // 6. Dashboard
        { kind: 'dynamic', bytes: pdfs.markets,   bg: WHITE },               // 7. Markets
      ]
      if (pdfs.comparison) {
        descriptors.push({ kind: 'dynamic', bytes: pdfs.comparison, bg: WHITE }) // 8. Comparison (optional)
      }
      descriptors.push(
        { kind: 'static',  sourceIdx: 7 },                                   // CS Support
        { kind: 'static',  sourceIdx: 8 },                                   // Integrations
        { kind: 'dynamic', bytes: pdfs.pricing,   bg: WHITE },               // Investment Summary
        { kind: 'static',  sourceIdx: 10, photoSlot: 3 },                    // Marketing Activities
        { kind: 'static',  sourceIdx: 11 },                                  // Trusted Brands
        { kind: 'static',  sourceIdx: 12 },                                  // Closer
      )
      return descriptors
    },
  }
}

// ---------- PartySlate Proposal Sales preparation ----------
function preparePartySlateProposalSales(body, errors) {
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

  return {
    pdfFile: 'template-standard.pdf',
    htmls,
    buildDescriptors(pdfs) {
      const WHITE = rgb(1, 1, 1)
      const BLACK = rgb(0, 0, 0)
      // 14-page Standard deck:
      // 1 cover · 2-4 photos · 5 stats · 6 market pie · 7 CS · 8 Integrations
      // 9 Investment Summary · 10 pricing reference (kept as-is)
      // 11 Extra Value (photo 4) · 12 Trusted · 13-14 closers
      return [
        { kind: 'dynamic', bytes: pdfs.cover,        bg: BLACK },             // 1
        { kind: 'static',  sourceIdx: 1, photoSlot: 0 },                      // 2
        { kind: 'static',  sourceIdx: 2, photoSlot: 1 },                      // 3
        { kind: 'static',  sourceIdx: 3, photoSlot: 2 },                      // 4
        { kind: 'static',  sourceIdx: 4 },                                    // 5
        { kind: 'dynamic', bytes: pdfs.marketPie,    bg: WHITE },             // 6
        { kind: 'static',  sourceIdx: 6 },                                    // 7
        { kind: 'static',  sourceIdx: 7 },                                    // 8
        { kind: 'dynamic', bytes: pdfs.pricingTiers, bg: WHITE },             // 9
        { kind: 'static',  sourceIdx: 9 },                                    // 10 (keep as-is)
        { kind: 'static',  sourceIdx: 10, photoSlot: 3 },                     // 11 Extra Value
        { kind: 'static',  sourceIdx: 11 },                                   // 12 Trusted
        { kind: 'static',  sourceIdx: 12 },                                   // 13 closer
        { kind: 'static',  sourceIdx: 13 },                                   // 14 closer
      ]
    },
  }
}

// ---------- Helpers shared by Executive template ----------
function statsFromSheet(rows) {
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

function parseComparisonXlsx(base64) {
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

// ---------- HTTP handler ----------
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' })
    return
  }

  try {
    const body = req.body || {}
    const template = body.template || 'executive-group-deal'
    if (!TEMPLATE_IDS.includes(template)) {
      res.status(400).json({ error: `unknown template: ${template}` })
      return
    }
    if (!body.companyName || typeof body.companyName !== 'string') {
      res.status(400).json({ error: 'missing companyName' })
      return
    }

    const errors = []
    const prep = template === 'partyslate-proposal-sales'
      ? preparePartySlateProposalSales(body, errors)
      : prepareExecutiveGroupDeal(body, errors)
    if (!prep) {
      res.status(400).json({ error: errors.join('; ') })
      return
    }

    // Render every dynamic slide concurrently on a shared browser.
    const browser = await getBrowser()
    const slideIds = Object.keys(prep.htmls)
    const renderedPdfs = await Promise.all(
      slideIds.map(id => renderSlideToPdf(browser, prep.htmls[id])),
    )
    const pdfs = Object.fromEntries(slideIds.map((id, i) => [id, renderedPdfs[i]]))

    const descriptors = prep.buildDescriptors(pdfs)
    const baseDoc = await PDFDocument.load(getTemplateBytes(prep.pdfFile))
    const out = await PDFDocument.create()

    for (const desc of descriptors) {
      if (desc.kind === 'dynamic') {
        const [embedded] = await out.embedPdf(desc.bytes, [0])
        const scale = TARGET_W / embedded.width
        const drawW = embedded.width * scale
        const drawH = embedded.height * scale
        const offsetY = (TARGET_H - drawH) / 2
        const page = out.addPage([TARGET_W, TARGET_H])
        page.drawRectangle({ x: 0, y: 0, width: TARGET_W, height: TARGET_H, color: desc.bg })
        page.drawPage(embedded, { x: 0, y: offsetY, width: drawW, height: drawH })
        desc.page = page
      } else {
        const [page] = await out.copyPages(baseDoc, [desc.sourceIdx])
        out.addPage(page)
        desc.page = page
      }
    }

    // Overlay uploaded photos
    const photoArr = Array.isArray(body.photos) ? body.photos : []
    for (const desc of descriptors) {
      if (desc.photoSlot == null) continue
      const dataUrl = photoArr[desc.photoSlot]
      if (!dataUrl || typeof dataUrl !== 'string') continue
      const comma = dataUrl.indexOf(',')
      if (comma < 0) continue
      const meta = dataUrl.slice(0, comma)
      const b64 = dataUrl.slice(comma + 1)
      const bytes = Buffer.from(b64, 'base64')
      const isJpg = /jpe?g/i.test(meta)
      let img
      try {
        img = isJpg ? await out.embedJpg(bytes) : await out.embedPng(bytes)
      } catch (e) {
        console.warn(`photo slot ${desc.photoSlot} embed failed:`, e.message)
        continue
      }
      const t = PHOTO_TARGET
      const imgRatio = img.width / img.height
      const targetRatio = t.w / t.h
      let drawW, drawH
      if (imgRatio > targetRatio) {
        drawW = t.w
        drawH = t.w / imgRatio
      } else {
        drawH = t.h
        drawW = t.h * imgRatio
      }
      const drawX = t.x + (t.w - drawW) / 2
      const drawY = t.y + (t.h - drawH) / 2
      desc.page.drawImage(img, { x: drawX, y: drawY, width: drawW, height: drawH })
    }

    const finalBytes = await out.save()
    const filename = `${safeFilename(body.companyName)}_PartySlate_Proposal.pdf`
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.end(Buffer.from(finalBytes))
  } catch (e) {
    console.error('build-proposal error:', e)
    res.status(500).json({ error: e.message || String(e) })
  }
}

export const config = {
  api: { bodyParser: { sizeLimit: '15mb' } },
}
