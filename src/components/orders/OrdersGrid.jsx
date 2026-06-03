import { useState, useEffect, useRef, useCallback } from 'react'
import EditableCell from '../shared/EditableCell'

function prevDay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
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
  const orderMapRef = useRef({})

  useEffect(() => {
    fetch('/api/settings', { credentials: 'include' })
      .then(r => r.json())
      .then(s => {
        const d = s.baking_date || new Date().toISOString().slice(0, 10)
        setDate(d)
        setCopyFrom(prevDay(d))
      })
      .catch(() => {
        const d = new Date().toISOString().slice(0, 10)
        setDate(d)
        setCopyFrom(prevDay(d))
      })
  }, [])

  useEffect(() => {
    if (!date) return
    setLoading(true)
    setError('')
    Promise.all([
      fetch('/api/accounts', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/products', { credentials: 'include' }).then(r => r.json()),
      fetch(`/api/orders?date=${date}`, { credentials: 'include' }).then(r => r.json()),
    ])
      .then(([accts, prods, orders]) => {
        setAccounts(accts)
        setProducts(prods)
        const map = {}
        orders.forEach(o => {
          map[`${o.account}|${o.prod_name}`] = { id: o.id, units: parseFloat(o.units) || 0 }
        })
        setOrderMap(map)
        orderMapRef.current = map
        setLoading(false)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [date])

  const saveCell = useCallback(async (account, prod_name, units, curDate) => {
    const key = `${account}|${prod_name}`
    const existing = orderMapRef.current[key]
    try {
      if (existing) {
        await fetch(`/api/orders/${existing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ units })
        })
        const updated = { ...orderMapRef.current, [key]: { ...existing, units } }
        orderMapRef.current = updated
        setOrderMap(updated)
      } else {
        const r = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ prod_name, account, units, ordr_dt: curDate })
        })
        const row = await r.json()
        const updated = { ...orderMapRef.current, [key]: { id: row.id, units: parseFloat(row.units) || 0 } }
        orderMapRef.current = updated
        setOrderMap(updated)
      }
    } catch (e) {
      setError(`Save failed: ${e.message}`)
    }
  }, [])

  async function copyOrders() {
    if (!copyFrom || !date) return
    setCopying(true)
    setCopyMsg('')
    setError('')
    try {
      const r = await fetch('/api/orders/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ from_date: copyFrom, to_date: date })
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error)

      // Merge copied rows into orderMap
      const updated = { ...orderMapRef.current }
      data.rows.forEach(o => {
        updated[`${o.account}|${o.prod_name}`] = { id: o.id, units: parseFloat(o.units) || 0 }
      })
      orderMapRef.current = updated
      setOrderMap(updated)
      setCopyMsg(`Copied ${data.copied} order${data.copied !== 1 ? 's' : ''} from ${copyFrom}`)
      setTimeout(() => setCopyMsg(''), 4000)
    } catch (e) {
      setError(`Copy failed: ${e.message}`)
    } finally {
      setCopying(false)
    }
  }

  const colTotal = (prod_name) =>
    accounts.reduce((sum, a) => sum + (orderMapRef.current[`${a.name}|${prod_name}`]?.units || 0), 0)

  const grandTotal = accounts.reduce((sum, a) =>
    sum + products.reduce((s, p) => s + (orderMap[`${a.name}|${p.prod_name}`]?.units || 0), 0)
  , 0)

  if (loading) return <div className="loading">Loading orders...</div>

  return (
    <div>
      <div className="page-toolbar">
        <label>
          Date:
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </label>
        <span className="toolbar-info">
          {accounts.length} accounts &middot; {products.length} products
        </span>
        <div className="toolbar-spacer" />
        <label>
          Copy from:
          <input type="date" value={copyFrom} onChange={e => setCopyFrom(e.target.value)} />
        </label>
        <button
          className="btn btn-secondary btn-sm"
          onClick={copyOrders}
          disabled={copying || !copyFrom || copyFrom === date}
          title="Copy orders from the selected date into the current date (skips cells already filled)"
        >
          {copying ? 'Copying…' : '⬇ Repeat Orders'}
        </button>
        {copyMsg && (
          <span style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600 }}>{copyMsg}</span>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}

      {accounts.length === 0 && (
        <div className="empty-state">No accounts found. Add accounts in the Accounts tab first.</div>
      )}

      {products.length === 0 && (
        <div className="empty-state">No products found. Add products in the Products tab first.</div>
      )}

      {accounts.length > 0 && products.length > 0 && (
        <div className="grid-scroll-container">
          <table className="data-grid">
            <thead>
              <tr>
                <th className="sticky-col" style={{ minWidth: 130 }}>Account</th>
                {products.map(p => (
                  <th key={p.prod_name} title={p.prod_group || ''} style={{ textAlign: 'right', minWidth: 60 }}>
                    {p.prod_name}
                  </th>
                ))}
                <th style={{ textAlign: 'right', minWidth: 60 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map(acc => {
                const rowTotal = products.reduce(
                  (sum, p) => sum + (orderMap[`${acc.name}|${p.prod_name}`]?.units || 0), 0
                )
                return (
                  <tr key={acc.name}>
                    <td className="sticky-col acct-name" title={acc.route || ''}>
                      {acc.name}
                    </td>
                    {products.map(p => {
                      const key = `${acc.name}|${p.prod_name}`
                      const val = orderMap[key]?.units ?? 0
                      return (
                        <td key={p.prod_name} className="order-cell">
                          <EditableCell
                            value={val}
                            onSave={v => saveCell(acc.name, p.prod_name, v, date)}
                            type="number"
                            align="right"
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
                {products.map(p => {
                  const t = colTotal(p.prod_name)
                  return <td key={p.prod_name} className="total-cell">{t || ''}</td>
                })}
                <td className="total-cell">{grandTotal || ''}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
