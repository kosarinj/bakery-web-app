import { useState, useEffect } from 'react'

const ACTION_LABELS = {
  login:                    { label: 'Login',              color: '#2563eb' },
  repeat_orders:            { label: 'Repeat Orders',      color: '#7c3aed' },
  repeat_orders_error:      { label: 'Repeat Error',       color: '#dc2626' },
  repeat_spec_orders:       { label: 'Repeat Spec Orders', color: '#7c3aed' },
  repeat_spec_orders_error: { label: 'Repeat Spec Error',  color: '#dc2626' },
  recipe_add:               { label: 'Recipe Add',         color: '#16a34a' },
  recipe_edit:              { label: 'Recipe Edit',        color: '#d97706' },
  recipe_delete:            { label: 'Recipe Delete',      color: '#dc2626' },
}

function ActionBadge({ action }) {
  const cfg = ACTION_LABELS[action] || { label: action, color: 'var(--text-muted)' }
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 10,
      background: cfg.color + '1a', color: cfg.color, whiteSpace: 'nowrap' }}>
      {cfg.label}
    </span>
  )
}

export default function ActivityLog() {
  const [rows, setRows]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [search, setSearch]     = useState('')
  const [userFilter, setUser]   = useState('')

  useEffect(() => { load() }, [])

  function load() {
    setLoading(true)
    const params = new URLSearchParams({ limit: 500 })
    if (userFilter) params.set('username', userFilter)
    fetch(`/api/activity-log?${params}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setRows(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }

  const fmtDate = ts => {
    if (!ts) return ''
    const d = new Date(ts)
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  const q = search.toLowerCase()
  const visible = rows.filter(r =>
    !q ||
    (r.action||'').toLowerCase().includes(q) ||
    (r.details||'').toLowerCase().includes(q) ||
    (r.username||'').toLowerCase().includes(q)
  )

  const users = [...new Set(rows.map(r => r.username).filter(Boolean))]

  return (
    <div>
      <div className="page-toolbar">
        <input type="text" placeholder="Search actions/details…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '5px 10px', fontSize: 13, width: 220 }} />
        <select value={userFilter} onChange={e => { setUser(e.target.value) }}
          style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '5px 8px', fontSize: 13 }}>
          <option value="">All users</option>
          {users.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <span className="toolbar-info">{visible.length} entries</span>
        <div className="toolbar-spacer" />
        <button className="btn btn-secondary btn-sm" onClick={load}>↻ Refresh</button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading ? <div className="loading">Loading…</div> : (
        <div className="grid-scroll-container">
          <table className="data-grid" style={{ minWidth: 700 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 160 }}>When</th>
                <th style={{ minWidth: 100 }}>User</th>
                <th style={{ minWidth: 140 }}>Action</th>
                <th>Details</th>
                <th style={{ minWidth: 110 }}>IP</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(r => (
                <tr key={r.id}>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtDate(r.created_at)}</td>
                  <td style={{ fontWeight: 600, fontSize: 13 }}>{r.username}</td>
                  <td><ActionBadge action={r.action} /></td>
                  <td style={{ fontSize: 12, color: 'var(--text)' }}>{r.details}</td>
                  <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.ip}</td>
                </tr>
              ))}
              {visible.length === 0 && !loading && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                  No activity logged yet.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
