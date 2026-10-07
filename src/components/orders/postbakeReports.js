// Printable reports for the Orders screen's Post Bake mode — the web stand-in
// for post_bake.frm's Data Reports and Excel sheets. Opens a plain page in a
// new tab with Print and Download CSV (opens in Excel).
//
//   printReport({ title, subtitle, columns: ['Product', 'Need'],
//                 groups: [{ heading: 'Muffin', rows: [['Corn', 12]] }] })

const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const csvCell = v => {
  const t = String(v ?? '')
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}

export function printReport({ title, subtitle = '', columns, groups, empty = 'Nothing to report.' }) {
  const w = window.open('', '_blank')
  if (!w) { alert('Allow pop-ups for this site to open the report.'); return }
  const numeric = i => i > 0
  const total = groups.reduce((n, g) => n + g.rows.length, 0)

  const csv = [[title, subtitle].filter(Boolean).map(csvCell).join(','), columns.map(csvCell).join(',')]
  groups.forEach(g => {
    if (g.heading) csv.push(csvCell(g.heading))
    g.rows.forEach(r => csv.push(r.map(csvCell).join(',')))
  })

  const body = total === 0 ? `<p class="empty">${esc(empty)}</p>` : `
    <table>
      <thead><tr>${columns.map((c, i) => `<th class="${numeric(i) ? 'num' : ''}">${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${groups.map(g => `
        ${g.heading ? `<tr class="grp"><td colspan="${columns.length}">${esc(g.heading)}</td></tr>` : ''}
        ${g.rows.map(r => `<tr>${r.map((v, i) => `<td class="${numeric(i) ? 'num' : ''}">${esc(v)}</td>`).join('')}</tr>`).join('')}`).join('')}
      </tbody>
    </table>`

  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  body { font: 13px/1.35 system-ui, Segoe UI, Arial, sans-serif; color: #111; margin: 24px; }
  h1 { font-size: 18px; margin: 0 0 2px; } .sub { color: #555; margin-bottom: 14px; }
  table { border-collapse: collapse; min-width: 320px; }
  th, td { border: 1px solid #bbb; padding: 4px 8px; }
  th { background: #eee; text-align: left; } .num { text-align: right; }
  tr.grp td { background: #f6f6f6; font-weight: 700; }
  .bar { margin-bottom: 14px; display: flex; gap: 8px; }
  button { font: inherit; padding: 5px 12px; cursor: pointer; }
  .empty { color: #666; }
  @media print { .bar { display: none; } body { margin: 0; } }
</style></head><body>
<div class="bar"><button onclick="print()">Print</button><button id="csv">Download CSV</button></div>
<h1>${esc(title)}</h1>${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ''}
${body}
</body></html>`)
  w.document.close()
  const data = csv.join('\r\n')
  w.document.getElementById('csv').onclick = () => {
    const a = w.document.createElement('a')
    a.href = URL.createObjectURL(new Blob([data], { type: 'text/csv' }))
    a.download = `${title.replace(/[^\w-]+/g, '_')}.csv`
    a.click()
  }
}

// Group rows by a key, keeping first-seen order.
export function groupBy(list, keyFn) {
  const out = []
  const idx = new Map()
  list.forEach(x => {
    const k = keyFn(x) ?? ''
    if (!idx.has(k)) { idx.set(k, out.length); out.push({ heading: k, items: [] }) }
    out[idx.get(k)].items.push(x)
  })
  return out
}
