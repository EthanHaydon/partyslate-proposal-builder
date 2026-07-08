// PDF export endpoint. Thin handler: validate → prepare → render dynamic
// slides to PDFs → assemble with pdf-lib → respond. All heavy lifting lives
// in lib/ (proposal-prep, render-helpers, pdf-assemble).

import {
  getBrowser,
  getTemplateBytes,
  renderSlideToPdf,
  safeFilename,
} from '../lib/render-helpers.js'
import {
  prepareExecutiveGroupDeal,
  preparePartySlateProposalSales,
} from '../lib/proposal-prep.js'
import { assemblePdf } from '../lib/pdf-assemble.js'

const TEMPLATE_IDS = ['executive-expansion-proposal', 'pre-sales-proposal']

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' })
    return
  }

  try {
    const body = req.body || {}
    const template = body.template || 'executive-expansion-proposal'
    if (!TEMPLATE_IDS.includes(template)) {
      res.status(400).json({ error: `unknown template: ${template}` })
      return
    }
    if (!body.companyName || typeof body.companyName !== 'string') {
      res.status(400).json({ error: 'missing companyName' })
      return
    }

    const errors = []
    const prep = template === 'pre-sales-proposal'
      ? preparePartySlateProposalSales(body, errors)
      : prepareExecutiveGroupDeal(body, errors)
    if (!prep) {
      res.status(400).json({ error: errors.join('; ') })
      return
    }

    // Render every dynamic slide concurrently on a shared browser.
    const browser = await getBrowser()
    const slideKeys = Object.keys(prep.htmls)
    const renderedList = await Promise.all(
      slideKeys.map(k => renderSlideToPdf(browser, prep.htmls[k])),
    )
    const renderedPdfs = Object.fromEntries(slideKeys.map((k, i) => [k, renderedList[i]]))

    const finalBytes = await assemblePdf({
      templateBytes: getTemplateBytes(prep.pdfFile),
      descriptors: prep.descriptors,
      renderedPdfs,
      photos: body.photos,
    })

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
