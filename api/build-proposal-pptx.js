// PPTX export endpoint. Mirror of build-proposal.js but renders dynamic
// slides to PNG (puppeteer screenshot) and assembles with pizzip on top of
// the source .pptx so static slides keep their native editable text.

import {
  getBrowser,
  getTemplateBytes,
  renderSlideToPng,
  safeFilename,
} from '../lib/render-helpers.js'
import {
  prepareExecutiveGroupDeal,
  preparePartySlateProposalSales,
} from '../lib/proposal-prep.js'
import { assemblePptx } from '../lib/pptx-assemble.js'

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

    const browser = await getBrowser()
    const slideKeys = Object.keys(prep.htmls)
    const renderedList = await Promise.all(
      slideKeys.map(k => renderSlideToPng(browser, prep.htmls[k])),
    )
    const renderedPngs = Object.fromEntries(slideKeys.map((k, i) => [k, renderedList[i]]))

    const finalBytes = assemblePptx({
      templateBytes: getTemplateBytes(prep.pptxFile),
      descriptors: prep.descriptors,
      renderedPngs,
      photos: body.photos,
    })

    const filename = `${safeFilename(body.companyName)}_PartySlate_Proposal.pptx`
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.end(Buffer.from(finalBytes))
  } catch (e) {
    console.error('build-proposal-pptx error:', e)
    res.status(500).json({ error: e.message || String(e) })
  }
}

export const config = {
  api: { bodyParser: { sizeLimit: '15mb' } },
}
