import { useState, useEffect } from 'react'
import EditableCell from '../shared/EditableCell'

export default function BakeSchedule() {
  const [date, setDate] = useState('')
  const [bakeList, setBakeList] = useState([])
  const [haveNeed, setHaveNeed] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [view, setView] = useState('bake')  // 'bake' | 'haveneed'

  useEffect(() => {
    fetch('/api/settings', { credentials: 'include' })
      .then(r => r.json())
      .then(s => setDate(s.baking_date || new Date().toISOString().slice(0, 10)))
      .catch(() => setDate(new Date().toISOString().slice(0, 10)))
  }, [])

  useEffect(() => {
    if (!date) return
    setLoading(true)
    Promise.all([
      fetch(`/api/bake-list?date=${date}`, { credentials: 'include' }).then(r => r.json()),
      fetch(`/api/have-need?date=${date}`, { credentials: 'include' }).then(r => r.json()),
    ])
      .then(([bl, hn]) => {
        setBakeList(Array.isArray(bl) ? bl : [])
        setHaveNeed(Array.isArray(hn) ? hn : [])
        setLoading(false)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [date])

  async function generateBakeList() {
    setGenerating(true)
    setError('')
    try {
      const r = await fetch('/api/bake-list/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ date })
      })
      const rows = await r.json()
      if (!r.ok) throw new Error(rows.error)
      // Re-fetch to get the full list with inventory join
      const updated = await fetch(`/api/bake-list?date=${date}`, { credentials: 'include' }).then(r2 => r2.json())
      setBakeList(updated)
    } catch (e) {
      setError(`Generate failed: ${e.message}`)
    } finally {
      setGenerating(false)
    }
  }

  async function saveUnits(id, units) {
    try {
      await fetch(`/api/bake-list/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ units })
      })
      setBakeList(prev => prev.map(r => r.id === id ? { ...r, units } : r))
    } catch (e) {
      setError(`Save failed: ${e.message}`)
    }
  }

  async function saveNotes(id, notes) {
    try {
      await fetch(`/api/bake-list/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ notes })
      })
      setBakeList(prev => prev.map(r => r.id === id ? { ...r, notes } : r))
    } catch (e) {
      setError(`Save failed: ${e.message}`)
    }
  }

  async function deleteItem(id) {
    try {
      await fetch(`/api/bake-list/${id}`, { method: 'DELETE', credentials: 'include' })
      setBakeList(prev => prev.filter(r => r.id !== id))
    } catch (e) {
      setError(`Delete failed: ${e.message}`)
    }
  }

  if (loading) return <div className="loading">Loading bake schedule...</div>

  const totalUnits = bakeList.reduce((sum, r) => sum + (parseFloat(r.units) || 0), 0)
  const needItems = haveNeed.filter(r => parseFloat(r.need) > 0)

  // Group bake list by prod_group
  const bakeGroups = bakeList.reduce((acc, r) => {
    const g = r.prod_group || 'Other'
    if (!acc[g]) acc[g] = []
    acc[g].push(r)
    return acc
  }, {})

  return (
    <div>
      <div className="page-toolbar">
        <label>
          Bake Date:
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </label>

        <div style={{ display: 'flex', gap: 4 }}>
          <button
            className={`btn btn-sm ${view === 'bake' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setView('bake')}
          >Bake List</button>
          <button
            className={`btn btn-sm ${view === 'haveneed' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setView('haveneed')}
          >Have / Need</button>
        </div>

        <div className="toolbar-spacer" />

        <button
          className="btn btn-secondary btn-sm"
          onClick={generateBakeList}
          disabled={generating}
          title="Generate bake list from today's orders minus current inventory"
        >
          {generating ? 'Generating...' : '⚙ Generate from Orders'}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {view === 'bake' && (
        <>
          {bakeList.length === 0 ? (
            <div className="empty-state">
              <p>No bake list for {date}.</p>
              <p style={{ marginTop: 8, fontSize: 13 }}>
                Click "Generate from Orders" to create one from today's order totals.
              </p>
            </div>
          ) : (
            <div className="grid-scroll-container">
              <table className="data-grid" style={{ minWidth: 500 }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: 180 }}>Product</th>
                    <th style={{ minWidth: 80 }}>Type</th>
                    <th style={{ minWidth: 80, textAlign: 'right' }}>On Hand</th>
                    <th style={{ minWidth: 90, textAlign: 'right' }}>Bake Units</th>
                    <th style={{ minWidth: 200 }}>Notes</th>
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(bakeGroups).map(([group, items]) => (
                    <>
                      <tr key={`g-${group}`} className="inv-group-header">
                        <td colSpan={6}>{group}</td>
                      </tr>
                      {items.map(row => (
                        <tr key={row.id}>
                          <td style={{ paddingLeft: 16, fontWeight: 500 }}>{row.prod_name}</td>
                          <td>
                            {row.prod_type && <span className="badge badge-blue">{row.prod_type}</span>}
                          </td>
                          <td style={{ textAlign: 'right', color: 'var(--text-muted)', paddingRight: 8 }}>
                            {parseFloat(row.inv_units) || 0}
                          </td>
                          <td className="order-cell">
                            <EditableCell
                              value={parseFloat(row.units) || 0}
                              onSave={v => saveUnits(row.id, v)}
                              type="number"
                              align="right"
                            />
                          </td>
                          <td>
                            <EditableCell
                              value={row.notes || ''}
                              onSave={v => saveNotes(row.id, v)}
                              type="text"
                              align="left"
                            />
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              className="btn btn-danger btn-sm"
                              style={{ padding: '2px 6px', fontSize: 11 }}
                              onClick={() => deleteItem(row.id)}
                              title="Remove from bake list"
                            >✕</button>
                          </td>
                        </tr>
                      ))}
                    </>
                  ))}
                  <tr className="totals-row">
                    <td colSpan={3}>Total units to bake</td>
                    <td className="total-cell">{totalUnits || ''}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {view === 'haveneed' && (
        <div className="grid-scroll-container">
          <table className="data-grid" style={{ minWidth: 500 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 180 }}>Product</th>
                <th style={{ minWidth: 80 }}>Type</th>
                <th style={{ minWidth: 90, textAlign: 'right' }}>Ordered</th>
                <th style={{ minWidth: 90, textAlign: 'right' }}>Have</th>
                <th style={{ minWidth: 90, textAlign: 'right' }}>Need</th>
              </tr>
            </thead>
            <tbody>
              {haveNeed.map(row => {
                const need = parseFloat(row.need) || 0
                const ordered = parseFloat(row.ordered) || 0
                if (!ordered && !need) return null
                return (
                  <tr key={row.prod_name}>
                    <td style={{ fontWeight: ordered > 0 ? 500 : 400 }}>{row.prod_name}</td>
                    <td>
                      {row.prod_type && <span className="badge badge-blue">{row.prod_type}</span>}
                    </td>
                    <td style={{ textAlign: 'right', paddingRight: 8 }}>{ordered || ''}</td>
                    <td style={{ textAlign: 'right', paddingRight: 8 }}>{parseFloat(row.have) || ''}</td>
                    <td style={{ textAlign: 'right', paddingRight: 8 }}
                      className={need > 0 ? 'have-need-neg' : (ordered > 0 ? 'have-need-ok' : '')}>
                      {need > 0 ? need : (ordered > 0 ? '✓' : '')}
                    </td>
                  </tr>
                )
              })}
              {needItems.length > 0 && (
                <tr className="totals-row">
                  <td colSpan={4}>Total needed</td>
                  <td className="total-cell have-need-neg">
                    {needItems.reduce((s, r) => s + parseFloat(r.need), 0)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
