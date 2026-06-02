import { useState, useEffect } from 'react'
import EditableCell from '../shared/EditableCell'

export default function InventoryGrid() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])

  function load() {
    setLoading(true)
    fetch('/api/inventory', { credentials: 'include' })
      .then(r => r.json())
      .then(data => { setRows(data); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }

  async function saveField(prod_name, field, value) {
    try {
      await fetch(`/api/inventory/${encodeURIComponent(prod_name)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ [field]: value })
      })
      setRows(prev => prev.map(r =>
        r.prod_name === prod_name ? { ...r, [field]: value } : r
      ))
    } catch (e) {
      setError(`Save failed: ${e.message}`)
    }
  }

  if (loading) return <div className="loading">Loading inventory...</div>

  // Group by prod_group
  const groups = rows.reduce((acc, r) => {
    const g = r.prod_group || 'Other'
    if (!acc[g]) acc[g] = []
    acc[g].push(r)
    return acc
  }, {})

  return (
    <div>
      <div className="page-toolbar">
        <span className="toolbar-info">{rows.length} products</span>
        <div className="toolbar-spacer" />
        <button className="btn btn-secondary btn-sm" onClick={load}>Refresh</button>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="grid-scroll-container">
        <table className="data-grid" style={{ minWidth: 600 }}>
          <thead>
            <tr>
              <th style={{ minWidth: 180 }}>Product</th>
              <th style={{ minWidth: 80, textAlign: 'center' }}>Type</th>
              <th style={{ minWidth: 90, textAlign: 'right' }}>On Hand</th>
              <th style={{ minWidth: 90, textAlign: 'right' }}>Start of Day</th>
              <th style={{ minWidth: 120 }}>Location</th>
              <th style={{ minWidth: 140, textAlign: 'right', fontSize: 11 }}>Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(groups).map(([group, items]) => (
              <>
                <tr key={`g-${group}`} className="inv-group-header">
                  <td colSpan={6}>{group}</td>
                </tr>
                {items.map(row => (
                  <tr key={row.prod_name}>
                    <td style={{ paddingLeft: 16, fontWeight: 500 }}>{row.prod_name}</td>
                    <td style={{ textAlign: 'center' }}>
                      {row.prod_type && <span className="badge badge-blue">{row.prod_type}</span>}
                    </td>
                    <td className="order-cell">
                      <EditableCell
                        value={parseFloat(row.units) || 0}
                        onSave={v => saveField(row.prod_name, 'units', v)}
                        type="number"
                        align="right"
                      />
                    </td>
                    <td className="order-cell">
                      <EditableCell
                        value={parseFloat(row.sod_inv) || 0}
                        onSave={v => saveField(row.prod_name, 'sod_inv', v)}
                        type="number"
                        align="right"
                      />
                    </td>
                    <td>
                      <EditableCell
                        value={row.location || ''}
                        onSave={v => saveField(row.prod_name, 'location', v)}
                        type="text"
                        align="left"
                      />
                    </td>
                    <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>
                      {row.lst_updt ? new Date(row.lst_updt).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
