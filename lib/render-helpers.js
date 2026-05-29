// Shared puppeteer + asset helpers used by both the PDF and PPTX endpoints.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

process.env.AWS_LAMBDA_JS_RUNTIME = process.env.AWS_LAMBDA_JS_RUNTIME || 'nodejs20.x'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = join(__dirname, '..', 'public')
const MARKETS_PATH = join(PUBLIC_DIR, 'markets.json')

export const SLIDE_W = 1280
export const SLIDE_H = 720

let browserPromise
const TEMPLATE_BYTES_CACHE = new Map()
let MARKETS_CACHE = null

export async function getBrowser() {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null)
    if (b && b.connected !== false) return b
    browserPromise = null
  }
  const { default: puppeteer } = await import('puppeteer-core')
  // Vercel Fluid Compute / classic Lambda both run Linux; `vercel dev` runs
  // the function on the host OS. Use platform as the discriminator —
  // robust to Vercel runtime changes that affect env vars.
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

export function getTemplateBytes(filename) {
  if (!TEMPLATE_BYTES_CACHE.has(filename)) {
    TEMPLATE_BYTES_CACHE.set(filename, readFileSync(join(PUBLIC_DIR, filename)))
  }
  return TEMPLATE_BYTES_CACHE.get(filename)
}

export function getMarkets() {
  if (!MARKETS_CACHE) MARKETS_CACHE = JSON.parse(readFileSync(MARKETS_PATH, 'utf8'))
  return MARKETS_CACHE
}

export function currentMonthYear() {
  const d = new Date()
  return {
    month: d.toLocaleDateString('en-US', { month: 'long' }),
    year: String(d.getFullYear()),
  }
}

export function safeFilename(s) {
  return (s || 'Proposal').trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Proposal'
}

// Render an HTML string to a single-page PDF buffer. Body CSS is 13.333 × 7.5 in.
export async function renderSlideToPdf(browser, html) {
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

// Render an HTML string to a PNG buffer at 2x device scale for crisp output.
export async function renderSlideToPng(browser, html) {
  const page = await browser.newPage()
  try {
    await page.setViewport({ width: SLIDE_W, height: SLIDE_H, deviceScaleFactor: 2 })
    await page.setContent(html, { waitUntil: 'networkidle0' })
    await page.evaluate(() => document.fonts.ready)
    return await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: SLIDE_W, height: SLIDE_H },
    })
  } finally {
    await page.close().catch(() => {})
  }
}
