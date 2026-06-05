import { useState, useEffect, useRef, useCallback } from 'react'
import EditableCell from '../shared/EditableCell'

function prevDay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

function MiniCalendar({ value, activeDates, onChange, onMonthChange, onClose }) {
  const [month, setMonth] = useState(value ? value.slice(0, 7) : new Date().toISOString().slice(0, 7))
  const ref = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  const year = parseInt(month.slice(0, 4))
  const mon  = parseInt(month.slice(5, 7)) - 1
  const firstDow    = new Date(year, mon, 1).getDay()
  const daysInMonth = new Date(year, mon + 1, 0).getDate()
  const today = new Date().toISOString().slice(0, 10)

  function navigate(dir) {
    const d = new Date(year, mon + dir, 1)
    const nm = d.toISOString().slice(0, 7)
    setMonth(nm)
    onMonthChange(nm)
  }

  const cells = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${year}-${String(mon + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push({ d, ds })
  }

  return (
    <div className="cal-dropdown" ref={ref}>
      <div className="cal-header">
        <button className="cal-nav" onClick={() => navigate(-1)}>◀</button>
        <span className="cal-month-label">
          {new Date(year, mon).toLocaleString('default', { month: 'long', year: 'numeric' })}
        </span>
        <button className="cal-nav" onClick={() => navigate(1)}>▶</button>
      </div>
      <div className="cal-grid">
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => <div key={d} className="cal-dow">{d}</div>)}
        {cells.map((cell, i) => {
          if (!cell) return <div key={i} className="cal-blank" />
          const isSelected = cell.ds === value
          const isToday    = cell.ds === today
          const hasOrders  = activeDates.has(cell.ds)
          return (
            <div
              key={i}
              className={`cal-day${hasOrders ? ' cal-has-orders' : ''}${isSelected ? ' cal-selected' : ''}${isToday ? ' cal-today' : ''}`}
              onClick={() => { onChange(cell.ds); onClose() }}
            >
              {cell.d}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function OrdersGrid() {
  const [date, setDate] = useState('')
  const [accounts, setAccounts] = useState([])
  const [products, setProducts] = useState([])
  const [orderMap, setOrderMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copyFrom, setCopyFrom] = useState('')
  const [copying, setCopying] = useState(false)
  const [copyMsg, setCopyMsg] = useState('')
  const [calOpen, setCalOpen] = useState(false)
  const [calMonth, setCalMonth] = useState('')
  const [activeDates, setActiveDates] = useState(new Set())
  const [hideEmptyRows, setHideEmptyRows] = useState(false)
  const [hideEmptyCols, setHideEmptyCols] = useState(false)
  const orderMapRef = useRef({})

  useEffect(() => {
    fetch('/api/settings', { credentials: 'include' })
      .then(r => r.json())
      .then(s => {
        const d = s.baking_date || new Date().toISOString().slice(0, 10)
        setDate(d)
        setCopyFrom(prevDay(d))
        setCalMonth(d.slice(0, 7))
      })
      .catch(() => {
        const d = new Date().toISOString().slice(0, 10)
        setDate(d); setCopyFrom(prevDay(d)); setCalMonth(d.slice(0, 7))
      })
  }, [])

  useEffect(() => {
    if (!calMonth) return
    fetch(`/api/orders/active-dates?month=${calMonth}`, { credentials: 'include' })
      .then(r => r.json())
      .then(dates => setActiveDates(new Set(dates)))
  }, [calMonth])

  useEffect(() => {
    if (!date) return
    if (date.slice(0, 7) !== calMonth) setCalMonth(date.slice(0, 7))
    setLoading(true); setError('')
    Promise.all([
      fetch('/api/accounts', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/products', { credentials: 'include' }).then(r => r.json()),
      fetch(`/api/orders?date=${date}`, { credentials: 'include' }).then(r => r.json()),
    ])
      .then(([accts, prods, orders]) => {
        setAccounts(accts); setProducts(prods)
        const map = {}
        orders.forEach(o => {
          map[`${o.account}|${o.prod_name}`] = { id: o.id, units: parseFloat(o.units) || 0 }
        })
        setOrderMap(map); orderMapRef.current = map; setLoading(false)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [date])

  const saveCell = useCallback(async (account, prod_name, units, curDate) => {
    const key = `${account}|${prod_name}`
    const existing = orderMapRef.current[key]
    try {
      if (existing) {
        await fetch(`/api/orders/${existing.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ units })
        })
        const updated = { ...orderMapRef.current, [key]: { ...existing, units } }
        orderMapRef.current = updated; setOrderMap(updated)
      } else {
        const r = await fetch('/api/orders', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ prod_name, account, units, ordr_dt: curDate })
        })
        const row = await r.json()
        const updated = { ...orderMapRef.current, [key]: { id: row.id, units: parseFloat(row.units) || 0 } }
        orderMapRef.current = updated; setOrderMap(updated)
      }
    } catch (e) { setError(`Save failed: ${e.message}`) }
  }, [])

  async function copyOrders() {
    if (!copyFrom || !date) return
    setCopying(true); setCopyMsg(''); setError('')
    try {
      const r = await fetch('/api/orders/copy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ from_date: copyFrom, to_date: date })
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error)
      const updated = { ...orderMapRef.current }
      data.rows.forEach(o => {
        updated[`${o.account}|${o.prod_name}`] = { id: o.id, units: parseFloat(o.units) || 0 }
      })
      orderMapRef.current = updated; setOrderMap(updated)
      setCopyMsg(`Copied ${data.copied} order${data.copied !== 1 ? 's' : ''} from ${copyFrom}`)
      setTimeout(() => setCopyMsg(''), 4000)
    } catch (e) { setError(`Copy failed: ${e.message}`) }
    finally { setCopying(false) }
  }

  const visibleProducts = hideEmptyCols
    ? products.filter(p => accounts.some(a => (orderMap[`${a.name}|${p.prod_name}`]?.units || 0) > 0))
    : products

  const visibleAccounts = hideEmptyRows
    ? accounts.filter(a => visibleProducts.some(p => (orderMap[`${a.name}|${p.prod_name}`]?.units || 0) > 0))
    : accounts

  const colTotal = p => visibleAccounts.reduce((s, a) => s + (orderMapRef.current[`${a.name}|${p.prod_name}`]?.units || 0), 0)
  const grandTotal = visibleAccounts.reduce((s, a) =>
    s + visibleProducts.reduce((ss, p) => ss + (orderMap[`${a.name}|${p.prod_name}`]?.units || 0), 0), 0)

  if (loading) return <div className="loading">Loading orders...</div>

  const dateDisplay = date
    ? new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    : '—'

  return (
    <div>
      <div className="page-toolbar">
        {/* Date picker with mini calendar */}
        <div style={{ position: 'relative' }}>
          <button
            className="btn btn-secondary btn-sm"
            style={{ fontWeight: 600, minWidth: 170, justifyContent: 'flex-start' }}
            onClick={() => setCalOpen(o => !o)}
          >
            📅 {dateDisplay}
          </button>
          {calOpen && (
            <MiniCalendar
              value={date}
              activeDates={activeDates}
              onChange={d => { setDate(d); setCopyFrom(prevDay(d)) }}
              onMonthChange={m => setCalMonth(m)}
              onClose={() => setCalOpen(false)}
            />
          )}
        </div>

        {/* Row / col filters */}
        <button
          className={`btn btn-sm ${hideEmptyRows ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setHideEmptyRows(v => !v)}
          title="Hide accounts with no orders on this date"
        >
          {hideEmptyRows ? '▣' : '▢'} Rows
        </button>
        <button
          className={`btn btn-sm ${hideEmptyCols ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setHideEmptyCols(v => !v)}
          title="Hide products with no orders on this date"
        >
          {hideEmptyCols ? '▣' : '▢'} Cols
        </button>

        <span className="toolbar-info">
          {visibleAccounts.length} accounts · {visibleProducts.length} products
        </span>
        <div className="toolbar-spacer" />

        <label>
          Copy from:
          <input type="date" value={copyFrom} onChange={e => setCopyFrom(e.target.value)} />
        </label>
        <button className="btn btn-secondary btn-sm" onClick={copyOrders}
          disabled={copying || !copyFrom || copyFrom === date}>
          {copying ? 'Copying…' : '⬇ Repeat Orders'}
        </button>
        {copyMsg && <span style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600 }}>{copyMsg}</span>}
      </div>

      {error && <div className="error-message">{error}</div>}
      {accounts.length === 0 && <div className="empty-state">No accounts found. Add accounts in the Accounts tab first.</div>}
      {products.length === 0 && <div className="empty-state">No products found. Add products in the Products tab first.</div>}

      {accounts.length > 0 && products.length > 0 && (
        <div className="grid-scroll-container">
          <table className="data-grid">
            <thead>
              <tr>
                <th className="sticky-col" style={{ minWidth: 130 }}>Account</th>
                {visibleProducts.map(p => (
                  <th key={p.prod_name} title={p.prod_group || ''} style={{ textAlign: 'right', minWidth: 60 }}>
                    {p.prod_name}
                  </th>
                ))}
                <th style={{ textAlign: 'right', minWidth: 60 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {visibleAccounts.map(acc => {
                const rowTotal = visibleProducts.reduce(
                  (sum, p) => sum + (orderMap[`${acc.name}|${p.prod_name}`]?.units || 0), 0)
                return (
                  <tr key={acc.name}>
                    <td className="sticky-col acct-name" title={acc.route || ''}>{acc.name}</td>
                    {visibleProducts.map(p => {
                      const key = `${acc.name}|${p.prod_name}`
                      const val = orderMap[key]?.units ?? 0
                      return (
                        <td key={p.prod_name} className={`order-cell${val > 0 ? ' order-cell-filled' : ''}`}>
                          <EditableCell
                            value={val}
                            onSave={v => saveCell(acc.name, p.prod_name, v, date)}
                            type="number" align="right"
                          />
                        </td>
                      )
                    })}
                    <td className="total-cell">{rowTotal || ''}</td>
                  </tr>
                )
              })}
              <tr className="totals-row">
                <td className="sticky-col">Total</td>
                {visibleProducts.map(p => <td key={p.prod_name} className="total-cell">{colTotal(p) || ''}</td>)}
                <td className="total-cell">{grandTotal || ''}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
