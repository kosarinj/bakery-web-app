import { useState, useEffect } from 'react'

function fmt(n, unit) {
  if (!n || n === 0) return ''
  const v = parseFloat(n)
  if (!v) return ''
  const s = v % 1 === 0 ? String(v) : v.toFixed(3).replace(/\.?0+$/, '')
  return unit ? `${s} ${unit}` : s
}

function IngredientLine({ row }) {
  if (row.space) return <tr><td colSpan={5} style={{ height: 8 }} /></tr>
  if (row.rectext && !row.ingredient) {
    return (
      <tr>
        <td colSpan={5} style={{ fontWeight: 600, fontStyle: 'italic', paddingTop: 8, paddingBottom: 4, color: 'var(--primary)' }}>
          {row.rectext}
        </td>
      </tr>
    )
  }
  return (
    <tr>
      <td style={{ paddingLeft: 12, fontWeight: 500 }}>{row.ingredient}</td>
      <td style={{ textAlign: 'right', paddingRight: 8 }}>{fmt(row.teaspoons, 'tsp')}</td>
      <td style={{ textAlign: 'right', paddingRight: 8 }}>{fmt(row.tablespoons, 'tbsp')}</td>
      <td style={{ textAlign: 'right', paddingRight: 8 }}>{fmt(row.cups, 'cups')}</td>
      <td style={{ textAlign: 'right', paddingRight: 8 }}>{fmt(row.pounds, 'lbs')}{fmt(row.qty, row.ingr_unit || '')}</td>
    </tr>
  )
}

function RecipeCard({ title, batches, units, products, ingredients, type }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="section-card" style={{ marginBottom: 12 }}>
      <div className="card-header" style={{ cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <div style={{ flex: 1 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{title}</span>
          <span className={`badge ${type === 'batch' ? 'badge-purple' : 'badge-blue'}`} style={{ marginLeft: 8 }}>
            {type === 'batch' ? 'Batch' : 'Mult'}
          </span>
          <span style={{ marginLeft: 12, fontSize: 13, color: 'var(--text-muted)' }}>
            {batches} batch{batches !== 1 ? 'es' : ''} · {Math.round(units)} units
          </span>
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
            <div style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: 13 }}>
              No recipe found for this product.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--thead-bg)' }}>
                  <th style={{ textAlign: 'left', padding: '6px 12px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--thead-text)' }}>Ingredient</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', color: 'var(--thead-text)', width: 70 }}>Tsp</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', color: 'var(--thead-text)', width: 70 }}>Tbsp</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', color: 'var(--thead-text)', width: 80 }}>Cups</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', color: 'var(--thead-text)', width: 90 }}>Lbs / Qty</th>
                </tr>
              </thead>
              <tbody>
                {ingredients.map((ing, i) => <IngredientLine key={i} row={ing} />)}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

export default function RecipeGenerator() {
  const [date, setDate] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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

  const totalBatch = data?.batch_groups?.length || 0
  const totalMult  = data?.mult_products?.length || 0

  return (
    <div>
      <div className="page-toolbar" style={{ marginBottom: 16 }}>
        <label>
          Baking Date:
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </label>
        <button className="btn btn-primary" onClick={generate} disabled={loading || !date}>
          {loading ? 'Calculating…' : '⚙ Generate Recipes'}
        </button>
        {data && (
          <span className="toolbar-info">
            {totalBatch} batch group{totalBatch !== 1 ? 's' : ''} · {totalMult} mult product{totalMult !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}

      {data && totalBatch === 0 && totalMult === 0 && (
        <div className="empty-state">No orders found for {date}. Make sure orders exist for this date.</div>
      )}

      {data && (
        <>
          {data.batch_groups.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 }}>
                Batch Recipes ({data.batch_groups.length})
              </div>
              {data.batch_groups.map(g => (
                <RecipeCard key={g.group} title={g.group} type="batch"
                  batches={g.batches} units={g.total_equiv}
                  products={g.products} ingredients={g.ingredients} />
              ))}
            </div>
          )}

          {data.mult_products.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 }}>
                Multiplier Recipes ({data.mult_products.length})
              </div>
              {data.mult_products.map(p => (
                <RecipeCard key={p.prod_name} title={p.prod_name} type="mult"
                  batches={p.batches} units={p.units}
                  products={null} ingredients={p.ingredients} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
