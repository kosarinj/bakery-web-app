import { useState, useEffect } from 'react'

// Clear Accounts: tick several accounts and delete all their orders for one
// date in one go, instead of clearing them one at a time. Special orders are
// not touched. The server keeps a copy of every cleared row
// (daily_orders_cleared), so a mistake can be put back.
export default function ClearOrdersDialog({ initialDate, onClose, onCleared }) {
  const [date, setDate] = useState(initialDate || '')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [picked, setPicked] = useState(new Set())
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!date) { setRows([]); return }
    let stale = false
    setLoading(true); setError(''); setPicked(new Set())
    fetch(`/api/orders/move-preview?from=${date}`, { credentials: 'include' })
      .then(r => r.json().then(d => { if (!r.ok) throw new Error(d?.error || r.statusText); return d }))
      .then(d => { if (!stale) setRows(d.filter(r => r.from_rows > 0)) })
      .catch(e => { if (!stale) setError(String(e.message || e)) })
      .finally(() => { if (!stale) setLoading(false) })
    return () => { stale = true }
  }, [date])

  const shown = rows.filter(r => !search || r.account.toLowerCase().includes(search.toLowerCase()))
  const pickedRows = rows.filter(r => picked.has(r.account))
  const billedPicked = pickedRows.filter(r => r.billed)
  const fmt = d => { if (!d) return ''; const [y, m, dd] = d.split('-'); return `${+m}/${+dd}/${y}` }

  function toggle(a, on) {
    const next = new Set(picked)
    on ? next.add(a) : next.delete(a)
    setPicked(next)
  }

  async function clear() {
    if (!date || !pickedRows.length) return
    const units = pickedRows.reduce((s, r) => s + r.from_units, 0)
    const n = pickedRows.length
    if (!window.confirm(`Delete ALL orders on ${fmt(date)} for ${n} account${n !== 1 ? 's' : ''} (${units} units)?\n\n${pickedRows.map(r => r.account).join(', ')}\n\nSpecial orders are not touched.`)) return
    setBusy(true); setError('')
    try {
      const r = await fetch('/api/orders/clear-accounts', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, accounts: pickedRows.map(r => r.account) }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || r.statusText)
      onCleared?.(`Deleted ${d.deleted} order${d.deleted !== 1 ? 's' : ''} for ${d.accounts.length} account${d.accounts.length !== 1 ? 's' : ''} on ${fmt(date)}`)
      onClose()
    } catch (e) { setError(String(e.message || e)) }
    finally { setBusy(false) }
  }

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: 'var(--surface, #fff)', borderRadius: 8, width: 'min(640px, 94vw)', maxHeight: '86vh', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center' }}>
          <strong style={{ fontSize: 16, flex: 1, color: '#b91c1c' }}>Clear Accounts</strong>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: '12px 18px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid var(--border)' }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>Date:
            <input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </label>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Deletes every order line for the ticked accounts on this date.</span>
        </div>

        <div style={{ padding: '10px 18px', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setPicked(new Set([...picked, ...shown.map(r => r.account)]))}>All</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setPicked(new Set())}>None</button>
          <input type="text" placeholder="🔍 search accounts…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 160, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '5px 8px', fontSize: 13 }} />
        </div>

        <div style={{ padding: '0 18px', overflowY: 'auto', flex: 1, minHeight: 120 }}>
          {loading && <div style={{ padding: 12, color: 'var(--text-muted)' }}>Loading…</div>}
          {!loading && date && rows.length === 0 && <div style={{ padding: 12, color: 'var(--text-muted)' }}>No orders on {fmt(date)}.</div>}
          {!loading && shown.map(r => (
            <label key={r.account}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 2px', fontSize: 13, borderBottom: '1px solid var(--border-light, #f1f5f9)', cursor: 'pointer' }}>
              <input type="checkbox" checked={picked.has(r.account)} onChange={e => toggle(r.account, e.target.checked)} />
              <span style={{ flex: 1, fontWeight: picked.has(r.account) ? 600 : 400, color: picked.has(r.account) ? '#b91c1c' : undefined }}>{r.account}</span>
              {r.billed && <span style={{ fontSize: 11, color: '#b45309' }} title={`A bill was already generated for ${fmt(date)}`}>billed</span>}
              <span style={{ color: 'var(--text-muted)', fontSize: 12, minWidth: 70, textAlign: 'right' }}>{r.from_units} units</span>
            </label>
          ))}
        </div>

        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {billedPicked.length > 0 && (
            <div style={{ fontSize: 12, color: '#b45309' }}>
              Bills were already generated on {fmt(date)} for {billedPicked.map(r => r.account).join(', ')} — regenerate bills after clearing.
            </div>
          )}
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Special orders are not touched. Cleared orders are kept in a backup and can be restored if needed.
          </div>
          {error && <div className="error-message" style={{ margin: 0 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-danger btn-sm" onClick={clear} disabled={busy || !date || !pickedRows.length}>
              {busy ? 'Clearing…' : `🗑 Clear ${pickedRows.length || ''} account${pickedRows.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
