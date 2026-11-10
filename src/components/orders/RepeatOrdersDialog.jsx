import { useState, useEffect } from 'react'

const addDays = (d, n) => {
  const x = new Date(d + 'T00:00:00')
  x.setDate(x.getDate() + n)
  return x.toISOString().slice(0, 10)
}

// Repeat Orders: copy the ticked accounts' orders from one date (the day on
// screen) to another (a week later by default), each at a % of the original.
// Uses the same /api/orders/copy as before: per account and product it copies
// units less special orders and post-bake additions, and skips any product the
// account already has on the To date, so running it twice adds nothing.
export default function RepeatOrdersDialog({ initialFrom, onClose, onRepeated }) {
  const [from, setFrom] = useState(initialFrom || '')
  const [to, setTo] = useState(initialFrom ? addDays(initialFrom, 7) : '')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [picked, setPicked] = useState(new Set())
  const [pct, setPct] = useState({})          // account → % of From (default 100)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!from) { setRows([]); return }
    let stale = false
    setLoading(true); setError('')
    fetch(`/api/orders/move-preview?from=${from}${to ? `&to=${to}` : ''}`, { credentials: 'include' })
      .then(r => r.json().then(d => { if (!r.ok) throw new Error(d?.error || r.statusText); return d }))
      .then(d => {
        if (stale) return
        const list = d.filter(r => r.from_rows > 0)
        setRows(list)
        setPicked(prev => new Set([...prev].filter(a => list.some(r => r.account === a))))
      })
      .catch(e => { if (!stale) setError(String(e.message || e)) })
      .finally(() => { if (!stale) setLoading(false) })
    return () => { stale = true }
  }, [from, to])

  const shown = rows.filter(r => !search || r.account.toLowerCase().includes(search.toLowerCase()))
  const pickedRows = rows.filter(r => picked.has(r.account))
  const pctOf = a => { const n = Number(pct[a] ?? 100); return Number.isFinite(n) && n >= 0 ? n : 100 }
  const fmt = d => { if (!d) return ''; const [y, m, dd] = d.split('-'); return `${+m}/${+dd}/${y}` }

  function toggle(a, on) {
    const next = new Set(picked)
    on ? next.add(a) : next.delete(a)
    setPicked(next)
  }

  async function repeat() {
    if (!from || !to || from === to || !pickedRows.length) return
    const n = pickedRows.length
    const lines = pickedRows.map(r => pctOf(r.account) !== 100 ? `${r.account} (${pctOf(r.account)}%)` : r.account)
    if (!window.confirm(`Repeat ${n} account${n !== 1 ? 's' : ''} from ${fmt(from)} to ${fmt(to)}?\n\n${lines.join(', ')}`)) return
    const percentages = {}
    for (const r of pickedRows) if (pctOf(r.account) !== 100) percentages[r.account] = pctOf(r.account)
    setBusy(true); setError('')
    try {
      const r = await fetch('/api/orders/copy', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_date: from, to_date: to, accounts: pickedRows.map(r => r.account), percentages }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || r.statusText)
      onRepeated?.(`Copied ${d.copied} order${d.copied !== 1 ? 's' : ''} for ${n} account${n !== 1 ? 's' : ''} from ${fmt(from)} → ${fmt(to)}`, to)
      onClose()
    } catch (e) { setError(String(e.message || e)) }
    finally { setBusy(false) }
  }

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: 'var(--surface, #fff)', borderRadius: 8, width: 'min(680px, 94vw)', maxHeight: '86vh', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center' }}>
          <strong style={{ fontSize: 16, flex: 1 }}>Repeat Orders</strong>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: '12px 18px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid var(--border)' }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>From:
            <input type="date" value={from} onChange={e => { setFrom(e.target.value); if (e.target.value) setTo(addDays(e.target.value, 7)) }} />
          </label>
          <span style={{ color: 'var(--text-muted)' }}>→</span>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>To:
            <input type="date" value={to} onChange={e => setTo(e.target.value)} />
          </label>
          {from && to && from === to && <span style={{ color: '#dc2626', fontSize: 13 }}>Pick two different dates</span>}
        </div>

        <div style={{ padding: '10px 18px', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setPicked(new Set([...picked, ...shown.map(r => r.account)]))}>All</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setPicked(new Set())}>None</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setPct({})} title="Set every account back to 100%">Reset %</button>
          <input type="text" placeholder="🔍 search accounts…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 160, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '5px 8px', fontSize: 13 }} />
        </div>

        <div style={{ padding: '0 18px', overflowY: 'auto', flex: 1, minHeight: 120 }}>
          {loading && <div style={{ padding: 12, color: 'var(--text-muted)' }}>Loading…</div>}
          {!loading && from && rows.length === 0 && <div style={{ padding: 12, color: 'var(--text-muted)' }}>No orders on {fmt(from)}.</div>}
          {!loading && shown.map(r => (
            <div key={r.account}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px', fontSize: 13, borderBottom: '1px solid var(--border-light, #f1f5f9)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, cursor: 'pointer' }}>
                <input type="checkbox" checked={picked.has(r.account)} onChange={e => toggle(r.account, e.target.checked)} />
                <span style={{ flex: 1, fontWeight: picked.has(r.account) ? 600 : 400 }}>{r.account}</span>
              </label>
              {to && r.to_rows > 0 && (
                <span style={{ fontSize: 11, color: '#b45309' }}
                  title={`Already has ${r.to_rows} order lines on ${fmt(to)} — only products not already there are added`}>
                  has orders on {fmt(to)}
                </span>
              )}
              <span style={{ color: 'var(--text-muted)', fontSize: 12, minWidth: 64, textAlign: 'right' }}>{r.from_units} units</span>
              <input type="number" min="0" max="500" step="5" value={pct[r.account] ?? 100}
                onChange={e => setPct(p => ({ ...p, [r.account]: e.target.value }))}
                title={`Repeat ${r.account} at this % of ${fmt(from)}`}
                style={{ width: 54, padding: '1px 4px', fontSize: 12, textAlign: 'right' }} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>%</span>
            </div>
          ))}
        </div>

        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Copies each ticked account's orders (less special orders and post-bake additions) at its %.
            Products an account already has on the To date are left as they are.
          </div>
          {error && <div className="error-message" style={{ margin: 0 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={repeat}
              disabled={busy || !from || !to || from === to || !pickedRows.length}>
              {busy ? 'Copying…' : `⬇ Repeat ${pickedRows.length || ''} account${pickedRows.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
