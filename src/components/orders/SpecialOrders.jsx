import { useState, useEffect, useMemo } from 'react'
import EditableCell from '../shared/EditableCell'

const EMPTY = { account: '', cust_name: '', location: '', prod_name: '', units: 0, price: 0, del_date: '', phone: '', notes: '' }

const CAL_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const CAL_DAYS   = ['Su','Mo','Tu','We','Th','Fr','Sa']
const pad2 = n => String(n).padStart(2, '0')

function MiniCalendar({ dates, selected, onSelect }) {
  const dateMap = useMemo(() => new Map(dates.map(d => [d.date, parseInt(d.count)])), [dates])

  const [cal, setCal] = useState(() => {
    // Prefer the selected date if it has orders; otherwise jump to the most recent date with orders
    const hasOrders = dates.some(d => d.date === selected)
    const base = (hasOrders && selected)
      ? selected
      : (dates[0]?.date || selected || new Date().toISOString().slice(0, 10))
    const d = new Date(base + 'T00:00:00')
    return { year: d.getFullYear(), month: d.getMonth() + 1 }
  })

  function prev() { setCal(c => c.month === 1  ? { year: c.year - 1, month: 12 } : { year: c.year, month: c.month - 1 }) }
  function next() { setCal(c => c.month === 12 ? { year: c.year + 1, month: 1  } : { year: c.year, month: c.month + 1 }) }

  const firstDow   = new Date(cal.year, cal.month - 1, 1).getDay()
  const daysInMon  = new Date(cal.year, cal.month, 0).getDate()

  const cells = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMon; d++) cells.push(d)

  const btnStyle = {
    border: 'none', background: 'transparent', cursor: 'pointer',
    color: 'var(--text-muted)', fontSize: 16, padding: '2px 8px', borderRadius: 4,
    lineHeight: 1,
  }

  return (
    <div style={{ padding: '12px 14px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <button style={btnStyle} onClick={prev}>‹</button>
        <span style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
          {CAL_MONTHS[cal.month - 1]} {cal.year}
        </span>
        <button style={btnStyle} onClick={next}>›</button>
      </div>

      {/* Day-of-week labels */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 3 }}>
        {CAL_DAYS.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 9, color: 'var(--text-muted)', fontWeight: 600 }}>{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map((day, i) => {
          if (!day) return <div key={`e${i}`} />
          const ds = `${cal.year}-${pad2(cal.month)}-${pad2(day)}`
          const count    = dateMap.get(ds)
          const hasDates = count !== undefined
          const isSel    = ds === selected

          return (
            <button key={day} onClick={() => hasDates && onSelect(ds)}
              title={hasDates ? `${count} order${count !== 1 ? 's' : ''}` : undefined}
              style={{
                padding: '4px 2px', border: 'none', borderRadius: 4,
                background: isSel
                  ? 'var(--primary)'
                  : hasDates
                  ? 'var(--primary-light, rgba(124,58,237,0.12))'
                  : 'transparent',
                color: isSel ? 'white' : hasDates ? 'var(--primary)' : 'var(--text-muted)',
                fontWeight: hasDates ? 700 : 400,
                fontSize: 11, cursor: hasDates ? 'pointer' : 'default',
                textAlign: 'center', lineHeight: 1.3,
                outline: isSel ? '2px solid var(--primary)' : 'none',
              }}
            >
              <div>{day}</div>
              {hasDates && (
                <div style={{ fontSize: 8, opacity: 0.75, lineHeight: 1 }}>{count}</div>
              )}
            </button>
          )
        })}
      </div>

      {/* Month summary */}
      {(() => {
        const prefix = `${cal.year}-${pad2(cal.month)}-`
        const monthTotal = dates.filter(d => d.date.startsWith(prefix)).reduce((s, d) => s + parseInt(d.count), 0)
        const monthDays  = dates.filter(d => d.date.startsWith(prefix)).length
        return monthDays > 0 ? (
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            {monthDays} date{monthDays !== 1 ? 's' : ''} · {monthTotal} orders this month
          </div>
        ) : (
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            No orders this month
          </div>
        )
      })()}
    </div>
  )
}

export default function SpecialOrders() {
  const [date, setDate]         = useState('')
  const [orders, setOrders]     = useState([])
  const [accounts, setAccounts] = useState([])
  const [products, setProducts] = useState([])
  const [locations, setLocations] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [newRow, setNewRow]     = useState(EMPTY)
  const [newType, setNewType]   = useState('')
  const [adding, setAdding]     = useState(false)
  // Bulk add: shared Location/Customer + many product lines added at once
  const emptyLine = () => ({ prod_name: '', units: '', price: '', notes: '' })
  const [bulkLoc, setBulkLoc]     = useState('')
  const [bulkCust, setBulkCust]   = useState('')
  const [bulkDel, setBulkDel]     = useState('')
  const [bulkPhone, setBulkPhone] = useState('')
  const [bulkLines, setBulkLines] = useState([emptyLine()])
  const [saving, setSaving]       = useState(false)
  const [dates, setDates]       = useState([])
  const [showCal, setShowCal]   = useState(false)
  const [bakeryName, setBakeryName] = useState('')
  const [locFont, setLocFont]   = useState(() => parseInt(localStorage.getItem('specord_locFont')) || 32)

  // Copy/repeat state
  const [copyFrom, setCopyFrom]       = useState('')
  const [copyTo, setCopyTo]           = useState('')
  const [copyLocation, setCopyLocation] = useState('')
  const [copying, setCopying]         = useState(false)
  const [copyMsg, setCopyMsg]         = useState('')

  useEffect(() => {
    fetch('/api/settings', { credentials: 'include' }).then(r => r.json())
      .then(s => {
        const d = s.baking_date || new Date().toISOString().slice(0, 10)
        setDate(d)
        const prev = new Date(d + 'T00:00:00'); prev.setDate(prev.getDate() - 7)
        setCopyFrom(prev.toISOString().slice(0, 10))
        setCopyTo(d)
        setBakeryName(s.bakery_name || '')
      }).catch(() => setDate(new Date().toISOString().slice(0, 10)))

    Promise.all([
      fetch('/api/accounts', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/products', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/spec-orders/dates', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/spec-orders/locations', { credentials: 'include' }).then(r => r.json()),
    ]).then(([a, p, d, locs]) => {
      setAccounts(Array.isArray(a) ? a : [])
      setProducts(Array.isArray(p) ? p : [])
      setDates(Array.isArray(d) ? d : [])
      setLocations(Array.isArray(locs) ? locs : [])
    })
  }, [])

  useEffect(() => { if (date) load() }, [date])

  function load() {
    setLoading(true)
    fetch(`/api/spec-orders?date=${date}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setOrders(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }

  async function addOrder() {
    if (!newRow.location || !newRow.prod_name) return
    try {
      const r = await fetch('/api/spec-orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        // Account is the same as Location — keep the account column in sync for back-end grouping
        body: JSON.stringify({ ...newRow, account: newRow.location, ordr_dt: date })
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setOrders(prev => [...prev, d])
      setNewRow(EMPTY); setNewType(''); setAdding(false)
    } catch (e) { setError(e.message) }
  }

  function openBulkAdd() {
    setBulkLoc(''); setBulkCust(''); setBulkDel(''); setBulkPhone(''); setBulkLines([emptyLine(), emptyLine(), emptyLine()])
    setError(''); setAdding(true)
  }
  function setLine(i, field, value) { setBulkLines(ls => ls.map((l, idx) => idx === i ? { ...l, [field]: value } : l)) }
  function addLine() { setBulkLines(ls => [...ls, emptyLine()]) }
  function removeLine(i) { setBulkLines(ls => ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls) }
  const bulkReady = bulkLines.filter(l => l.prod_name && (parseFloat(l.units) || 0) > 0)

  async function submitBulk() {
    if (!bulkLoc.trim()) { setError('Enter a Location.'); return }
    if (bulkReady.length === 0) { setError('Add at least one product with a quantity.'); return }
    setSaving(true); setError('')
    try {
      const created = []
      for (const l of bulkReady) {
        const r = await fetch('/api/spec-orders', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({
            account: bulkLoc, location: bulkLoc, cust_name: bulkCust, del_date: bulkDel || null, phone: bulkPhone,
            prod_name: l.prod_name, units: l.units, price: l.price || 0, notes: l.notes, ordr_dt: date
          })
        })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error)
        created.push(d)
      }
      setOrders(prev => [...prev, ...created])
      setAdding(false)
    } catch (e) { setError(`Add failed: ${e.message}`) }
    finally { setSaving(false) }
  }

  // Product <option>s grouped by type, for the bulk product selects
  function productOptions() {
    if (productTypes.length === 0) return products.map(p => <option key={p.prod_name} value={p.prod_name}>{p.prod_name}</option>)
    return (
      <>
        {productTypes.map(t => (
          <optgroup key={t} label={t}>
            {products.filter(p => p.prod_type === t).map(p => <option key={p.prod_name} value={p.prod_name}>{p.prod_name}</option>)}
          </optgroup>
        ))}
        {products.some(p => !p.prod_type) && (
          <optgroup label="Other">
            {products.filter(p => !p.prod_type).map(p => <option key={p.prod_name} value={p.prod_name}>{p.prod_name}</option>)}
          </optgroup>
        )}
      </>
    )
  }

  async function save(id, field, value) {
    try {
      await fetch(`/api/spec-orders/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ [field]: value })
      })
      setOrders(prev => prev.map(o => o.id === id ? { ...o, [field]: value } : o))
    } catch (e) { setError(e.message) }
  }

  async function del(id) {
    if (!confirm('Delete this special order?')) return
    await fetch(`/api/spec-orders/${id}`, { method: 'DELETE', credentials: 'include' })
    setOrders(prev => prev.filter(o => o.id !== id))
  }

  async function repeatOrders() {
    if (!copyFrom || !copyTo) return
    setCopying(true); setCopyMsg(''); setError('')
    try {
      const r = await fetch('/api/spec-orders/copy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ from_date: copyFrom, to_date: copyTo, ...(copyLocation ? { location: copyLocation } : {}) })
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setCopyMsg(`Copied ${d.copied} order${d.copied !== 1 ? 's' : ''} from ${copyFrom} → ${copyTo}`)
      if (copyTo === date) load()
      setTimeout(() => setCopyMsg(''), 5000)
    } catch (e) { setError(e.message) }
    finally { setCopying(false) }
  }

  // Print Special Order sheets — replicates the original VB6 "custreport" (spcrpt.Dsr):
  // one sheet per Customer + Location, grouped, with Qty / Product / Price / Notes / Subtotal and a Total.
  // Core renderer: takes an explicit list of order rows so it can print one order,
  // one location, or the whole day. Grouped by Location → one sheet per location.
  function printItems(items) {
    const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
    const money = n => '$' + (Number(n) || 0).toFixed(2)
    if (!items || items.length === 0) { setError('Nothing to print.'); return }

    // Group by Location — each location prints on its own sheet.
    const groups = []; const map = new Map()
    items.forEach(o => {
      const key = o.location || ''
      let g = map.get(key)
      if (!g) { g = { cust_name: o.cust_name || '', location: o.location || '', rows: [] }; map.set(key, g); groups.push(g) }
      g.rows.push(o)
    })
    const [y, m, d] = date.split('-')
    const dateStr = `${m}/${d}/${y}`
    const title = (bakeryName ? `${bakeryName}: ` : '') + 'Special Order'

    const sheets = groups.map(g => {
      const total = g.rows.reduce((s, o) => s + (parseFloat(o.units) || 0) * (parseFloat(o.price) || 0), 0)
      const rows = g.rows.map(o => {
        const u = parseFloat(o.units) || 0, p = parseFloat(o.price) || 0
        return `<tr><td class="qty">${u}</td><td>${esc(o.prod_name)}</td><td class="num">${p > 0 ? money(p) : ''}</td><td class="notes">${esc(o.notes)}</td><td class="num">${money(u * p)}</td></tr>`
      }).join('')
      return `<div class="sheet">
        <h1>${esc(title)}</h1>
        <div class="meta"><span class="lbl">Order Date:</span> ${dateStr}</div>
        ${g.cust_name ? `<div class="meta"><span class="lbl">Customer:</span> ${esc(g.cust_name)}</div>` : ''}
        <div class="meta loc"><span class="lbl">Location:</span> <span class="locval">${esc(g.location)}</span></div>
        <table>
          <thead><tr><th class="qty">Qty</th><th>Product Name</th><th class="num">Price</th><th class="notes">Notes</th><th class="num">Subtotal</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr><td colspan="4" class="tot-lbl">Total:</td><td class="num">${money(total)}</td></tr></tfoot>
        </table>
      </div>`
    }).join('')

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Special Orders ${dateStr}</title><style>
      *{box-sizing:border-box}
      body{font-family:Arial,Helvetica,sans-serif;color:#000;margin:0}
      .sheet{padding:.5in;page-break-after:always}
      .sheet:last-child{page-break-after:auto}
      h1{font-family:"Book Antiqua","Palatino Linotype",Georgia,serif;font-size:24px;font-weight:700;margin:0 0 14px}
      .meta{font-size:13px;margin:2px 0}
      .meta .lbl{display:inline-block;width:95px;font-weight:700;vertical-align:middle}
      .loc{margin:6px 0}
      .locval{font-size:${Math.max(10, Math.min(72, locFont))}px;font-weight:700;vertical-align:middle}
      table{width:100%;border-collapse:collapse;margin-top:14px;font-size:13px}
      th{text-align:left;border-bottom:2px solid #000;padding:5px 6px;font-style:italic;color:#004000}
      td{padding:4px 6px;border-bottom:1px solid #ccc;vertical-align:top}
      .qty{width:55px}
      .num{text-align:right;white-space:nowrap}
      .notes{color:#333}
      tfoot td{border-top:2px solid #000;border-bottom:none;font-weight:700;padding-top:7px;font-size:14px}
      .tot-lbl{text-align:right}
      @page{margin:.5in}
    </style></head><body>${sheets}</body></html>`

    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
    document.body.appendChild(iframe)
    const doc = iframe.contentWindow.document
    doc.open(); doc.write(html); doc.close()
    iframe.contentWindow.focus()
    setTimeout(() => {
      iframe.contentWindow.print()
      setTimeout(() => document.body.removeChild(iframe), 1500)
    }, 300)
  }

  // Print every order for the day with units > 0, honoring the Location filter
  // (one sheet per location). This is the bulk "Print Sheets" button.
  function printSheets() {
    const items = orders.filter(o => (parseFloat(o.units) || 0) > 0 && (!copyLocation || (o.location || '') === copyLocation))
    if (items.length === 0) { setError('No special orders with quantities to print for this date.'); return }
    printItems(items)
  }

  // Print a single order on its own sheet — used to tuck a slip in with that order.
  function printOne(o) { printItems([o]) }

  // Distinct product types for the Add-row type filter
  const productTypes = [...new Set(products.map(p => p.prod_type).filter(Boolean))].sort()

  // The Location dropdown filters the visible table AND scopes the repeat (below).
  const filtered = copyLocation ? orders.filter(o => (o.location || '') === copyLocation) : orders
  const totalUnits = filtered.reduce((s, o) => s + (parseFloat(o.units) || 0), 0)
  const totalRev   = filtered.reduce((s, o) => s + (parseFloat(o.units) || 0) * (parseFloat(o.price) || 0), 0)

  return (
    <div>
      <div className="page-toolbar" style={{ marginBottom: 8 }}>
        <label>Date: <input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        {dates.length > 0 && (
          <button className={`btn btn-sm ${showCal ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setShowCal(p => !p)}>
            {showCal ? '▲ Hide Calendar' : '▼ Calendar'}
          </button>
        )}
        <span className="toolbar-info">{filtered.length}{copyLocation ? ` of ${orders.length}` : ''} orders · {totalUnits} units · ${totalRev.toFixed(2)}</span>
        <div className="toolbar-spacer" />
        <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}
          title="Font size of the Location name on the printed sheet">
          Loc font:
          <input type="number" min="10" max="72" value={locFont}
            onChange={e => { const v = Math.max(10, Math.min(72, parseInt(e.target.value) || 32)); setLocFont(v); localStorage.setItem('specord_locFont', v) }}
            style={{ width: 50, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '3px 5px', fontSize: 12 }} />
        </label>
        <button className="btn btn-secondary btn-sm" onClick={printSheets}
          title={copyLocation ? `Print one sheet for ${copyLocation}` : 'Print one sheet per location for all orders this day'}>
          🖨 {copyLocation ? `Print ${copyLocation}` : 'Print Sheets'}
        </button>
        {!adding && <button className="btn btn-primary btn-sm" onClick={openBulkAdd}>+ Add Special Order</button>}
      </div>

      {/* Repeat row */}
      <div className="page-toolbar" style={{ marginBottom: 12 }}>
        <label>Copy from: <input type="date" value={copyFrom} onChange={e => setCopyFrom(e.target.value)} /></label>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>→</span>
        <label>To: <input type="date" value={copyTo} onChange={e => setCopyTo(e.target.value)} /></label>
        {locations.length > 0 && (
          <label>Location (filters list + repeat):
            <select value={copyLocation} onChange={e => setCopyLocation(e.target.value)}
              style={{ marginLeft: 4, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px 8px', fontSize: 13, background: copyLocation ? 'var(--primary-light)' : 'var(--surface)' }}>
              <option value="">All locations</option>
              {locations.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
        )}
        <button className="btn btn-secondary btn-sm" onClick={repeatOrders}
          disabled={copying || !copyFrom || !copyTo || copyFrom === copyTo}>
          {copying ? 'Copying…' : '⬇ Repeat Special Orders'}
        </button>
        {copyMsg && <span style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600 }}>{copyMsg}</span>}
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* Bulk add panel: choose Location/Customer once, then add many product lines at once */}
      {adding && (
        <div className="section-card" style={{ marginBottom: 12, padding: 12 }}>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 10, alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12, color: 'var(--text-muted)' }}>
              Location *
              <input type="text" autoFocus value={bulkLoc} list="spec-locations" placeholder="Location"
                onChange={e => setBulkLoc(e.target.value)}
                style={{ border: '2px solid var(--primary)', borderRadius: 'var(--radius-sm)', padding: '5px 8px', fontSize: 13, width: 180 }} />
              <datalist id="spec-locations">{locations.map(l => <option key={l} value={l} />)}</datalist>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12, color: 'var(--text-muted)' }}>
              Customer name
              <input type="text" value={bulkCust} placeholder="Customer name" onChange={e => setBulkCust(e.target.value)}
                style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '5px 8px', fontSize: 13, width: 160 }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12, color: 'var(--text-muted)' }}>
              Delivery date
              <input type="date" value={bulkDel} onChange={e => setBulkDel(e.target.value)}
                style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px 8px', fontSize: 13 }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12, color: 'var(--text-muted)' }}>
              Phone
              <input type="text" value={bulkPhone} placeholder="Phone" onChange={e => setBulkPhone(e.target.value)}
                style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '5px 8px', fontSize: 13, width: 130 }} />
            </label>
          </div>

          <table className="data-grid" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ minWidth: 200 }}>Product</th>
                <th style={{ width: 90, textAlign: 'right' }}>Qty</th>
                <th style={{ width: 90, textAlign: 'right' }}>Price</th>
                <th style={{ minWidth: 180 }}>Notes</th>
                <th style={{ width: 36 }}></th>
              </tr>
            </thead>
            <tbody>
              {bulkLines.map((l, i) => (
                <tr key={i}>
                  <td>
                    <select value={l.prod_name} onChange={e => setLine(i, 'prod_name', e.target.value)}
                      style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px', fontSize: 13 }}>
                      <option value="">— product —</option>
                      {productOptions()}
                    </select>
                  </td>
                  <td>
                    <input type="number" value={l.units} onChange={e => setLine(i, 'units', e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && i === bulkLines.length - 1) addLine() }}
                      style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px', textAlign: 'right', fontSize: 13 }} />
                  </td>
                  <td>
                    <input type="number" value={l.price} placeholder="0" onChange={e => setLine(i, 'price', e.target.value)}
                      style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px', textAlign: 'right', fontSize: 13 }} />
                  </td>
                  <td>
                    <input type="text" value={l.notes} placeholder="Notes" onChange={e => setLine(i, 'notes', e.target.value)}
                      style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px', fontSize: 13 }} />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button className="btn btn-danger btn-sm" style={{ padding: '2px 6px', fontSize: 11 }}
                      onClick={() => removeLine(i)} title="Remove this line" disabled={bulkLines.length === 1}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-secondary btn-sm" onClick={addLine}>+ Add product line</button>
            <div style={{ flex: 1 }} />
            <button className="btn btn-primary" onClick={submitBulk} disabled={saving || bulkReady.length === 0 || !bulkLoc.trim()}>
              {saving ? 'Adding…' : `Add All (${bulkReady.length})`}
            </button>
            <button className="btn btn-secondary" onClick={() => setAdding(false)} disabled={saving}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* Calendar sidebar */}
        {showCal && dates.length > 0 && (
          <div style={{
            flexShrink: 0, width: 230,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-sm)',
          }}>
            <MiniCalendar
              key={date}
              dates={dates}
              selected={date}
              onSelect={d => setDate(d)}
            />
          </div>
        )}

        {/* Table */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {loading ? <div className="loading">Loading…</div> : (
            <div className="grid-scroll-container">
              <table className="data-grid" style={{ minWidth: 1050 }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: 130 }}>Location</th>
                    <th style={{ minWidth: 120 }}>Customer</th>
                    <th style={{ minWidth: 160 }}>Product</th>
                    <th style={{ minWidth: 70, textAlign: 'right' }}>Units</th>
                    <th style={{ minWidth: 80, textAlign: 'right' }}>Price</th>
                    <th style={{ minWidth: 100 }}>Del Date</th>
                    <th style={{ minWidth: 120 }}>Phone</th>
                    <th style={{ minWidth: 200 }}>Notes</th>
                    <th style={{ width: 40, textAlign: 'center' }} title="Checked">✓</th>
                    <th style={{ width: 40, textAlign: 'center' }} title="Print this single order">🖨</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(o => (
                    <tr key={o.id} style={o.checked === false ? { opacity: 0.45 } : undefined}>
                      <td><EditableCell value={o.location||''} onSave={v=>save(o.id,'location',v)} type="text" align="left" /></td>
                      <td><EditableCell value={o.cust_name||''} onSave={v=>save(o.id,'cust_name',v)} type="text" align="left" /></td>
                      <td style={{ fontWeight: 500 }}>{o.prod_name}</td>
                      <td><EditableCell value={parseFloat(o.units)||0} onSave={v=>save(o.id,'units',v)} type="number" align="right" /></td>
                      <td><EditableCell value={parseFloat(o.price)||0} onSave={v=>save(o.id,'price',v)} type="number" align="right" formatter={v => v > 0 ? `$${parseFloat(v).toFixed(2)}` : ''} /></td>
                      <td>
                        <input type="date" value={o.del_date ? String(o.del_date).slice(0,10) : ''}
                          onChange={e => save(o.id, 'del_date', e.target.value || null)}
                          style={{ border: 'none', background: 'transparent', fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }} />
                      </td>
                      <td><EditableCell value={o.phone||''} onSave={v=>save(o.id,'phone',v)} type="text" align="left" /></td>
                      <td><EditableCell value={o.notes||''} onSave={v=>save(o.id,'notes',v)} type="text" align="left" /></td>
                      <td style={{ textAlign: 'center' }}>
                        <input type="checkbox" checked={o.checked !== false}
                          onChange={e => save(o.id, 'checked', e.target.checked)}
                          title="Uncheck to mark this order off — it stays in the list"
                          style={{ width: 16, height: 16, cursor: 'pointer' }} />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button type="button" onClick={() => printOne(o)}
                          title={`Print this order${o.location ? ` for ${o.location}` : ''} on its own sheet`}
                          style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: '2px 4px' }}>🖨</button>
                      </td>
                    </tr>
                  ))}


                  {filtered.length === 0 && !adding && (
                    <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                      {copyLocation
                        ? <>No special orders for {date} at location <strong>{copyLocation}</strong>.</>
                        : <>No special orders for {date}.</>}
                      {dates.length > 0 && !showCal && <span> Click <strong>Calendar</strong> to browse dates with orders.</span>}
                    </td></tr>
                  )}

                  {filtered.length > 0 && (
                    <tr className="totals-row">
                      <td colSpan={3}>Total</td>
                      <td className="total-cell">{totalUnits}</td>
                      <td className="total-cell">${totalRev.toFixed(2)}</td>
                      <td colSpan={4}></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
