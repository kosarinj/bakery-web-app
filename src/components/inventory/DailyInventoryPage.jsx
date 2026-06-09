import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const TODAY = new Date().toISOString().slice(0, 10)

export default function DailyInventoryPage() {
  const navigate = useNavigate()
  const [date,      setDate]      = useState(TODAY)
  const [location,  setLocation]  = useState('')
  const [locations, setLocations] = useState([])
  const [rows,      setRows]      = useState([])
  const [loading,   setLoading]   = useState(false)

  useEffect(() => {
    fetch('/api/daily-inventory/locations', { credentials: 'include' })
      .then(r => r.json()).then(d => { if (Array.isArray(d)) setLocations(d) }).catch(() => {})
  }, [])

  useEffect(() => { load() }, [date, location])

  function load() {
    setLoading(true)
    const params = new URLSearchParams({ date })
    if (location) params.set('location', location)
    fetch(`/api/daily-inventory?${params}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setRows(d) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  // Group rows by location
  const grouped = rows.reduce((acc, r) => {
    const loc = r.location || '—'
    if (!acc[loc]) acc[loc] = []
    acc[loc].push(r)
    return acc
  }, {})

  const totalLeft   = rows.reduce((s, r) => s + parseFloat(r.left_qty   || 0), 0)
  const totalReturn = rows.reduce((s, r) => s + parseFloat(r.return_qty || 0), 0)

  return (
    <div>
      <div className="page-toolbar">
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '5px 8px', fontSize: 13, fontFamily: 'var(--font)' }} />
        <select value={location} onChange={e => setLocation(e.target.value)}
          style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '5px 8px', fontSize: 13, background: 'var(--surface)' }}>
          <option value="">All locations</option>
          {locations.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <span className="toolbar-info">
          {loading ? 'Loading…' : `${rows.length} records · Left: ${totalLeft} · Returned: ${totalReturn}`}
        </span>
        <div className="toolbar-spacer" />
        <button className="btn btn-primary btn-sm" onClick={() => navigate('/scan')}>📷 Scan</button>
      </div>

      {!loading && rows.length === 0 && (
        <div className="empty-state">No daily inventory records for this date{location ? ` at location ${location}` : ''}.</div>
      )}

      {Object.entries(grouped).map(([loc, locRows]) => (
        <div key={loc} className="section-card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <span style={{ fontWeight: 700, fontSize: 14 }}>Location {loc}</span>
            <span style={{ marginLeft: 12, fontSize: 12, color: 'var(--text-muted)' }}>
              {locRows.length} item{locRows.length !== 1 ? 's' : ''} ·
              Left: {locRows.reduce((s, r) => s + parseFloat(r.left_qty || 0), 0)} ·
              Returned: {locRows.reduce((s, r) => s + parseFloat(r.return_qty || 0), 0)}
            </span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-grid" style={{ minWidth: 520 }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 180 }}>Product</th>
                  <th style={{ minWidth: 110 }}>Group</th>
                  <th style={{ minWidth: 80, textAlign: 'right' }}>Left</th>
                  <th style={{ minWidth: 80, textAlign: 'right' }}>Return</th>
                  <th style={{ minWidth: 80, textAlign: 'center' }}>Override</th>
                  <th style={{ minWidth: 140, textAlign: 'right', fontSize: 11 }}>Scanned At</th>
                </tr>
              </thead>
              <tbody>
                {locRows.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 500 }}>{r.prod_name}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{r.prod_group || '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{parseFloat(r.left_qty || 0)}</td>
                    <td style={{ textAlign: 'right', color: parseFloat(r.return_qty) > 0 ? '#dc2626' : 'inherit' }}>
                      {parseFloat(r.return_qty || 0)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {r.override ? <span className="badge badge-yellow">Override</span> : ''}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>
                      {r.scanned_at ? new Date(r.scanned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
