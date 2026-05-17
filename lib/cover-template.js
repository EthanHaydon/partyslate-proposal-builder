// Slide 1 — black cover slide.
// Renders the PartySlate wordmark (PARTY chunky sans + SLATE serif italic)
// centered, with "[Company] x PartySlate" and "[month] [year]" underneath.

export function renderCoverHtml({ companyName, month, year }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>PartySlate × ${esc(companyName)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;500;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: #000; }
  body {
    width: 13.333in;
    height: 7.5in;
    color: #FFFFFF;
    font-family: 'Montserrat', system-ui, sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.7in;
    overflow: hidden;
  }
  .wordmark {
    font-size: 56pt;
    line-height: 1;
    letter-spacing: 0.02em;
    white-space: nowrap;
  }
  .wordmark .party {
    font-family: 'Montserrat', system-ui, sans-serif;
    font-weight: 700;
    letter-spacing: 0.04em;
  }
  .wordmark .slate {
    font-family: Georgia, 'Times New Roman', serif;
    font-style: italic;
    font-weight: 400;
    letter-spacing: 0.02em;
  }
  .meta {
    text-align: center;
    font-weight: 300;
    font-size: 22pt;
    line-height: 1.35;
    letter-spacing: 0.01em;
  }
  .meta .pair { white-space: nowrap; }
  .meta .date { display: block; margin-top: 0.12in; }
</style>
</head>
<body>
  <div class="wordmark">
    <span class="party">PARTY</span><span class="slate">SLATE</span>
  </div>
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
