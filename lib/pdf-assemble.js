// PDF assembly. Takes the descriptors + rendered single-page PDFs and produces
// the final multi-page PDF using pdf-lib. The Google Slides templates use
// 10 × 6.25 in pages (720 × 450 pt). Dynamic slides are rendered at 13.333 ×
// 7.5 in (16:9) so the existing HTML layouts work unchanged. Each dynamic
// PDF is embedded as a form XObject and drawn scale-to-fit-width on a 10 ×
// 6.25 page — small letterbox bars top/bottom are hidden by per-slide bg
// fill.

import { PDFDocument, rgb } from 'pdf-lib'
import { getFooterLogoBytes, FOOTER_LOGO_INCHES } from './render-helpers.js'

const TARGET_W = 720
const TARGET_H = 450
const PT_PER_IN = 72

// Footer wordmark drawn on slides whose descriptor sets `footerLogo: true`.
// PDF y is from bottom-left, so we flip the source's top-anchored y.
const FOOTER_LOGO_PT = {
  x: FOOTER_LOGO_INCHES.x * PT_PER_IN,
  y: (6.25 - FOOTER_LOGO_INCHES.y - FOOTER_LOGO_INCHES.h) * PT_PER_IN,
  w: FOOTER_LOGO_INCHES.w * PT_PER_IN,
  h: FOOTER_LOGO_INCHES.h * PT_PER_IN,
}

// All four photo slots use the same target box on each photo-bearing slide.
// 55pt T/B inset, full width of the right-column gray placeholder.
const PHOTO_TARGET = { x: 367, y: 55, w: 353, h: 340 }

const COLORS = {
  white: rgb(1, 1, 1),
  black: rgb(0, 0, 0),
}

export async function assemblePdf({ templateBytes, descriptors, renderedPdfs, photos }) {
  const baseDoc = await PDFDocument.load(templateBytes)
  const out = await PDFDocument.create()

  for (const desc of descriptors) {
    if (desc.kind === 'dynamic') {
      const bytes = renderedPdfs[desc.pngKey]
      if (!bytes) {
        throw new Error(`missing rendered PDF for "${desc.pngKey}"`)
      }
      const [embedded] = await out.embedPdf(bytes, [0])
      const scale = TARGET_W / embedded.width
      const drawW = embedded.width * scale
      const drawH = embedded.height * scale
      const offsetY = (TARGET_H - drawH) / 2
      const page = out.addPage([TARGET_W, TARGET_H])
      page.drawRectangle({
        x: 0, y: 0,
        width: TARGET_W, height: TARGET_H,
        color: COLORS[desc.bg] || COLORS.white,
      })
      page.drawPage(embedded, { x: 0, y: offsetY, width: drawW, height: drawH })
      desc.page = page
    } else {
      const [page] = await out.copyPages(baseDoc, [desc.sourceIdx])
      out.addPage(page)
      desc.page = page
    }
  }

  // Overlay uploaded photos
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

  // Overlay the footer wordmark on slides that opt in.
  const footerLogoNeeded = descriptors.some(d => d.footerLogo)
  if (footerLogoNeeded) {
    const footerImg = await out.embedPng(getFooterLogoBytes())
    for (const desc of descriptors) {
      if (!desc.footerLogo || !desc.page) continue
      desc.page.drawImage(footerImg, {
        x: FOOTER_LOGO_PT.x,
        y: FOOTER_LOGO_PT.y,
        width: FOOTER_LOGO_PT.w,
        height: FOOTER_LOGO_PT.h,
      })
    }
  }

  return out.save()
}
