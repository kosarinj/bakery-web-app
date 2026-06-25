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
  const [adding, setAdding]     = useState(false)
  const [dates, setDates]       = useState([])
  const [showCal, setShowCal]   = useState(false)

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
    if (!newRow.account || !newRow.prod_name) return
    try {
      const r = await fetch('/api/spec-orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ ...newRow, ordr_dt: date })
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setOrders(prev => [...prev, d])
      setNewRow(EMPTY); setAdding(false)
    } catch (e) { setError(e.message) }
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
        {!adding && <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>+ Add Special Order</button>}
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
                    <th style={{ minWidth: 140 }}>Account</th>
                    <th style={{ minWidth: 120 }}>Customer</th>
                    <th style={{ minWidth: 120 }}>Location</th>
                    <th style={{ minWidth: 160 }}>Product</th>
                    <th style={{ minWidth: 70, textAlign: 'right' }}>Units</th>
                    <th style={{ minWidth: 80, textAlign: 'right' }}>Price</th>
                    <th style={{ minWidth: 100 }}>Del Date</th>
                    <th style={{ minWidth: 120 }}>Phone</th>
                    <th style={{ minWidth: 200 }}>Notes</th>
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(o => (
                    <tr key={o.id}>
                      <td style={{ fontWeight: 500 }}>{o.account}</td>
                      <td><EditableCell value={o.cust_name||''} onSave={v=>save(o.id,'cust_name',v)} type="text" align="left" /></td>
                      <td><EditableCell value={o.location||''} onSave={v=>save(o.id,'location',v)} type="text" align="left" /></td>
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
                        <button className="btn btn-danger btn-sm" style={{ padding: '2px 6px', fontSize: 11 }} onClick={() => del(o.id)}>✕</button>
                      </td>
                    </tr>
                  ))}

                  {adding && (
                    <tr style={{ background: 'var(--cell-edit-bg)' }}>
                      <td>
                        <select autoFocus value={newRow.account} onChange={e => setNewRow(p => ({ ...p, account: e.target.value }))}
                          style={{ width: '100%', border: '2px solid var(--primary)', borderRadius: 'var(--radius-sm)', padding: '4px', fontSize: 13 }}>
                          <option value="">— account —</option>
                          {accounts.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
                        </select>
                      </td>
                      <td>
                        <input type="text" placeholder="Customer name" value={newRow.cust_name}
                          onChange={e => setNewRow(p => ({ ...p, cust_name: e.target.value }))}
                          style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px', fontSize: 13 }} />
                      </td>
                      <td>
                        <input type="text" placeholder="Location" value={newRow.location} list="spec-locations"
                          onChange={e => setNewRow(p => ({ ...p, location: e.target.value }))}
                          style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px', fontSize: 13 }} />
                        <datalist id="spec-locations">
                          {locations.map(l => <option key={l} value={l} />)}
                        </datalist>
                      </td>
                      <td>
                        <select value={newRow.prod_name} onChange={e => setNewRow(p => ({ ...p, prod_name: e.target.value }))}
                          style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px', fontSize: 13 }}>
                          <option value="">— product —</option>
                          {products.map(p => <option key={p.prod_name} value={p.prod_name}>{p.prod_name}</option>)}
                        </select>
                      </td>
                      <td>
                        <input type="number" value={newRow.units} onChange={e => setNewRow(p => ({ ...p, units: e.target.value }))}
                          style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px', textAlign: 'right', fontSize: 13 }} />
                      </td>
                      <td>
                        <input type="number" value={newRow.price} onChange={e => setNewRow(p => ({ ...p, price: e.target.value }))}
                          style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px', textAlign: 'right', fontSize: 13 }} />
                      </td>
                      <td>
                        <input type="date" value={newRow.del_date} onChange={e => setNewRow(p => ({ ...p, del_date: e.target.value }))}
                          style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px', fontSize: 13 }} />
                      </td>
                      <td>
                        <input type="text" placeholder="Phone" value={newRow.phone}
                          onChange={e => setNewRow(p => ({ ...p, phone: e.target.value }))}
                          style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px', fontSize: 13 }} />
                      </td>
                      <td>
                        <input type="text" placeholder="Notes" value={newRow.notes}
                          onChange={e => setNewRow(p => ({ ...p, notes: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') addOrder(); if (e.key === 'Escape') { setAdding(false); setNewRow(EMPTY) } }}
                          style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px', fontSize: 13 }} />
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-primary btn-sm" style={{ marginRight: 4 }} onClick={addOrder}>Add</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => { setAdding(false); setNewRow(EMPTY) }}>✕</button>
                      </td>
                    </tr>
                  )}

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
                      <td colSpan={4}>Total</td>
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
