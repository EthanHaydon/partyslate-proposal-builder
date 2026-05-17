import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { parseCsv, computeAggregates } from '../lib/parse.js'
import { renderHtml as renderDashboardHtml } from '../lib/template.js'
import { renderMarketsHtml } from '../lib/market-template.js'
import { renderCoverHtml } from '../lib/cover-template.js'
import { renderPricingHtml } from '../lib/pricing-template.js'

// Vercel's Fluid Compute doesn't always set AWS_EXECUTION_ENV in the form
// @sparticuz/chromium expects. Force-set AWS_LAMBDA_JS_RUNTIME so its Lambda
// detection passes and the system-lib tarball (libnss3 etc.) extracts.
process.env.AWS_LAMBDA_JS_RUNTIME = process.env.AWS_LAMBDA_JS_RUNTIME || 'nodejs20.x'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATE_PDF_PATH = join(__dirname, '..', 'public', 'template.pdf')
const MARKETS_PATH = join(__dirname, '..', 'public', 'markets.json')

const SLIDE_W = 1280
const SLIDE_H = 720

// Which 1-indexed pages in the base template get replaced by which dynamic slide.
const DYNAMIC_PAGES = { cover: 1, dashboard: 6, markets: 7, pricing: 10 }

let browserPromise
let TEMPLATE_BYTES_CACHE = null
let MARKETS_CACHE = null

async function getBrowser() {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null)
    if (b && b.connected !== false) return b
    browserPromise = null
  }
  const [{ default: puppeteer }, { default: chromium }] = await Promise.all([
    import('puppeteer-core'),
    import('@sparticuz/chromium'),
  ])
  browserPromise = puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  })
  return browserPromise
}

function getTemplateBytes() {
  if (!TEMPLATE_BYTES_CACHE) TEMPLATE_BYTES_CACHE = readFileSync(TEMPLATE_PDF_PATH)
  return TEMPLATE_BYTES_CACHE
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' })
    return
  }

  try {
    const {
      companyName,
      csv,
      listPrice,
      discountedPrice,
      finalPrice,
    } = req.body || {}

    if (!companyName || typeof companyName !== 'string') {
      res.status(400).json({ error: 'missing companyName' })
      return
    }
    if (!csv || typeof csv !== 'string') {
      res.status(400).json({ error: 'missing csv (string body field)' })
      return
    }
    const list = Number(listPrice)
    const disc = Number(discountedPrice)
    const fin = Number(finalPrice)
    if (!Number.isFinite(list) || !Number.isFinite(disc) || !Number.isFinite(fin)) {
      res.status(400).json({ error: 'pricing fields must be numbers (listPrice, discountedPrice, finalPrice)' })
      return
    }

    // ----- Parse CSV, compute aggregates, pick markets -----
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

    // ----- Render the 4 dynamic slides -----
    const { month, year } = currentMonthYear()
    const monthYearLabel = `${month} ${year}`

    const coverHtml = renderCoverHtml({ companyName: companyName.trim(), month, year })
    const dashboardHtml = renderDashboardHtml(data)
    const marketsHtml = renderMarketsHtml({
      markets: selectedMarkets,
      groupName: companyName.trim(),
      generated: monthYearLabel,
      sourceLabel: `Source: PartySlate baseline traffic · ${selectedMarkets.length} market${selectedMarkets.length === 1 ? '' : 's'}`,
    })
    const pricingHtml = renderPricingHtml({
      listPrice: list,
      discountedPrice: disc,
      finalPrice: fin,
    })

    const browser = await getBrowser()
    // Render 4 slides concurrently. Each opens its own page on the shared browser.
    const [coverPdf, dashboardPdf, marketsPdf, pricingPdf] = await Promise.all([
      renderSlideToPdf(browser, coverHtml),
      renderSlideToPdf(browser, dashboardHtml),
      renderSlideToPdf(browser, marketsHtml),
      renderSlideToPdf(browser, pricingHtml),
    ])

    // ----- Assemble final PDF -----
    const baseDoc = await PDFDocument.load(getTemplateBytes())
    const baseCount = baseDoc.getPageCount()

    const out = await PDFDocument.create()

    // Embed each dynamic single-page PDF and grab its first page object.
    const [coverDoc, dashDoc, mktDoc, priceDoc] = await Promise.all([
      PDFDocument.load(coverPdf),
      PDFDocument.load(dashboardPdf),
      PDFDocument.load(marketsPdf),
      PDFDocument.load(pricingPdf),
    ])

    const replacements = new Map([
      [DYNAMIC_PAGES.cover, coverDoc],
      [DYNAMIC_PAGES.dashboard, dashDoc],
      [DYNAMIC_PAGES.markets, mktDoc],
      [DYNAMIC_PAGES.pricing, priceDoc],
    ])

    for (let i = 1; i <= baseCount; i++) {
      if (replacements.has(i)) {
        const [page] = await out.copyPages(replacements.get(i), [0])
        out.addPage(page)
      } else {
        const [page] = await out.copyPages(baseDoc, [i - 1])
        out.addPage(page)
      }
    }

    const finalBytes = await out.save()
    const filename = `${safeFilename(companyName)}_PartySlate_Proposal.pdf`

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.end(Buffer.from(finalBytes))
  } catch (e) {
    console.error('build-proposal error:', e)
    res.status(500).json({ error: e.message || String(e) })
  }
}

export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
}
