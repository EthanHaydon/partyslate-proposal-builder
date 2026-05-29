// PPTX assembly. Open the source .pptx (zip), modify slides per descriptors,
// emit the result. The image approach: dynamic slides become a single
// full-bleed <p:pic> on the source slide's canvas; static slides keep their
// native text + theme; photo overlays append a positioned <p:pic>; unused
// source slides are dropped from the presentation.xml sldIdLst.
//
// v1 limitation: dynamic descriptors with canvasIdx === null (the optional
// Current vs Proposed slide on the Executive deck) are skipped with a
// warning. PDF flow still includes them.

import PizZip from 'pizzip'
import { imageSize } from 'image-size'

const EMU_PER_PT = 12700
const PAGE_W_EMU = 9144000  // 10in
const PAGE_H_EMU = 5715000  // 6.25in

// Photo target — same coordinates as the PDF flow, converted to EMU.
// (1pt = 12700 EMU; both PDF and PPTX have the y-from-top vs y-from-bottom
// conversion work out to the same number for our box: PDF y=55 from bottom
// with h=340 → photo top at 55+340=395 from bottom → 450-395=55 from top.)
const PHOTO_TARGET_EMU = {
  x: 367 * EMU_PER_PT,
  y: 55 * EMU_PER_PT,
  w: 353 * EMU_PER_PT,
  h: 340 * EMU_PER_PT,
}

const PRES_PATH = 'ppt/presentation.xml'
const PRES_RELS_PATH = 'ppt/_rels/presentation.xml.rels'

export function assemblePptx({ templateBytes, descriptors, renderedPngs, photos }) {
  const zip = new PizZip(templateBytes)

  // 1. Build the set of source canvases that are USED in the output
  const usedCanvases = new Set()
  const insertedDescriptors = []
  for (const d of descriptors) {
    if (d.canvasIdx == null) {
      if (d.kind === 'dynamic') {
        console.warn(`PPTX v1: skipping dynamic descriptor "${d.pngKey}" (canvasIdx=null — INSERT not yet supported)`)
        insertedDescriptors.push(d)
      }
      continue
    }
    usedCanvases.add(d.canvasIdx)
  }

  // 2. Modify each used canvas slide (replace with image OR add photo overlay)
  let nextRId = 1000
  let nextImg = 1000
  // canvasIdx → { replaceWith?, addPhoto? }
  const slideModifications = new Map()
  const photoArr = Array.isArray(photos) ? photos : []

  for (const d of descriptors) {
    if (d.canvasIdx == null) continue
    let mod = slideModifications.get(d.canvasIdx)
    if (!mod) { mod = {}; slideModifications.set(d.canvasIdx, mod) }

    if (d.kind === 'dynamic') {
      const png = renderedPngs[d.pngKey]
      if (!png) {
        throw new Error(`missing rendered PNG for "${d.pngKey}"`)
      }
      const rId = `rIdDyn${nextRId++}`
      const filename = `dyn${nextImg++}.png`
      zip.file(`ppt/media/${filename}`, png)
      mod.replaceWith = { rId, filename }
    } else if (d.photoSlot != null) {
      const dataUrl = photoArr[d.photoSlot]
      if (!dataUrl || typeof dataUrl !== 'string') continue
      const comma = dataUrl.indexOf(',')
      if (comma < 0) continue
      const meta = dataUrl.slice(0, comma)
      const b64 = dataUrl.slice(comma + 1)
      const bytes = Buffer.from(b64, 'base64')
      const isJpg = /jpe?g/i.test(meta)
      const ext = isJpg ? 'jpg' : 'png'

      let dim
      try { dim = imageSize(bytes) } catch (e) {
        console.warn(`photo slot ${d.photoSlot} size failed:`, e.message)
        continue
      }
      const imgRatio = dim.width / dim.height
      const targetRatio = PHOTO_TARGET_EMU.w / PHOTO_TARGET_EMU.h
      let drawW, drawH
      if (imgRatio > targetRatio) {
        drawW = PHOTO_TARGET_EMU.w
        drawH = PHOTO_TARGET_EMU.w / imgRatio
      } else {
        drawH = PHOTO_TARGET_EMU.h
        drawW = PHOTO_TARGET_EMU.h * imgRatio
      }
      const drawX = PHOTO_TARGET_EMU.x + (PHOTO_TARGET_EMU.w - drawW) / 2
      const drawY = PHOTO_TARGET_EMU.y + (PHOTO_TARGET_EMU.h - drawH) / 2

      const rId = `rIdPhoto${nextRId++}`
      const filename = `photo${nextImg++}.${ext}`
      zip.file(`ppt/media/${filename}`, bytes)
      mod.addPhoto = {
        rId, filename, ext,
        x: Math.round(drawX),
        y: Math.round(drawY),
        cx: Math.round(drawW),
        cy: Math.round(drawH),
      }
    }
  }

  // 3. Apply modifications to slide XMLs + rels
  for (const [canvasIdx, mod] of slideModifications) {
    const slidePath = `ppt/slides/slide${canvasIdx}.xml`
    const slideRelsPath = `ppt/slides/_rels/slide${canvasIdx}.xml.rels`
    const slideFile = zip.file(slidePath)
    const slideRelsFile = zip.file(slideRelsPath)
    if (!slideFile) {
      console.warn(`canvas ${canvasIdx}: ${slidePath} not found; skipping`)
      continue
    }
    let slideXml = slideFile.asText()
    let slideRels = slideRelsFile ? slideRelsFile.asText() : DEFAULT_SLIDE_RELS

    // Inject image relationships
    const newRels = []
    if (mod.replaceWith) {
      newRels.push(relationshipXml(mod.replaceWith.rId, mod.replaceWith.filename))
    }
    if (mod.addPhoto) {
      newRels.push(relationshipXml(mod.addPhoto.rId, mod.addPhoto.filename))
    }
    if (newRels.length) {
      slideRels = slideRels.replace('</Relationships>', newRels.join('') + '</Relationships>')
    }

    // Apply XML mutations
    if (mod.replaceWith) {
      slideXml = slideXml.replace(/<p:spTree>[\s\S]*?<\/p:spTree>/, buildFullBleedSpTree(mod.replaceWith.rId))
    }
    if (mod.addPhoto) {
      slideXml = slideXml.replace('</p:spTree>', buildPhotoPic(mod.addPhoto) + '</p:spTree>')
    }

    zip.file(slidePath, slideXml)
    zip.file(slideRelsPath, slideRels)
  }

  // 4. Drop source slides not used in the output
  let presXml = zip.file(PRES_PATH).asText()
  let presRels = zip.file(PRES_RELS_PATH).asText()

  // Build map: slide number → rId (from presentation.xml.rels)
  const slideRelMatches = [...presRels.matchAll(/<Relationship Id="([^"]+)"[^>]+Target="slides\/slide(\d+)\.xml"\/>/g)]
  const slideNumToRId = new Map(slideRelMatches.map(m => [Number(m[2]), m[1]]))

  for (const [sourceNum, rid] of slideNumToRId) {
    if (usedCanvases.has(sourceNum)) continue
    // Remove from presentation.xml's sldIdLst
    presXml = presXml.replace(new RegExp(`<p:sldId\\s+id="[^"]*"\\s+r:id="${rid}"\\s*/>`), '')
    // Remove from presentation rels
    presRels = presRels.replace(new RegExp(`<Relationship Id="${rid}"[^>]+/>`), '')
  }

  zip.file(PRES_PATH, presXml)
  zip.file(PRES_RELS_PATH, presRels)

  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' })
}

// ---------- XML builders ----------
function relationshipXml(rId, filename) {
  return `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${filename}"/>`
}

function buildFullBleedSpTree(rId) {
  return `<p:spTree>` +
    `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
    `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>` +
    `<p:pic>` +
      `<p:nvPicPr><p:cNvPr id="2" name="Dynamic"/><p:cNvPicPr><a:picLocks noChangeAspect="0"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
      `<p:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
      `<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${PAGE_W_EMU}" cy="${PAGE_H_EMU}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>` +
    `</p:pic>` +
  `</p:spTree>`
}

function buildPhotoPic({ rId, x, y, cx, cy }) {
  // High id to avoid colliding with the existing shapes on the source slide.
  return `<p:pic>` +
    `<p:nvPicPr><p:cNvPr id="99999" name="UploadedPhoto"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
    `<p:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
    `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>` +
  `</p:pic>`
}

// Fallback in case a slide has no rels file (unlikely but defensive).
const DEFAULT_SLIDE_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`
