import { useState, useEffect } from 'react'
import EditableCell from '../shared/EditableCell'

const EMPTY = { account: '', location: '', prod_name: '', units: 0, price: 0, del_date: '', phone: '', notes: '' }

export default function SpecialOrders() {
  const [date, setDate]         = useState('')
  const [orders, setOrders]     = useState([])
  const [accounts, setAccounts] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [newRow, setNewRow]     = useState(EMPTY)
  const [adding, setAdding]     = useState(false)
  const [dates, setDates]       = useState([])

  // Copy/repeat state
  const [copyFrom, setCopyFrom]   = useState('')
  const [copyTo, setCopyTo]       = useState('')
  const [copying, setCopying]     = useState(false)
  const [copyMsg, setCopyMsg]     = useState('')

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
    ]).then(([a, p, d]) => {
      setAccounts(Array.isArray(a) ? a : [])
      setProducts(Array.isArray(p) ? p : [])
      setDates(Array.isArray(d) ? d : [])
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
        body: JSON.stringify({ from_date: copyFrom, to_date: copyTo })
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setCopyMsg(`Copied ${d.copied} order${d.copied !== 1 ? 's' : ''} from ${copyFrom} → ${copyTo}`)
      if (copyTo === date) load()
      setTimeout(() => setCopyMsg(''), 5000)
    } catch (e) { setError(e.message) }
    finally { setCopying(false) }
  }

  const totalUnits = orders.reduce((s, o) => s + (parseFloat(o.units) || 0), 0)
  const totalRev   = orders.reduce((s, o) => s + (parseFloat(o.units) || 0) * (parseFloat(o.price) || 0), 0)

  const [showDatePanel, setShowDatePanel] = useState(false)

  return (
    <div>
      <div className="page-toolbar" style={{ marginBottom: 8 }}>
        <label>Date: <input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        {dates.length > 0 && (
          <div style={{ position: 'relative' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowDatePanel(p => !p)}>
              Browse Dates ({dates.length})
            </button>
            {showDatePanel && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, zIndex: 100, marginTop: 4,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                minWidth: 200, maxHeight: 320, overflowY: 'auto',
              }}>
                {dates.map(d => (
                  <button key={d.date} onClick={() => { setDate(d.date); setShowDatePanel(false) }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '7px 14px', border: 'none', background: d.date === date ? 'var(--primary-light)' : 'transparent',
                      color: d.date === date ? 'var(--primary)' : 'var(--text)',
                      fontWeight: d.date === date ? 700 : 400,
                      fontSize: 13, cursor: 'pointer',
                    }}
                    onMouseEnter={e => { if (d.date !== date) e.currentTarget.style.background = 'var(--bg)' }}
                    onMouseLeave={e => { if (d.date !== date) e.currentTarget.style.background = 'transparent' }}
                  >
                    {d.date}
                    <span style={{ float: 'right', color: 'var(--text-muted)', fontSize: 11 }}>{d.count} orders</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <span className="toolbar-info">{orders.length} orders · {totalUnits} units · ${totalRev.toFixed(2)}</span>
        <div className="toolbar-spacer" />
        {!adding && <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>+ Add Special Order</button>}
      </div>

      {/* Repeat row */}
      <div className="page-toolbar" style={{ marginBottom: 12 }}>
        <label>Copy from: <input type="date" value={copyFrom} onChange={e => setCopyFrom(e.target.value)} /></label>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>→</span>
        <label>To: <input type="date" value={copyTo} onChange={e => setCopyTo(e.target.value)} /></label>
        <button className="btn btn-secondary btn-sm" onClick={repeatOrders}
          disabled={copying || !copyFrom || !copyTo || copyFrom === copyTo}>
          {copying ? 'Copying…' : '⬇ Repeat Special Orders'}
        </button>
        {copyMsg && <span style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600 }}>{copyMsg}</span>}
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading ? <div className="loading">Loading…</div> : (
        <div className="grid-scroll-container">
          <table className="data-grid" style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 140 }}>Account</th>
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
              {orders.map(o => (
                <tr key={o.id}>
                  <td style={{ fontWeight: 500 }}>{o.account}</td>
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
                    <input type="text" placeholder="Location" value={newRow.location}
                      onChange={e => setNewRow(p => ({ ...p, location: e.target.value }))}
                      style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px', fontSize: 13 }} />
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

              {orders.length === 0 && !adding && (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                  No special orders for {date}.
                  {dates.length > 0 && <span> Use <strong>Browse Dates</strong> to jump to a date with orders.</span>}
                </td></tr>
              )}

              {orders.length > 0 && (
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
  )
}
