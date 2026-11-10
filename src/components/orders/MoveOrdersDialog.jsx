import { useState, useEffect } from 'react'

// Move Orders: pick a From and To date, tick the accounts, and their orders on
// From are re-dated to To (e.g. six accounts' 11/24 delivery goes out 11/23).
// Special orders stay put unless "Also move special orders" is ticked.
// Accounts that already have orders on To can't be ticked — the server refuses
// them too, since merging would print products twice. Moving back is the undo.
export default function MoveOrdersDialog({ initialFrom, onClose, onMoved }) {
  const [from, setFrom] = useState(initialFrom || '')
  const [to, setTo] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [picked, setPicked] = useState(new Set())
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Off unless the user asks — special orders normally stay on their date.
  const [moveSpecial, setMoveSpecial] = useState(false)

  useEffect(() => {
    if (!from) { setRows([]); return }
    let stale = false
    setLoading(true); setError('')
    fetch(`/api/orders/move-preview?from=${from}${to ? `&to=${to}` : ''}`, { credentials: 'include' })
      .then(r => r.json().then(d => { if (!r.ok) throw new Error(d?.error || r.statusText); return d }))
      .then(d => {
        if (stale) return
        setRows(d)
        // Keep ticks that still make sense for the new dates.
        setPicked(prev => new Set([...prev].filter(a => d.some(r => r.account === a && !(to && r.to_rows > 0 && r.from_rows > 0)))))
      })
      .catch(e => { if (!stale) setError(String(e.message || e)) })
      .finally(() => { if (!stale) setLoading(false) })
    return () => { stale = true }
  }, [from, to])

  // Only regular orders can collide; an account with none on From has nothing to clash.
  const blocked = r => !!to && r.to_rows > 0 && r.from_rows > 0
  // Accounts with regular orders on From — plus, when special orders are being
  // moved too, accounts that only have special orders there.
  const listed = rows.filter(r => r.from_rows > 0 || (moveSpecial && r.spec_rows > 0))
  const shown = listed.filter(r => !search || r.account.toLowerCase().includes(search.toLowerCase()))
  const pickedRows = listed.filter(r => picked.has(r.account))
  const pickedSpec = pickedRows.reduce((s, r) => s + r.spec_rows, 0)
  const billedPicked = pickedRows.filter(r => r.billed)
  const fmt = d => { if (!d) return ''; const [y, m, dd] = d.split('-'); return `${+m}/${+dd}/${y}` }

  function toggle(a, on) {
    const next = new Set(picked)
    on ? next.add(a) : next.delete(a)
    setPicked(next)
  }

  async function move() {
    if (!from || !to || from === to || !pickedRows.length) return
    const units = pickedRows.reduce((s, r) => s + r.from_units, 0)
    const specNote = moveSpecial
      ? ` Also moving ${pickedSpec} special order${pickedSpec !== 1 ? 's' : ''}.`
      : ' Special orders stay where they are.'
    if (!window.confirm(`Move ${pickedRows.length} account${pickedRows.length !== 1 ? 's' : ''} (${units} units) from ${fmt(from)} to ${fmt(to)}?${specNote}\n\n${pickedRows.map(r => r.account).join(', ')}`)) return
    setBusy(true); setError('')
    try {
      const r = await fetch('/api/orders/move', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_date: from, to_date: to, accounts: pickedRows.map(r => r.account), move_special: moveSpecial }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || r.statusText)
      onMoved?.(`Moved ${d.moved} order${d.moved !== 1 ? 's' : ''}${moveSpecial ? ` + ${d.spec_moved} special` : ''} for ${d.accounts.length} account${d.accounts.length !== 1 ? 's' : ''} from ${fmt(from)} → ${fmt(to)}`)
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
          <strong style={{ fontSize: 16, flex: 1 }}>Move Orders</strong>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: '12px 18px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid var(--border)' }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>From:
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </label>
          <span style={{ color: 'var(--text-muted)' }}>→</span>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>To:
            <input type="date" value={to} onChange={e => setTo(e.target.value)} />
          </label>
          {from && to && from === to && <span style={{ color: '#dc2626', fontSize: 13 }}>Pick two different dates</span>}
        </div>

        <div style={{ padding: '10px 18px', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setPicked(new Set(shown.filter(r => !blocked(r)).map(r => r.account).concat([...picked])))}>All</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setPicked(new Set())}>None</button>
          <input type="text" placeholder="🔍 search accounts…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 160, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '5px 8px', fontSize: 13 }} />
        </div>

        <div style={{ padding: '0 18px', overflowY: 'auto', flex: 1, minHeight: 120 }}>
          {loading && <div style={{ padding: 12, color: 'var(--text-muted)' }}>Loading…</div>}
          {!loading && from && listed.length === 0 && <div style={{ padding: 12, color: 'var(--text-muted)' }}>No orders on {fmt(from)}.</div>}
          {!loading && shown.map(r => (
            <label key={r.account}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 2px', fontSize: 13, borderBottom: '1px solid var(--border-light, #f1f5f9)',
                cursor: blocked(r) ? 'not-allowed' : 'pointer', opacity: blocked(r) ? 0.55 : 1 }}
              title={blocked(r) ? `Already has orders on ${fmt(to)} — clear those first, or pick another date` : undefined}>
              <input type="checkbox" disabled={blocked(r)} checked={picked.has(r.account)} onChange={e => toggle(r.account, e.target.checked)} />
              <span style={{ flex: 1, fontWeight: picked.has(r.account) ? 600 : 400 }}>{r.account}</span>
              {r.billed && <span style={{ fontSize: 11, color: '#b45309' }} title={`A bill was already generated for ${fmt(from)}`}>billed</span>}
              {blocked(r) && <span style={{ fontSize: 11, color: '#dc2626' }}>has orders on {fmt(to)}</span>}
              {moveSpecial && r.spec_rows > 0 && (
                <span style={{ fontSize: 11, color: '#7c3aed' }}>{r.spec_rows} special</span>
              )}
              <span style={{ color: 'var(--text-muted)', fontSize: 12, minWidth: 70, textAlign: 'right' }}>{r.from_units} units</span>
            </label>
          ))}
        </div>

        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {billedPicked.length > 0 && (
            <div style={{ fontSize: 12, color: '#b45309' }}>
              Bills were already generated on {fmt(from)} for {billedPicked.map(r => r.account).join(', ')} — regenerate bills for both dates after moving.
            </div>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', flexWrap: 'wrap' }}
            title="Special orders stay on their date unless this is ticked">
            <input type="checkbox" checked={moveSpecial} onChange={e => setMoveSpecial(e.target.checked)} />
            Also move special orders
            {moveSpecial && pickedRows.length > 0 && (
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                ({pickedSpec} for the ticked accounts; delivery dates shift by the same number of days)
              </span>
            )}
          </label>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            To undo, move the same accounts back.
          </div>
          {error && <div className="error-message" style={{ margin: 0 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={move}
              disabled={busy || !from || !to || from === to || !pickedRows.length}>
              {busy ? 'Moving…' : `Move ${pickedRows.length || ''} account${pickedRows.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
