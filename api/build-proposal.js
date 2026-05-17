import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { PDFDocument, rgb } from 'pdf-lib'
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

// Where on the static pages (10in × 6.25in → 720×450 pt, origin bottom-left)
// each uploaded photo gets drawn. The right-column gray placeholder on slides
// 2/3/4 fills approximately x:367..720, y:0..450; the target box is inset
// 30pt top/bottom so the photo sits centered with breathing room above/below.
const PHOTO_TARGETS = {
  2:  { x: 367, y: 55, w: 353, h: 340 },
  3:  { x: 367, y: 55, w: 353, h: 340 },
  4:  { x: 367, y: 55, w: 353, h: 340 },
  11: { x: 367, y: 55, w: 353, h: 340 },
}
const PHOTO_BORDER_WIDTH = 1
// Photos[0..3] map to slides 2, 3, 4, 11 in that order.
const PHOTO_SLOTS = [2, 3, 4, 11]

let browserPromise
let TEMPLATE_BYTES_CACHE = null
let MARKETS_CACHE = null

async function getBrowser() {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null)
    if (b && b.connected !== false) return b
    browserPromise = null
  }
  const { default: puppeteer } = await import('puppeteer-core')
  // Vercel Fluid Compute / classic Lambda both run Linux; `vercel dev` runs
  // the function on the host OS (typically macOS). Use OS as the
  // discriminator — robust to Vercel runtime changes that affect env vars.
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
      template,
      companyName,
      csv,
      listPrice,
      discountedPrice,
      finalPrice,
      photos,
    } = req.body || {}

    // Only one template is supported today. The form field is in place so
    // future templates can be plugged in without changing the client.
    const SUPPORTED_TEMPLATES = new Set(['executive-group-deal'])
    if (template && !SUPPORTED_TEMPLATES.has(template)) {
      res.status(400).json({ error: `unknown template: ${template}` })
      return
    }

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
    // The Google Slides template uses 10 × 6.25 in pages (720 × 450 pt).
    // Dynamic slides are rendered at 13.333 × 7.5 in (16:9) so the existing
    // inquiry-dashboard layouts work unchanged. Here we embed each dynamic
    // PDF as a form XObject and draw it scale-to-fit-width on a 10 × 6.25
    // page — small letterbox bars top/bottom are hidden by per-slide bg fill.
    const baseDoc = await PDFDocument.load(getTemplateBytes())
    const baseCount = baseDoc.getPageCount()
    const TARGET_W = 720
    const TARGET_H = 450

    const out = await PDFDocument.create()

    // bg color per dynamic slide so letterbox bars match the slide bg.
    const WHITE = rgb(1, 1, 1)
    const BLACK = rgb(0, 0, 0)
    const dynamics = {
      [DYNAMIC_PAGES.cover]:     { bytes: coverPdf,     bg: BLACK },
      [DYNAMIC_PAGES.dashboard]: { bytes: dashboardPdf, bg: WHITE },
      [DYNAMIC_PAGES.markets]:   { bytes: marketsPdf,   bg: WHITE },
      [DYNAMIC_PAGES.pricing]:   { bytes: pricingPdf,   bg: WHITE },
    }

    for (let i = 1; i <= baseCount; i++) {
      const dyn = dynamics[i]
      if (dyn) {
        const [embedded] = await out.embedPdf(dyn.bytes, [0])
        const scale = TARGET_W / embedded.width
        const drawW = embedded.width * scale
        const drawH = embedded.height * scale
        const offsetY = (TARGET_H - drawH) / 2
        const page = out.addPage([TARGET_W, TARGET_H])
        page.drawRectangle({ x: 0, y: 0, width: TARGET_W, height: TARGET_H, color: dyn.bg })
        page.drawPage(embedded, { x: 0, y: offsetY, width: drawW, height: drawH })
      } else {
        const [page] = await out.copyPages(baseDoc, [i - 1])
        out.addPage(page)
      }
    }

    // ----- Overlay uploaded photos on slides 2/3/4/11 -----
    if (Array.isArray(photos)) {
      for (let slotIdx = 0; slotIdx < PHOTO_SLOTS.length; slotIdx++) {
        const dataUrl = photos[slotIdx]
        if (!dataUrl || typeof dataUrl !== 'string') continue
        const slide = PHOTO_SLOTS[slotIdx]
        const target = PHOTO_TARGETS[slide]
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
          console.warn(`photo slot ${slotIdx} (slide ${slide}) embed failed:`, e.message)
          continue
        }
        // Fit-to-contain inside target box. Centered. Gray placeholder fills any gap.
        const imgRatio = img.width / img.height
        const targetRatio = target.w / target.h
        let drawW, drawH
        if (imgRatio > targetRatio) {
          drawW = target.w
          drawH = target.w / imgRatio
        } else {
          drawH = target.h
          drawW = target.h * imgRatio
        }
        const drawX = target.x + (target.w - drawW) / 2
        const drawY = target.y + (target.h - drawH) / 2
        const page = out.getPage(slide - 1)
        page.drawImage(img, { x: drawX, y: drawY, width: drawW, height: drawH })
        page.drawRectangle({
          x: drawX,
          y: drawY,
          width: drawW,
          height: drawH,
          borderColor: BLACK,
          borderWidth: PHOTO_BORDER_WIDTH,
        })
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
