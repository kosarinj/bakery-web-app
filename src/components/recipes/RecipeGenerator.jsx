import { useState, useEffect } from 'react'

function fmt(n, unit) {
  if (!n || n === 0) return ''
  const v = parseFloat(n)
  if (!v) return ''
  const s = v % 1 === 0 ? String(v) : v.toFixed(3).replace(/\.?0+$/, '')
  return unit ? `${s} ${unit}` : s
}

function IngredientLine({ row, scale }) {
  const s = scale || 1
  if (row.space) return <tr><td colSpan={6} style={{ height: 8 }} /></tr>
  if (row.rectext && !row.ingredient) {
    return (
      <tr>
        <td colSpan={6} style={{ fontWeight: 600, fontStyle: 'italic', paddingTop: 8, paddingBottom: 4, color: 'var(--primary)' }}>
          {row.rectext}
        </td>
      </tr>
    )
  }
  const tsp   = parseFloat(row.teaspoons)   * s
  const tbsp  = parseFloat(row.tablespoons) * s
  const cups  = parseFloat(row.cups)        * s
  const lbs   = parseFloat(row.pounds)      * s
  const qty   = parseFloat(row.qty)         * s
  const cost  = (parseFloat(row.cost_cup || 0) * cups) + (parseFloat(row.cost_pound || 0) * lbs)
  return (
    <tr>
      <td style={{ paddingLeft: 12, fontWeight: 500 }}>{row.ingredient}</td>
      <td style={{ textAlign: 'right', paddingRight: 8 }}>{fmt(tsp, 'tsp')}</td>
      <td style={{ textAlign: 'right', paddingRight: 8 }}>{fmt(tbsp, 'tbsp')}</td>
      <td style={{ textAlign: 'right', paddingRight: 8 }}>{fmt(cups, 'cups')}</td>
      <td style={{ textAlign: 'right', paddingRight: 8 }}>{fmt(lbs, 'lbs')}{fmt(qty, row.ingr_unit || '')}</td>
      <td style={{ textAlign: 'right', paddingRight: 8, color: 'var(--text-muted)', fontSize: 11 }}>
        {cost > 0 ? `$${cost.toFixed(2)}` : ''}
      </td>
    </tr>
  )
}

function RecipeCard({ title, batches, units, products, ingredients, type }) {
  const [open, setOpen] = useState(true)
  const totalCost = ingredients.reduce((s, r) => {
    if (!r.ingredient) return s
    const cups = parseFloat(r.cups) || 0
    const lbs  = parseFloat(r.pounds) || 0
    return s + (parseFloat(r.cost_cup || 0) * cups) + (parseFloat(r.cost_pound || 0) * lbs)
  }, 0)

  return (
    <div className="section-card" style={{ marginBottom: 10 }}>
      <div className="card-header" style={{ cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <div style={{ flex: 1 }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{title}</span>
          <span className={`badge ${type === 'batch' ? 'badge-purple' : 'badge-blue'}`} style={{ marginLeft: 8 }}>
            {type === 'batch' ? 'Batch' : 'Mult'}
          </span>
          <span style={{ marginLeft: 12, fontSize: 13, color: 'var(--text-muted)' }}>
            {batches} batch{batches !== 1 ? 'es' : ''} · {Math.round(units)} units
          </span>
          {totalCost > 0 && (
            <span style={{ marginLeft: 12, fontSize: 12, color: '#16a34a', fontWeight: 600 }}>
              Est. cost: ${totalCost.toFixed(2)}
            </span>
          )}
          {products && products.length > 1 && (
            <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)' }}>
              ({products.map(p => `${p.prod_name} ×${Math.round(p.units)}`).join(', ')})
            </span>
          )}
        </div>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={{ padding: '4px 0' }}>
          {ingredients.length === 0 ? (
            <div style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: 13 }}>No recipe found.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--thead-bg)' }}>
                  {['Ingredient','Tsp','Tbsp','Cups','Lbs / Qty','Est. Cost'].map(h => (
                    <th key={h} style={{ textAlign: h === 'Ingredient' ? 'left' : 'right', padding: '6px 8px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', color: 'var(--thead-text)', paddingLeft: h === 'Ingredient' ? 12 : 8 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ingredients.map((ing, i) => <IngredientLine key={i} row={ing} scale={1} />)}
              </tbody>
              {totalCost > 0 && (
                <tfoot>
                  <tr style={{ background: 'var(--totals-bg)', borderTop: '2px solid var(--border)' }}>
                    <td colSpan={5} style={{ padding: '6px 8px', fontWeight: 600, fontSize: 12, paddingLeft: 12 }}>Total estimated ingredient cost</td>
                    <td style={{ textAlign: 'right', paddingRight: 8, fontWeight: 700, color: '#16a34a' }}>${totalCost.toFixed(2)}</td>
                  </tr>
                </tfoot>
              )}
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
              batches={g.batches} units={g.total_equiv}
              products={g.products} ingredients={g.ingredients} />
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
              batches={p.batches} units={p.units}
              products={null} ingredients={p.ingredients} />
          ))}
        </div>
      )}
    </div>
  )
}
