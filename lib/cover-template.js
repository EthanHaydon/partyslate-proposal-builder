// Slide 1 — black cover slide.
// Uses the actual PartySlate brand wordmark image (extracted from the source
// deck's slideLayout1) so the logo matches the closer slide exactly. Body
// text is "[Company] x PartySlate" and "[month] [year]" in Outfit Light.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const LOGO_PATH = join(__dirname, '..', 'public', 'partyslate-logo.png')

let LOGO_DATA_URL = null
function getLogoDataUrl() {
  if (!LOGO_DATA_URL) {
    const bytes = readFileSync(LOGO_PATH)
    LOGO_DATA_URL = 'data:image/png;base64,' + bytes.toString('base64')
  }
  return LOGO_DATA_URL
}

export function renderCoverHtml({ companyName, month, year }) {
  const logoUrl = getLogoDataUrl()
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>PartySlate × ${esc(companyName)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: #000; }
  body {
    width: 13.333in;
    height: 7.5in;
    color: #FFFFFF;
    font-family: 'Outfit', system-ui, sans-serif;
    font-weight: 300;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.7in;
    overflow: hidden;
  }
  .wordmark {
    display: block;
    width: 5.6in;
    height: auto;
  }
  .meta {
    text-align: center;
    font-weight: 300;
    font-size: 26pt;
    line-height: 1.4;
    letter-spacing: 0.01em;
  }
  .meta .pair { white-space: nowrap; }
  .meta .date { display: block; margin-top: 0.12in; }
</style>
</head>
<body>
  <img class="wordmark" src="${logoUrl}" alt="PartySlate">
  <div class="meta">
    <span class="pair">${esc(companyName)} x PartySlate</span>
    <span class="date">${esc(month)} ${esc(year)}</span>
  </div>
</body>
</html>`
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]))
}
