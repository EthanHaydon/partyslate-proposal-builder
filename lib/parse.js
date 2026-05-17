import { parse } from 'csv-parse/sync'

export function parseCsv(input) {
  return parse(input, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
    trim: true,
  })
}

export function computeAggregates(rows, groupNameOverride) {
  const counts = (key, n) => {
    const m = new Map()
    for (const r of rows) {
      const v = (r[key] || '').trim()
      if (!v) continue
      m.set(v, (m.get(v) || 0) + 1)
    }
    const sorted = [...m.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count }))
    return n ? sorted.slice(0, n) : sorted
  }

  const dates = rows
    .map(r => r.sent_by_mail_system_at)
    .filter(Boolean)
    .map(s => new Date(s))
    .filter(d => !Number.isNaN(d.getTime()))
    .sort((a, b) => a - b)

  const start = dates[0]
  const end = dates[dates.length - 1]

  const venues = counts('company_name', 20)
  const eventTypes = counts('provided_event_category')
  const metros = counts('company_metro_area', 10)

  const groupName = (groupNameOverride && groupNameOverride.trim()) || inferGroupName(rows)

  return {
    groupName,
    dateRange: {
      start: start ? formatDate(start) : '',
      end: end ? formatDate(end) : '',
    },
    totals: {
      inquiries: rows.length,
      venues: new Set(rows.map(r => (r.company_name || '').trim()).filter(Boolean)).size,
      metros: new Set(rows.map(r => (r.company_metro_area || '').trim()).filter(Boolean)).size,
      eventCategories: new Set(rows.map(r => (r.provided_event_category || '').trim()).filter(Boolean)).size,
    },
    venues,
    eventTypes,
    metros,
    generated: formatDate(new Date()),
  }
}

function formatDate(d) {
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function inferGroupName(rows) {
  const domains = new Map()
  for (const r of rows) {
    const email = (r.company_contact_email || '').toLowerCase().trim()
    const at = email.indexOf('@')
    if (at < 0) continue
    const dom = email.slice(at + 1).split(/[,;\s]/)[0]
    if (!dom) continue
    domains.set(dom, (domains.get(dom) || 0) + 1)
  }
  const sorted = [...domains.entries()].sort((a, b) => b[1] - a[1])
  if (!sorted.length) return 'Group'
  const [topDomain, topCount] = sorted[0]
  if (topCount / rows.length < 0.4) return 'PartySlate'
  const stem = topDomain.split('.')[0].replace(/[^a-z0-9]/g, '')
  return stem.charAt(0).toUpperCase() + stem.slice(1)
}
