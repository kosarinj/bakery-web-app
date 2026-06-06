import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import EditableCell from '../shared/EditableCell'

function prevDay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
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
            <div key={i}
              className={`cal-day${hasOrders ? ' cal-has-orders' : ''}${isSelected ? ' cal-selected' : ''}${isToday ? ' cal-today' : ''}`}
              onClick={() => { onChange(cell.ds); onClose() }}
            >{cell.d}</div>
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

  // Calendar
  const [calOpen, setCalOpen] = useState(false)
  const [calMonth, setCalMonth] = useState('')
  const [activeDates, setActiveDates] = useState(new Set())

  // Layout toggles
  const [hideEmptyRows, setHideEmptyRows] = useState(true)
  const [hideEmptyCols, setHideEmptyCols] = useState(true)
  const [flipped, setFlipped] = useState(false)

  // Filters
  const [filterProduct, setFilterProduct] = useState('')
  const [filterProductType, setFilterProductType] = useState('')
  const [filterAccount, setFilterAccount] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  // Copy / Repeat
  const [copyFrom, setCopyFrom] = useState('')
  const [copyTo, setCopyTo] = useState('')
  const [copying, setCopying] = useState(false)
  const [copyMsg, setCopyMsg] = useState('')
  const [showRepeatAccounts, setShowRepeatAccounts] = useState(false)
  const [repeatAccounts, setRepeatAccounts] = useState(null) // null = all

  const orderMapRef = useRef({})

  // Load settings
  useEffect(() => {
    fetch('/api/settings', { credentials: 'include' })
      .then(r => r.json())
      .then(s => {
        const d = s.baking_date || new Date().toISOString().slice(0, 10)
        const from = prevDay(d)
        setDate(d); setCopyFrom(from); setCopyTo(addDays(from, 7)); setCalMonth(d.slice(0, 7))
      })
      .catch(() => {
        const d = new Date().toISOString().slice(0, 10)
        const from = prevDay(d)
        setDate(d); setCopyFrom(from); setCopyTo(addDays(from, 7)); setCalMonth(d.slice(0, 7))
      })
  }, [])

  // Load active dates for calendar
  useEffect(() => {
    if (!calMonth) return
    fetch(`/api/orders/active-dates?month=${calMonth}`, { credentials: 'include' })
      .then(r => r.json())
      .then(dates => setActiveDates(new Set(Array.isArray(dates) ? dates : [])))
      .catch(() => {})
  }, [calMonth])

  // Load orders when date changes
  useEffect(() => {
    if (!date) return
    if (date.slice(0, 7) !== calMonth) setCalMonth(date.slice(0, 7))
    setLoading(true); setError('')
    const get = url => fetch(url, { credentials: 'include' })
      .then(r => r.json().then(d => { if (!r.ok) throw new Error(`${r.status}: ${d?.error || r.statusText}`); return d }))
    Promise.all([
      get('/api/accounts'),
      get('/api/products'),
      get(`/api/orders?date=${date}`),
    ])
      .then(([accts, prods, orders]) => {
        if (!Array.isArray(accts)) { setError(`Accounts: ${accts?.error || 'load failed'}`); setLoading(false); return }
        if (!Array.isArray(prods)) { setError(`Products: ${prods?.error || 'load failed'}`); setLoading(false); return }
        setAccounts(accts); setProducts(prods)
        const map = {}
        ;(Array.isArray(orders) ? orders : []).forEach(o => {
          map[`${o.account}|${o.prod_name}`] = { id: o.id, units: parseFloat(o.units) || 0 }
        })
        setOrderMap(map); orderMapRef.current = map; setLoading(false)
      })
      .catch(e => { setError(String(e.message || e)); setLoading(false) })
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
    if (!copyFrom || !copyTo) return
    setCopying(true); setCopyMsg(''); setError('')
    const accountsList = repeatAccounts ? [...repeatAccounts] : null
    try {
      const r = await fetch('/api/orders/copy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ from_date: copyFrom, to_date: copyTo, ...(accountsList ? { accounts: accountsList } : {}) })
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error)
      // If copied to current date, merge into orderMap
      if (copyTo === date) {
        const updated = { ...orderMapRef.current }
        ;(Array.isArray(data.rows) ? data.rows : []).forEach(o => {
          updated[`${o.account}|${o.prod_name}`] = { id: o.id, units: parseFloat(o.units) || 0 }
        })
        orderMapRef.current = updated; setOrderMap(updated)
      }
      const acctNote = accountsList ? ` (${accountsList.length} accounts)` : ''
      setCopyMsg(`Copied ${data.copied} order${data.copied !== 1 ? 's' : ''} from ${copyFrom} → ${copyTo}${acctNote}`)
      setTimeout(() => setCopyMsg(''), 5000)
    } catch (e) { setError(`Copy failed: ${e.message}`) }
    finally { setCopying(false) }
  }

  // Derived lists
  const productTypes = useMemo(() =>
    [...new Set(products.map(p => p.prod_type).filter(Boolean))].sort()
  , [products])

  const visibleProducts = useMemo(() => {
    let p = Array.isArray(products) ? products : []
    if (filterProductType) p = p.filter(x => x.prod_type === filterProductType)
    if (filterProduct) p = p.filter(x => (x.prod_name||'').toLowerCase().includes(filterProduct.toLowerCase()))
    if (hideEmptyCols) p = p.filter(x => accounts.some(a => (orderMap[`${a.name}|${x.prod_name}`]?.units || 0) > 0))
    return p
  }, [products, filterProductType, filterProduct, hideEmptyCols, accounts, orderMap])

  const visibleAccounts = useMemo(() => {
    let a = Array.isArray(accounts) ? accounts : []
    if (filterAccount) a = a.filter(x => (x.name||'').toLowerCase().includes(filterAccount.toLowerCase()))
    if (repeatAccounts !== null) a = a.filter(x => repeatAccounts.has(x.name))
    if (hideEmptyRows) a = a.filter(x => visibleProducts.some(p => (orderMap[`${x.name}|${p.prod_name}`]?.units || 0) > 0))
    return a
  }, [accounts, filterAccount, repeatAccounts, hideEmptyRows, visibleProducts, orderMap])

  // Totals
  const rowTotal = useCallback((key1) =>
    (flipped ? visibleAccounts : visibleProducts).reduce((s, key2) => {
      const [acct, prod] = flipped ? [key2.name, key1.prod_name] : [key1.name, key2.prod_name]
      return s + (orderMap[`${acct}|${prod}`]?.units || 0)
    }, 0)
  , [flipped, visibleAccounts, visibleProducts, orderMap])

  const colTotal = useCallback((key2) =>
    (flipped ? visibleProducts : visibleAccounts).reduce((s, key1) => {
      const [acct, prod] = flipped ? [key2.name, key1.prod_name] : [key1.name, key2.prod_name]
      return s + (orderMap[`${acct}|${prod}`]?.units || 0)
    }, 0)
  , [flipped, visibleAccounts, visibleProducts, orderMap])

  const grandTotal = useMemo(() =>
    visibleAccounts.reduce((s, a) =>
      s + visibleProducts.reduce((ss, p) => ss + (orderMap[`${a.name}|${p.prod_name}`]?.units || 0), 0)
    , 0)
  , [visibleAccounts, visibleProducts, orderMap])

  if (loading) return <div className="loading">Loading orders...</div>

  const rows    = flipped ? visibleProducts : visibleAccounts
  const cols    = flipped ? visibleAccounts : visibleProducts
  const rowKey  = r => flipped ? r.prod_name : r.name
  const colKey  = c => flipped ? c.name : c.prod_name
  const rowLabel = r => flipped ? r.prod_name : r.name
  const colLabel = c => flipped ? c.name : c.prod_name
  const cellVal  = (r, c) => {
    const [acct, prod] = flipped ? [c.name, r.prod_name] : [r.name, c.prod_name]
    return orderMap[`${acct}|${prod}`]?.units ?? 0
  }
  const onSave = (r, c) => v => {
    const [acct, prod] = flipped ? [c.name, r.prod_name] : [r.name, c.prod_name]
    saveCell(acct, prod, v, date)
  }

  const dateDisplay = date
    ? new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    : '—'

  const filtersActive = !!(filterProduct || filterProductType || filterAccount)

  return (
    <div>
      {/* ── Toolbar row 1 ── */}
      <div className="page-toolbar" style={{ marginBottom: 6 }}>
        <div style={{ position: 'relative' }}>
          <button className="btn btn-secondary btn-sm"
            style={{ fontWeight: 600, minWidth: 170, justifyContent: 'flex-start' }}
            onClick={() => setCalOpen(o => !o)}>
            📅 {dateDisplay}
          </button>
          {calOpen && (
            <MiniCalendar value={date} activeDates={activeDates}
              onChange={d => { setDate(d); const f = prevDay(d); setCopyFrom(f); setCopyTo(addDays(f, 7)) }}
              onMonthChange={m => setCalMonth(m)}
              onClose={() => setCalOpen(false)} />
          )}
        </div>

        <button className={`btn btn-sm ${hideEmptyRows ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setHideEmptyRows(v => !v)} title="Hide rows with no orders">
          {hideEmptyRows ? '▣' : '▢'} Rows
        </button>
        <button className={`btn btn-sm ${hideEmptyCols ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setHideEmptyCols(v => !v)} title="Hide columns with no orders">
          {hideEmptyCols ? '▣' : '▢'} Cols
        </button>
        <button className={`btn btn-sm ${flipped ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setFlipped(v => !v)} title="Swap rows and columns">
          ⇄ Flip
        </button>
        <button className={`btn btn-sm ${filtersActive ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setShowFilters(v => !v)}>
          🔍 Filter{filtersActive ? ' ●' : ''}
        </button>

        <span className="toolbar-info">
          {visibleAccounts.length} accts · {visibleProducts.length} prods
        </span>
      </div>

      {/* ── Filter row ── */}
      {showFilters && (
        <div className="page-toolbar" style={{ marginBottom: 6, background: 'var(--border-light)', padding: '8px 10px', borderRadius: 'var(--radius-sm)' }}>
          <label>
            Product:
            <input type="text" placeholder="search…" value={filterProduct}
              onChange={e => setFilterProduct(e.target.value)}
              style={{ width: 140 }} />
          </label>
          <label>
            Type:
            <select value={filterProductType} onChange={e => setFilterProductType(e.target.value)}
              style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '5px 8px', fontSize: 13 }}>
              <option value="">— all types —</option>
              {productTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label>
            Account:
            <input type="text" placeholder="search…" value={filterAccount}
              onChange={e => setFilterAccount(e.target.value)}
              style={{ width: 140 }} />
          </label>
          <button className="btn btn-secondary btn-sm"
            onClick={() => { setFilterProduct(''); setFilterProductType(''); setFilterAccount('') }}>
            Clear
          </button>
        </div>
      )}

      {/* ── Copy / Repeat row ── */}
      <div className="page-toolbar" style={{ marginBottom: 12 }}>
        <label>From:
          <input type="date" value={copyFrom} onChange={e => { setCopyFrom(e.target.value); setCopyTo(addDays(e.target.value, 7)) }} />
        </label>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>→</span>
        <label>To:
          <input type="date" value={copyTo} onChange={e => setCopyTo(e.target.value)} />
        </label>
        <button className="btn btn-secondary btn-sm"
          onClick={copyOrders} disabled={copying || !copyFrom || !copyTo || copyFrom === copyTo}>
          {copying ? 'Copying…' : '⬇ Repeat Orders'}
        </button>
        <button className={`btn btn-sm ${showRepeatAccounts ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => {
            if (!showRepeatAccounts && repeatAccounts === null) {
              setRepeatAccounts(new Set(accounts.map(a => a.name)))
            }
            setShowRepeatAccounts(v => !v)
          }}
          title="Filter grid and repeat orders to selected accounts">
          👥 {repeatAccounts ? `${repeatAccounts.size} accounts` : 'Filter Accounts'}
        </button>
        {copyMsg && <span style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600 }}>{copyMsg}</span>}
      </div>

      {/* ── Account selector for repeat ── */}
      {showRepeatAccounts && repeatAccounts && (
        <div style={{
          marginBottom: 12, padding: '10px 12px', background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
          maxHeight: 200, overflowY: 'auto'
        }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-sm"
              onClick={() => setRepeatAccounts(new Set(accounts.map(a => a.name)))}>All</button>
            <button className="btn btn-secondary btn-sm"
              onClick={() => setRepeatAccounts(new Set())}>None</button>
            <button className="btn btn-primary btn-sm"
              onClick={() => setRepeatAccounts(new Set(
                accounts
                  .filter(a => products.some(p => (orderMap[`${a.name}|${p.prod_name}`]?.units || 0) > 0))
                  .map(a => a.name)
              ))}>
              ✓ Accounts with Orders
            </button>
            <button className="btn btn-secondary btn-sm"
              onClick={() => { setRepeatAccounts(null); setShowRepeatAccounts(false) }}>
              Clear filter
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
            {accounts.map(a => (
              <label key={a.name} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, cursor: 'pointer', minWidth: 160 }}>
                <input type="checkbox"
                  checked={repeatAccounts.has(a.name)}
                  onChange={e => {
                    const next = new Set(repeatAccounts)
                    e.target.checked ? next.add(a.name) : next.delete(a.name)
                    setRepeatAccounts(next)
                  }} />
                {a.name}
              </label>
            ))}
          </div>
        </div>
      )}

      {error && <div className="error-message">{error}</div>}
      {accounts.length === 0 && <div className="empty-state">No accounts found. Add accounts in the Accounts tab first.</div>}
      {products.length === 0 && <div className="empty-state">No products found. Add products in the Products tab first.</div>}

      {accounts.length > 0 && products.length > 0 && (
        <div className="grid-scroll-container">
          <table className="data-grid">
            <thead>
              <tr>
                <th className="sticky-col" style={{ minWidth: 130 }}>
                  {flipped ? 'Product' : 'Account'}
                </th>
                {cols.map(c => (
                  <th key={colKey(c)} title={flipped ? (c.route||'') : (c.prod_group||'')}
                    style={{ textAlign: 'right', minWidth: 60 }}>
                    {colLabel(c)}
                  </th>
                ))}
                <th style={{ textAlign: 'right', minWidth: 60 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const rt = (flipped ? visibleAccounts : visibleProducts).reduce((s, c) => {
                  const [acct, prod] = flipped ? [c.name, r.prod_name] : [r.name, c.prod_name]
                  return s + (orderMap[`${acct}|${prod}`]?.units || 0)
                }, 0)
                return (
                  <tr key={rowKey(r)}>
                    <td className="sticky-col acct-name">{rowLabel(r)}</td>
                    {cols.map(c => {
                      const val = cellVal(r, c)
                      return (
                        <td key={colKey(c)} className={`order-cell${val > 0 ? ' order-cell-filled' : ''}`}>
                          <EditableCell value={val} onSave={onSave(r, c)} type="number" align="right" />
                        </td>
                      )
                    })}
                    <td className="total-cell">{rt || ''}</td>
                  </tr>
                )
              })}
              <tr className="totals-row">
                <td className="sticky-col">Total</td>
                {cols.map(c => <td key={colKey(c)} className="total-cell">{colTotal(c) || ''}</td>)}
                <td className="total-cell">{grandTotal || ''}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
