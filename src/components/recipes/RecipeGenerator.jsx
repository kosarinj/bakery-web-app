import { useState, useEffect } from 'react'

function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n }

function fmt(n, unit) {
  if (!n || n === 0) return ''
  const v = parseFloat(n)
  if (!v) return ''
  const s = v % 1 === 0 ? String(v) : v.toFixed(3).replace(/\.?0+$/, '')
  return unit ? `${s} ${unit}` : s
}

// One ingredient row. View mode shows base × scale; edit mode shows editable per-batch base amounts.
function IngredientRow({ row, scale, editing, onSave }) {
  if (row.space) return <tr><td colSpan={6} style={{ height: 8 }} /></tr>
  if (row.rectext && !row.ingredient) {
    return (
      <tr><td colSpan={6} style={{ fontWeight: 600, fontStyle: 'italic', paddingTop: 8, paddingBottom: 4, color: 'var(--primary)' }}>{row.rectext}</td></tr>
    )
  }
  const cell = (field, unit) => {
    const base = num(row[field])
    if (editing) {
      return (
        <input
          type="number" step="any" defaultValue={base || ''} placeholder="0"
          onClick={e => e.stopPropagation()}
          onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
          onBlur={e => { const v = num(e.target.value); if (v !== base) onSave(row.id, field, v) }}
          style={{ width: 58, textAlign: 'right', border: '1px solid var(--primary)', borderRadius: 'var(--radius-sm)', padding: '2px 4px', fontSize: 12, background: 'var(--cell-edit-bg)' }}
          title={`Base per-batch ${unit}`}
        />
      )
    }
    return fmt(base * scale, unit)
  }
  return (
    <tr>
      <td style={{ paddingLeft: 12, fontWeight: 500 }}>{row.ingredient}</td>
      <td style={{ textAlign: 'right', paddingRight: 8 }}>{cell('teaspoons', 'tsp')}</td>
      <td style={{ textAlign: 'right', paddingRight: 8 }}>{cell('tablespoons', 'tbsp')}</td>
      <td style={{ textAlign: 'right', paddingRight: 8 }}>{cell('cups', 'cups')}</td>
      <td style={{ textAlign: 'right', paddingRight: 8 }}>{cell('pounds', 'lbs')}</td>
      <td style={{ textAlign: 'right', paddingRight: 8 }}>{cell('qty', row.ingr_unit || '')}</td>
    </tr>
  )
}

function RecipeCard({ title, type, baseBatches, units, products, recipe, onError }) {
  const [open, setOpen]       = useState(true)
  const [editing, setEditing] = useState(false)
  const [batches, setBatches] = useState(baseBatches)
  const [rows, setRows]       = useState(recipe || [])

  // Re-sync when a fresh generation comes in
  useEffect(() => { setRows(recipe || []); setBatches(baseBatches); setEditing(false) }, [recipe, baseBatches])

  const scale = num(batches)

  async function saveField(rowId, field, value) {
    setRows(rs => rs.map(r => r.id === rowId ? { ...r, [field]: value } : r))
    try {
      const r = await fetch(`/api/recipes/${rowId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ [field]: value })
      })
      if (!r.ok) throw new Error((await r.json()).error || 'save failed')
    } catch (e) { onError && onError(`Recipe save failed: ${e.message}`) }
  }

  const stop = e => e.stopPropagation()

  return (
    <div className="section-card" style={{ marginBottom: 10 }}>
      <div className="card-header" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }} onClick={() => setOpen(o => !o)}>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{open ? '▲' : '▼'}</span>
        <span style={{ fontWeight: 700, fontSize: 14 }}>{title}</span>
        <span className={`badge ${type === 'batch' ? 'badge-purple' : 'badge-blue'}`}>{type === 'batch' ? 'Batch' : 'Mult'}</span>

        <label onClick={stop} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}
          title="Number of batches to scale the recipe by (adjust for this view)">
          Batches:
          <input type="number" step="any" min="0" value={batches}
            onChange={e => setBatches(e.target.value)}
            style={{ width: 56, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '2px 5px', fontSize: 13, fontWeight: 700, textAlign: 'right' }} />
          {num(batches) !== num(baseBatches) && (
            <button className="btn btn-secondary btn-sm" style={{ padding: '1px 6px', fontSize: 11 }}
              onClick={() => setBatches(baseBatches)} title={`Reset to calculated (${baseBatches})`}>↺</button>
          )}
        </label>

        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{Math.round(units)} units</span>

        {products && products.length > 1 && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            ({products.map(p => `${p.prod_name} ×${Math.round(p.units)}`).join(', ')})
          </span>
        )}

        <span style={{ flex: 1 }} />
        <button className={`btn btn-sm ${editing ? 'btn-primary' : 'btn-secondary'}`}
          onClick={e => { stop(e); setEditing(v => !v) }}
          title="Edit the base (per-batch) recipe amounts — saves to the master recipe">
          {editing ? '✓ Done' : '✎ Edit Recipe'}
        </button>
      </div>

      {open && (
        <div style={{ padding: '4px 0' }}>
          {editing && (
            <div style={{ padding: '4px 12px', fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>
              Editing base per-batch amounts — changes save to the master recipe and rescale everywhere.
            </div>
          )}
          {rows.length === 0 ? (
            <div style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: 13 }}>No recipe found for this product.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--thead-bg)' }}>
                  {['Ingredient', 'Tsp', 'Tbsp', 'Cups', 'Lbs', 'Qty'].map(h => (
                    <th key={h} style={{ textAlign: h === 'Ingredient' ? 'left' : 'right', padding: '6px 8px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', color: 'var(--thead-text)', paddingLeft: h === 'Ingredient' ? 12 : 8 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((ing, i) => (
                  <IngredientRow key={ing.id ?? i} row={ing} scale={scale} editing={editing} onSave={saveField} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

export default function RecipeGenerator() {
  const [date, setDate]       = useState('')
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [search, setSearch]   = useState('')
  const [showBatch, setShowBatch] = useState(true)
  const [showMult,  setShowMult]  = useState(true)

  useEffect(() => {
    fetch('/api/settings', { credentials: 'include' })
      .then(r => r.json())
      .then(s => setDate(s.baking_date || new Date().toISOString().slice(0, 10)))
      .catch(() => setDate(new Date().toISOString().slice(0, 10)))
  }, [])

  async function generate() {
    if (!date) return
    setLoading(true); setError(''); setData(null)
    try {
      const r = await fetch(`/api/recipe-generator?date=${date}`, { credentials: 'include' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setData(d)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const q = search.toLowerCase()
  const filteredBatch = (data?.batch_groups || []).filter(g => !q || g.group.toLowerCase().includes(q) || g.products?.some(p => p.prod_name.toLowerCase().includes(q)))
  const filteredMult  = (data?.mult_products || []).filter(p => !q || p.prod_name.toLowerCase().includes(q))

  return (
    <div>
      <div className="page-toolbar" style={{ marginBottom: 12 }}>
        <label>
          Baking Date:
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </label>
        <button className="btn btn-primary" onClick={generate} disabled={loading || !date}>
          {loading ? 'Calculating…' : '⚙ Generate Recipes'}
        </button>
        {data && (
          <>
            <input type="text" placeholder="Search recipes…" value={search} onChange={e => setSearch(e.target.value)}
              style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '5px 10px', fontSize: 13, width: 200 }} />
            <div style={{ display: 'flex', gap: 4 }}>
              <button className={`btn btn-sm ${showBatch ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setShowBatch(v => !v)}>
                {showBatch ? '▣' : '▢'} Batch ({filteredBatch.length})
              </button>
              <button className={`btn btn-sm ${showMult ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setShowMult(v => !v)}>
                {showMult ? '▣' : '▢'} Mult ({filteredMult.length})
              </button>
            </div>
          </>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}

      {data && filteredBatch.length === 0 && filteredMult.length === 0 && (
        <div className="empty-state">{search ? 'No recipes match your search.' : `No orders found for ${date}.`}</div>
      )}

      {data && showBatch && filteredBatch.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 }}>
            Batch Recipes ({filteredBatch.length})
          </div>
          {filteredBatch.map(g => (
            <RecipeCard key={g.group} title={g.group} type="batch"
              baseBatches={g.batches} units={g.total_equiv}
              products={g.products} recipe={g.recipe} onError={setError} />
          ))}
        </div>
      )}

      {data && showMult && filteredMult.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 }}>
            Multiplier Recipes ({filteredMult.length})
          </div>
          {filteredMult.map(p => (
            <RecipeCard key={p.prod_name} title={p.prod_name} type="mult"
              baseBatches={p.batches} units={p.units}
              products={null} recipe={p.recipe} onError={setError} />
          ))}
        </div>
      )}
    </div>
  )
}
