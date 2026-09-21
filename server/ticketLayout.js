// ─── Delivery ticket layout ────────────────────────────────────────────────
//
// The office's paper ticket: two product columns side by side, each
//   Units | Pack | Product | Cost | Retail | Total
// with product-type headings, gluten free as its own two-column block below,
// and one total at the foot.
//
// Laid out here once and rendered twice — the Excel workbook and the printable
// page — so the two can't drift into listing a ticket differently.

export const ticketGroupLabel = (line, ord) =>
  ord.groupKey ? (String(line[ord.groupKey] || '').trim() || 'Other') : null

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// 13.5 rather than 13.50, as the paper ticket prints it — for counts.
const num = (n) => String(round2(n))
// Dollar amounts carry the sign and both cents digits: $13.50.
const money = (n) => `$${round2(n).toFixed(2)}`
const MONEY_FMT = '"$"#,##0.00'

/**
 * Lines (already sorted by ticketLineOrder) → { regular, gf, units, total },
 * where regular and gf are each { left, right } columns of cells:
 *   { kind: 'head', label } | { kind: 'line', ... } | { kind: 'blank' }
 */
export function ticketLayout(lines, ord) {
  let units = 0, total = 0
  const regular = [], gf = []
  for (const line of lines) {
    // Net of special orders — those are delivered separately and must not be
    // counted on the account's ticket.
    const u = (parseFloat(line.units) || 0) - (parseFloat(line.special_ords) || 0)
    const cost = parseFloat(line.wprice) || 0
    const item = {
      kind: 'line',
      units: u,
      // Pack is the unit count for now; there's no pack size on products.
      pack: u,
      name: line.prod_name,
      cost,
      retail: parseFloat(line.rprice) || 0,
      total: round2(cost * u),
      group: ticketGroupLabel(line, ord),
    }
    units += u
    total += item.total
    ;(ord.gfSeparate && line.gluten_free ? gf : regular).push(item)
  }
  return {
    regular: splitColumns(runs(regular)),
    gf: gf.length ? splitColumns(runs(gf)) : null,
    units: round2(units),
    total: round2(total),
  }
}

// Consecutive lines under the same heading.
function runs(items) {
  const groups = []
  for (const item of items) {
    const last = groups[groups.length - 1]
    if (last && last.label === item.group) last.items.push(item)
    else groups.push({ label: item.group, items: [item] })
  }
  return groups
}

/**
 * Two columns as even in height as whole groups allow — a type is never split
 * across the columns, so nobody hunts for the rest of the muffins. The one
 * exception is a ticket with a single group (or grouping off), which is halved.
 */
function splitColumns(groups) {
  if (!groups.length) return { left: [], right: [] }
  if (groups.length === 1) {
    const [g] = groups
    if (g.items.length < 2) return { left: flatten(groups), right: [] }
    const half = Math.ceil(g.items.length / 2)
    return {
      left: flatten([{ label: g.label, items: g.items.slice(0, half) }]),
      right: flatten([{ label: g.label && `${g.label} (cont.)`, items: g.items.slice(half) }]),
    }
  }
  const height = (gs) =>
    gs.reduce((n, g) => n + (g.label ? 1 : 0) + g.items.length, 0) + gs.length - 1
  let best = 1, bestMax = Infinity
  for (let k = 1; k < groups.length; k++) {
    const l = height(groups.slice(0, k)), r = height(groups.slice(k))
    const m = Math.max(l, r)
    if (m < bestMax || (m === bestMax && l >= r)) { best = k; bestMax = m }
  }
  return { left: flatten(groups.slice(0, best)), right: flatten(groups.slice(best)) }
}

// Groups → cells, a blank row between groups.
function flatten(groups) {
  const out = []
  groups.forEach((g, i) => {
    if (i > 0) out.push({ kind: 'blank' })
    if (g.label) out.push({ kind: 'head', label: g.label })
    out.push(...g.items)
  })
  return out
}

const HEADINGS = ['Units', 'Pack', 'Product', 'Cost', 'Retail', 'Total']

/** One account's ticket onto an ExcelJS worksheet. */
export function writeTicketSheet(ws, { bakery, account, del_date, layout }) {
  // A–F left column, G a gutter, H–M right column.
  ;[5, 5, 22, 7, 7, 8, 2, 5, 5, 22, 7, 7, 8].forEach((w, i) => { ws.getColumn(i + 1).width = w })
  Object.assign(ws.pageSetup, {
    orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left: 0.5, right: 0.25, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    // Bakery name, date, account and column headings on every printed page.
    printTitlesRow: '1:5',
  })

  const font = (size, bold = true) => ({ name: 'Arial', size, bold })
  const L = 1, R = 8   // first column of each half

  if (bakery) {
    ws.mergeCells('A1:M1')
    ws.getCell('A1').value = bakery
    ws.getCell('A1').font = font(14)
    ws.getCell('A1').alignment = { horizontal: 'center' }
    ws.getRow(1).height = 18
  }
  ws.mergeCells('A3:F3')
  ws.getCell('A3').value = del_date
  ws.getCell('A3').font = font(11, false)
  ws.getCell('A3').alignment = { horizontal: 'center' }
  ws.mergeCells('A4:F4')
  ws.getCell('A4').value = account
  ws.getCell('A4').font = font(14)
  ws.getCell('A4').alignment = { horizontal: 'center' }
  ws.getRow(4).height = 18

  for (const c0 of [L, R]) {
    HEADINGS.forEach((h, i) => {
      const c = ws.getCell(5, c0 + i)
      c.value = h
      c.font = font(8)
      c.alignment = { horizontal: i === 2 ? 'left' : 'center' }
      c.border = { top: { style: 'thin' }, bottom: { style: 'thin' } }
    })
  }

  const put = (row, c0, item) => {
    if (!item || item.kind === 'blank') return
    if (item.kind === 'head') {
      const c = ws.getCell(row, c0 + 2)
      c.value = item.label.toUpperCase()
      c.font = font(8)
      c.border = { bottom: { style: 'thin' } }
      return
    }
    ;[item.units, item.pack, item.name, item.cost, item.retail, item.total].forEach((v, i) => {
      const c = ws.getCell(row, c0 + i)
      c.value = v
      c.font = font(8)
      if (i !== 2) c.alignment = { horizontal: 'center' }
      if (i >= 3) c.numFmt = MONEY_FMT
    })
  }

  let row = 6
  const block = ({ left, right }) => {
    const n = Math.max(left.length, right.length)
    for (let i = 0; i < n; i++) { put(row + i, L, left[i]); put(row + i, R, right[i]) }
    row += n
  }

  block(layout.regular)
  if (layout.gf) {
    row++
    for (const c0 of [L, R]) {
      for (let i = 0; i < 6; i++) {
        ws.getCell(row, c0 + i).border = { top: { style: 'medium' }, bottom: { style: 'thin' } }
      }
      ws.getCell(row, c0 + 2).value = 'GLUTEN FREE'
      ws.getCell(row, c0 + 2).font = font(8)
    }
    row++
    block(layout.gf)
  }

  row++
  const label = ws.getCell(row, R + 1)
  label.value = `Total   #${layout.units}`
  label.font = font(10)
  ws.mergeCells(row, R + 3, row, R + 5)
  const tv = ws.getCell(row, R + 3)
  tv.value = layout.total
  tv.font = font(10)
  tv.numFmt = MONEY_FMT
  tv.alignment = { horizontal: 'center' }
  tv.border = { top: { style: 'double' } }
}

/** One account's ticket as an HTML table, for the printable page. */
export function ticketTableHtml({ bakery, account, del_date, layout, esc }) {
  const cells = (item) => {
    if (!item || item.kind === 'blank') return '<td colspan="6">&nbsp;</td>'
    if (item.kind === 'head') return `<td colspan="2"></td><td class="grp" colspan="4">${esc(item.label)}</td>`
    return `<td class="c">${num(item.units)}</td><td class="c">${num(item.pack)}</td>` +
      `<td>${esc(item.name)}</td><td class="c">${money(item.cost)}</td>` +
      `<td class="c">${money(item.retail)}</td><td class="c">${money(item.total)}</td>`
  }
  const rows = ({ left, right }) =>
    Array.from({ length: Math.max(left.length, right.length) },
      (_, i) => `<tr>${cells(left[i])}<td class="gap"></td>${cells(right[i])}</tr>`).join('')

  const half = HEADINGS.map((h, i) => `<th${i === 2 ? ' class="p"' : ''}>${h}</th>`).join('')
  const gfHalf = '<td colspan="2"></td><td colspan="4">Gluten Free</td>'
  const col = '<col style="width:5%"><col style="width:5%"><col style="width:21%">' +
    '<col style="width:6%"><col style="width:6%"><col style="width:6%">'

  // In the thead so the browser repeats it at the top of each printed page.
  return `
    <table class="grid">
      <colgroup>${col}<col style="width:2%">${col}</colgroup>
      <thead>
        ${bakery ? `<tr><th colspan="13" class="bakery">${esc(bakery)}</th></tr>` : ''}
        <tr><th colspan="13" class="date">${esc(del_date)}</th></tr>
        <tr><th colspan="13" class="acct">${esc(account)}</th></tr>
        <tr class="cols">${half}<th class="gap"></th>${half}</tr>
      </thead>
      <tbody>
        ${rows(layout.regular)}
        ${layout.gf
          ? `<tr><td colspan="13">&nbsp;</td></tr>
             <tr class="gfhead">${gfHalf}<td class="gap"></td>${gfHalf}</tr>
             ${rows(layout.gf)}`
          : ''}
        <tr class="total">
          <td colspan="7"></td>
          <td colspan="3">Total &nbsp; #${num(layout.units)}</td>
          <td colspan="3" class="tv">${money(layout.total)}</td>
        </tr>
      </tbody>
    </table>`
}

export const TICKET_GRID_CSS = `
  table.grid { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .grid th, .grid td { font-size: 8pt; font-weight: 700; padding: 1px 3px; text-align: left;
                       overflow-wrap: anywhere; }
  .grid .bakery { font-size: 14pt; text-align: center; }
  .grid .date { font-size: 11pt; font-weight: 400; text-align: center; }
  .grid .acct { font-size: 14pt; text-align: center; padding-bottom: 4px; }
  .grid .cols th { border-top: 1px solid #000; border-bottom: 1px solid #000; text-align: center; }
  .grid .cols th.p { text-align: left; }
  .grid th.gap, .grid td.gap { border: none !important; }
  .grid td.c { text-align: center; }
  .grid td.grp { border-bottom: 1px solid #000; padding-top: 4px; }
  /* The boundary has to survive a black-and-white printer, so it is a rule,
     not a colour. */
  .grid .gfhead td { text-transform: uppercase; border-top: 2px solid #000;
                     border-bottom: 1px solid #000; padding-top: 4px; }
  .grid .total td { font-size: 10pt; padding-top: 8px; }
  .grid .total .tv { text-align: center; border-top: 3px double #000; }
`
