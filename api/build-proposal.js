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

// Vercel's Fluid Compute doesn't always set AWS_EXECUTION_ENV in the form
// @sparticuz/chromium expects. Force-set AWS_LAMBDA_JS_RUNTIME so its Lambda
// detection passes and the system-lib tarball (libnss3 etc.) extracts.
process.env.AWS_LAMBDA_JS_RUNTIME = process.env.AWS_LAMBDA_JS_RUNTIME || 'nodejs20.x'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATE_PDF_PATH = join(__dirname, '..', 'public', 'template.pdf')
const MARKETS_PATH = join(__dirname, '..', 'public', 'markets.json')

const SLIDE_W = 1280
const SLIDE_H = 720

// All photo placements share the same box: the right-column gray placeholder
// area on slides 2, 3, 4, 11. Coords are PDF points on a 720×450 page
// (10 × 6.25 in), origin bottom-left, with 55pt top/bottom inset.
const PHOTO_TARGET = { x: 367, y: 55, w: 353, h: 340 }

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

// Compute "today/proposed" card stats from one tab of the uploaded xlsx.
// Sheet shape (from the template): rows of { Company Name, Company type,
// Membership Level, Contract End Date, Group Tcv, ... }.
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
      // empty/blank Group Tcv = WPC-paid but amount tbd
      wpcPaid += 1
    }
  }
  return {
    accountCount: accounts.length,
    annualSpend,
    wpcPaid,
    clientPaid,
  }
}

function parseComparisonXlsx(base64) {
  const buf = Buffer.from(base64, 'base64')
  const wb = xlsxLib.read(buf, { type: 'buffer' })
  // Tolerant lookup — accept "Current"/"current"/"Today" etc.
  const findSheet = (re) => {
    const name = wb.SheetNames.find(n => re.test(n))
    return name ? xlsxLib.utils.sheet_to_json(wb.Sheets[name], { defval: '' }) : []
  }
  return {
    current: findSheet(/^current$|^today$/i),
    proposed: findSheet(/^proposed$|^proposal$/i),
  }
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
      investmentSummary,
      comparison,
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

    // ----- Maybe compute Current vs Proposed stats from uploaded xlsx -----
    const cmp = comparison || {}
    const includeComparison = !!(cmp.include && cmp.xlsxBase64)
    let comparisonHtml = null
    if (includeComparison) {
      try {
        const { current, proposed } = parseComparisonXlsx(cmp.xlsxBase64)
        const todayStats = statsFromSheet(current)
        const proposedSheetStats = statsFromSheet(proposed)
        // Proposed annual spend uses the Discounted Price the user entered
        // (per 1a in the spec). The xlsx-derived spend is the un-discounted
        // sum and isn't surfaced; account count + properties-added come from
        // the proposed tab.
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
      } catch (e) {
        console.error('comparison xlsx parse failed:', e)
        res.status(400).json({ error: 'could not parse Current vs Proposed xlsx: ' + e.message })
        return
      }
    }

    // ----- Render dynamic slides -----
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
    const summary = investmentSummary || {}
    const pricingHtml = renderPricingHtml({
      listPrice: list,
      discountedPrice: disc,
      finalPrice: fin,
      profiles: typeof summary.profiles === 'string' ? summary.profiles : '',
      includes: Array.isArray(summary.includes) ? summary.includes : [],
      discounting: typeof summary.discounting === 'string' ? summary.discounting : '',
      billing: typeof summary.billing === 'string' ? summary.billing : '',
    })

    const browser = await getBrowser()
    // Render slides concurrently. Each opens its own page on the shared browser.
    const renderJobs = [
      renderSlideToPdf(browser, coverHtml),
      renderSlideToPdf(browser, dashboardHtml),
      renderSlideToPdf(browser, marketsHtml),
      renderSlideToPdf(browser, pricingHtml),
    ]
    if (comparisonHtml) renderJobs.push(renderSlideToPdf(browser, comparisonHtml))
    const renderedPdfs = await Promise.all(renderJobs)
    const [coverPdf, dashboardPdf, marketsPdf, pricingPdf, comparisonPdf] = renderedPdfs

    // ----- Assemble final PDF -----
    // The Google Slides template uses 10 × 6.25 in pages (720 × 450 pt).
    // Dynamic slides are rendered at 13.333 × 7.5 in (16:9) so the existing
    // inquiry-dashboard layouts work unchanged. Embed each dynamic PDF as a
    // form XObject and draw it scale-to-fit-width on a 10 × 6.25 page —
    // small letterbox bars top/bottom are hidden by per-slide bg fill.
    const baseDoc = await PDFDocument.load(getTemplateBytes())
    const TARGET_W = 720
    const TARGET_H = 450

    const WHITE = rgb(1, 1, 1)
    const BLACK = rgb(0, 0, 0)

    // Page descriptors — one entry per OUTPUT page, in order.
    //   kind  'dynamic' = render a freshly-built PDF page
    //         'static'  = copy page sourceIdx (0-indexed) from baseDoc
    //   photoSlot 0..3 = which uploaded photo (if any) to overlay on this page
    const descriptors = [
      { kind: 'dynamic', bytes: coverPdf,     bg: BLACK },                 // 1. Cover
      { kind: 'static',  sourceIdx: 1, photoSlot: 0 },                     // 2. Quick Snapshot
      { kind: 'static',  sourceIdx: 2, photoSlot: 1 },                     // 3. Goals
      { kind: 'static',  sourceIdx: 3, photoSlot: 2 },                     // 4. Why PartySlate
      { kind: 'static',  sourceIdx: 4 },                                   // 5. Stats
      { kind: 'dynamic', bytes: dashboardPdf, bg: WHITE },                 // 6. Inquiry Dashboard
      { kind: 'dynamic', bytes: marketsPdf,   bg: WHITE },                 // 7. Market Trends
    ]
    if (comparisonPdf) {
      descriptors.push({ kind: 'dynamic', bytes: comparisonPdf, bg: WHITE }) // 8. Current vs Proposed (optional)
    }
    descriptors.push(
      { kind: 'static',  sourceIdx: 7 },                                   // CS Support
      { kind: 'static',  sourceIdx: 8 },                                   // Integrations
      { kind: 'dynamic', bytes: pricingPdf,   bg: WHITE },                 // Investment Summary (pricing)
      { kind: 'static',  sourceIdx: 10, photoSlot: 3 },                    // Marketing Activities
      { kind: 'static',  sourceIdx: 11 },                                  // Trusted Brands
      { kind: 'static',  sourceIdx: 12 },                                  // Closer (PARTYSLATE)
    )

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

    // ----- Overlay uploaded photos -----
    const photoArr = Array.isArray(photos) ? photos : []
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
      const target = PHOTO_TARGET
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
      desc.page.drawImage(img, { x: drawX, y: drawY, width: drawW, height: drawH })
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
  api: { bodyParser: { sizeLimit: '15mb' } },
}
