import { useState, useEffect } from 'react'
import EditableCell from '../shared/EditableCell'

const EMPTY = { name: '', unit: '', cost_cup: '', cost_pound: '', cup_pound: '', notes: '' }

export default function IngredientsPage() {
  const [ingredients, setIngredients] = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')
  const [newRow, setNewRow]           = useState(EMPTY)
  const [adding, setAdding]           = useState(false)
  const [search, setSearch]           = useState('')

  useEffect(() => { load() }, [])

  function load() {
    setLoading(true)
    fetch('/api/ingredients', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setIngredients(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }

  async function save(id, field, value) {
    try {
      await fetch(`/api/ingredients/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ [field]: value === '' ? null : value })
      })
      setIngredients(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i))
    } catch (e) { setError(e.message) }
  }

  async function addIngredient() {
    if (!newRow.name.trim()) return
    try {
      const r = await fetch('/api/ingredients', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(newRow)
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setIngredients(prev => [...prev, d])
      setNewRow(EMPTY); setAdding(false)
    } catch (e) { setError(e.message) }
  }

  async function del(id, name) {
    if (!confirm(`Delete ingredient "${name}"?`)) return
    try {
      await fetch(`/api/ingredients/${id}`, { method: 'DELETE', credentials: 'include' })
      setIngredients(prev => prev.filter(i => i.id !== id))
    } catch (e) { setError(e.message) }
  }

  const fmtCost = v => (v && parseFloat(v) > 0) ? `$${parseFloat(v).toFixed(4)}` : ''
  const q = search.toLowerCase()
  const visible = q ? ingredients.filter(i => (i.name||'').toLowerCase().includes(q)) : ingredients

  return (
    <div>
      <div className="page-toolbar">
        <input type="text" placeholder="Search ingredients…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '5px 10px', fontSize: 13, width: 200 }} />
        <span className="toolbar-info">{visible.length} of {ingredients.length}</span>
        <div className="toolbar-spacer" />
        {!adding && <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>+ Add Ingredient</button>}
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading ? <div className="loading">Loading…</div> : (
        <div className="grid-scroll-container">
          <table className="data-grid" style={{ minWidth: 780 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 180 }}>Name</th>
                <th style={{ minWidth: 80 }}>Unit</th>
                <th style={{ minWidth: 100, textAlign: 'right' }}>Cost/Cup</th>
                <th style={{ minWidth: 100, textAlign: 'right' }}>Cost/Lb</th>
                <th style={{ minWidth: 100, textAlign: 'right' }}>Cups/Lb</th>
                <th style={{ minWidth: 200 }}>Notes</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(i => (
                <tr key={i.id}>
                  <td style={{ fontWeight: 500 }}>{i.name}</td>
                  <td><EditableCell value={i.unit||''} onSave={v=>save(i.id,'unit',v)} type="text" align="left"/></td>
                  <td><EditableCell value={parseFloat(i.cost_cup)||0} onSave={v=>save(i.id,'cost_cup',v)} type="number" align="right" formatter={fmtCost}/></td>
                  <td><EditableCell value={parseFloat(i.cost_pound)||0} onSave={v=>save(i.id,'cost_pound',v)} type="number" align="right" formatter={fmtCost}/></td>
                  <td><EditableCell value={parseFloat(i.cup_pound)||0} onSave={v=>save(i.id,'cup_pound',v)} type="number" align="right"/></td>
                  <td><EditableCell value={i.notes||''} onSave={v=>save(i.id,'notes',v)} type="text" align="left"/></td>
                  <td style={{ textAlign: 'center' }}>
                    <button className="btn btn-danger btn-sm" style={{ padding: '2px 6px', fontSize: 11 }} onClick={() => del(i.id, i.name)}>✕</button>
                  </td>
                </tr>
              ))}

              {adding && (
                <tr style={{ background: 'var(--cell-edit-bg)' }}>
                  <td>
                    <input autoFocus type="text" placeholder="Ingredient name" value={newRow.name}
                      onChange={e => setNewRow(p => ({ ...p, name: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') addIngredient(); if (e.key === 'Escape') { setAdding(false); setNewRow(EMPTY) } }}
                      style={{ width: '100%', border: '2px solid var(--primary)', borderRadius: 'var(--radius-sm)', padding: '4px 8px', fontSize: 13 }} />
                  </td>
                  {['unit','cost_cup','cost_pound','cup_pound','notes'].map(f => (
                    <td key={f}>
                      <input type={['cost_cup','cost_pound','cup_pound'].includes(f) ? 'number' : 'text'}
                        placeholder={f.replace('_',' ')} value={newRow[f]}
                        onChange={e => setNewRow(p => ({ ...p, [f]: e.target.value }))}
                        step="0.0001"
                        style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px', fontSize: 13, textAlign: ['cost_cup','cost_pound','cup_pound'].includes(f) ? 'right' : 'left' }} />
                    </td>
                  ))}
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-primary btn-sm" style={{ marginRight: 4 }} onClick={addIngredient}>Add</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setAdding(false); setNewRow(EMPTY) }}>✕</button>
                  </td>
                </tr>
              )}

              {visible.length === 0 && !adding && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                  {search ? 'No ingredients match your search.' : 'No ingredients yet.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
