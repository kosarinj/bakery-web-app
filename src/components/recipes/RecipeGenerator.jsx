import { useState, useEffect } from 'react'

function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n }
function trim(n) { const v = parseFloat(n); return v % 1 === 0 ? String(v) : v.toFixed(2).replace(/\.?0+$/, '') }

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
    return <tr><td colSpan={6} style={{ fontWeight: 600, fontStyle: 'italic', paddingTop: 8, paddingBottom: 4, color: 'var(--primary)' }}>{row.rectext}</td></tr>
  }
  const cell = (field, unit) => {
    const base = num(row[field])
    if (editing) {
      return (
        <input type="number" step="any" defaultValue={base || ''} placeholder="0"
          onClick={e => e.stopPropagation()}
          onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
          onBlur={e => { const v = num(e.target.value); if (v !== base) onSave(row.id, field, v) }}
          style={{ width: 58, textAlign: 'right', border: '1px solid var(--primary)', borderRadius: 'var(--radius-sm)', padding: '2px 4px', fontSize: 12, background: 'var(--cell-edit-bg)' }}
          title={`Base per-batch ${unit}`} />
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

function RecipeCard({ kind, item, onBatches, onField, onPrint }) {
  const [open, setOpen]       = useState(true)
  const [editing, setEditing] = useState(false)
  const title = kind === 'batch' ? item.group : item.prod_name
  const units = kind === 'batch' ? item.total_equiv : item.units
  const rows  = item.recipe || []
  const scale = num(item.batches)
  const stop  = e => e.stopPropagation()

  return (
    <div className="section-card" style={{ marginBottom: 10 }}>
      <div className="card-header" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }} onClick={() => setOpen(o => !o)}>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{open ? '▲' : '▼'}</span>
        <span style={{ fontWeight: 700, fontSize: 14 }}>{title}</span>
        <span className={`badge ${kind === 'batch' ? 'badge-purple' : 'badge-blue'}`}>{kind === 'batch' ? 'Batch' : 'Mult'}</span>

        <label onClick={stop} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}
          title="Number of batches to scale the recipe by">
          Batches:
          <input type="number" step="any" min="0" value={item.batches}
            onChange={e => onBatches(e.target.value)}
            style={{ width: 56, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '2px 5px', fontSize: 13, fontWeight: 700, textAlign: 'right' }} />
          {num(item.batches) !== num(item.calcBatches) && (
            <button className="btn btn-secondary btn-sm" style={{ padding: '1px 6px', fontSize: 11 }}
              onClick={() => onBatches(item.calcBatches)} title={`Reset to calculated (${item.calcBatches})`}>↺</button>
          )}
        </label>

        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{Math.round(units)} units</span>

        {item.products && item.products.length > 1 && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            ({item.products.map(p => `${p.prod_name} ×${Math.round(p.units)}`).join(', ')})
          </span>
        )}

        <span style={{ flex: 1 }} />
        <button className="btn btn-secondary btn-sm" onClick={e => { stop(e); onPrint && onPrint() }}
          title="Print just this recipe">🖨</button>
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
                  <IngredientRow key={ing.id ?? i} row={ing} scale={scale} editing={editing}
                    onSave={(rowId, field, value) => onField(rowId, field, value)} />
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
  const [bakeryName, setBakeryName] = useState('')

  useEffect(() => {
    fetch('/api/settings', { credentials: 'include' })
      .then(r => r.json())
      .then(s => { setDate(s.baking_date || new Date().toISOString().slice(0, 10)); setBakeryName(s.bakery_name || '') })
      .catch(() => setDate(new Date().toISOString().slice(0, 10)))
  }, [])

  async function generate() {
    if (!date) return
    setLoading(true); setError(''); setData(null)
    try {
      const r = await fetch(`/api/recipe-generator?date=${date}`, { credentials: 'include' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      // Remember the calculated batch count so the batch override can reset to it
      d.batch_groups = (d.batch_groups || []).map(g => ({ ...g, calcBatches: g.batches }))
      d.mult_products = (d.mult_products || []).map(p => ({ ...p, calcBatches: p.batches }))
      setData(d)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  function setBatches(kind, key, batches) {
    setData(d => {
      if (!d) return d
      const arr = kind === 'batch' ? 'batch_groups' : 'mult_products'
      const idf = kind === 'batch' ? 'group' : 'prod_name'
      return { ...d, [arr]: d[arr].map(it => it[idf] === key ? { ...it, batches } : it) }
    })
  }

  async function saveField(kind, key, rowId, field, value) {
    setData(d => {
      if (!d) return d
      const arr = kind === 'batch' ? 'batch_groups' : 'mult_products'
      const idf = kind === 'batch' ? 'group' : 'prod_name'
      return { ...d, [arr]: d[arr].map(it => it[idf] === key
        ? { ...it, recipe: it.recipe.map(r => r.id === rowId ? { ...r, [field]: value } : r) } : it) }
    })
    try {
      const r = await fetch(`/api/recipes/${rowId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ [field]: value })
      })
      if (!r.ok) throw new Error((await r.json()).error || 'save failed')
    } catch (e) { setError(`Recipe save failed: ${e.message}`) }
  }

  // Normalize a batch group / mult product into a printable card descriptor
  function buildCard(kind, item) {
    return kind === 'batch'
      ? { kind: 'batch', title: item.group, units: item.total_equiv, batches: num(item.batches), recipe: item.recipe, products: item.products }
      : { kind: 'mult', title: item.prod_name, units: item.units, batches: num(item.batches), recipe: item.recipe, products: null }
  }

  // Print all visible recipes (respects search + Batch/Mult toggles)
  function printRecipes() {
    const cards = [
      ...(showBatch ? filteredBatch.map(g => buildCard('batch', g)) : []),
      ...(showMult ? filteredMult.map(p => buildCard('mult', p)) : []),
    ]
    if (cards.length === 0) { setError('Nothing to print — generate recipes first.'); return }
    doPrint(cards)
  }

  // Print recipe sheet(s) — replicates the VB6 "bakerec" report ("<Bakery> Recipe"):
  // one recipe per product/group, with scaled ingredient lines. Uses current batch counts & edits.
  function doPrint(cards) {
    if (!cards || cards.length === 0) return
    const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))

    const line = (row, scale) => {
      if (row.space) return '<div class="sp"></div>'
      if (row.rectext && !row.ingredient) return `<div class="sec">${esc(row.rectext)}</div>`
      const parts = []
      const lbs = num(row.pounds) * scale, cups = num(row.cups) * scale, tbsp = num(row.tablespoons) * scale, tsp = num(row.teaspoons) * scale, qty = num(row.qty) * scale
      if (lbs)  parts.push(`${trim(lbs)} lbs.`)
      if (cups) parts.push(`${trim(cups)} cup(s)`)
      if (tbsp) parts.push(`${trim(tbsp)} tbsp`)
      if (tsp)  parts.push(`${trim(tsp)} tsp`)
      if (qty)  parts.push(`${trim(qty)} ${esc(row.ingr_unit || '')}`.trim())
      return `<div class="ing"><span class="nm">${esc(row.ingredient)}:</span> ${parts.join('  ')}</div>`
    }

    const blocks = cards.map(c => {
      const body = (c.recipe || []).map(r => line(r, c.batches)).join('')
      const sub = c.products && c.products.length > 1
        ? `<div class="prods">${esc(c.products.map(p => `${p.prod_name} ×${Math.round(p.units)}`).join(', '))}</div>` : ''
      return `<div class="recipe">
        <h2>${esc(c.title)} <span class="meta">— ${trim(c.batches)} batch${num(c.batches) !== 1 ? 'es' : ''} · ${Math.round(c.units)} units</span></h2>
        ${sub}
        ${body || '<div class="ing">No recipe.</div>'}
      </div>`
    }).join('')

    const title = (bakeryName ? `${bakeryName} ` : '') + 'Recipe'
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)} ${date}</title><style>
      *{box-sizing:border-box}
      body{font-family:Arial,Helvetica,sans-serif;color:#000;margin:0;padding:.4in}
      h1{font-family:"Book Antiqua","Palatino Linotype",Georgia,serif;font-size:22px;margin:0 0 4px}
      .date{font-size:12px;color:#444;margin-bottom:14px}
      .recipe{page-break-inside:avoid;margin:0 0 18px;padding-bottom:10px;border-bottom:1px solid #bbb}
      .recipe h2{font-size:16px;margin:0 0 6px}
      .recipe h2 .meta{font-weight:400;font-size:12px;color:#555}
      .prods{font-size:11px;color:#666;margin:0 0 6px}
      .ing{font-size:13px;margin:2px 0;padding-left:8px}
      .ing .nm{font-weight:700;display:inline-block;min-width:120px}
      .sec{font-size:13px;font-weight:700;font-style:italic;margin:8px 0 2px;color:#222}
      .sp{height:7px}
      @page{margin:.5in}
    </style></head><body>
      <h1>${esc(title)}</h1>
      <div class="date">Baking date: ${date}</div>
      ${blocks}
    </body></html>`

    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
    document.body.appendChild(iframe)
    const doc = iframe.contentWindow.document
    doc.open(); doc.write(html); doc.close()
    iframe.contentWindow.focus()
    setTimeout(() => { iframe.contentWindow.print(); setTimeout(() => document.body.removeChild(iframe), 1500) }, 300)
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
            <button className="btn btn-secondary" onClick={printRecipes} title="Print the generated recipes">🖨 Print Recipes</button>
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
            <RecipeCard key={g.group} kind="batch" item={g}
              onBatches={v => setBatches('batch', g.group, v)}
              onField={(rowId, field, value) => saveField('batch', g.group, rowId, field, value)}
              onPrint={() => doPrint([buildCard('batch', g)])} />
          ))}
        </div>
      )}

      {data && showMult && filteredMult.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 }}>
            Multiplier Recipes ({filteredMult.length})
          </div>
          {filteredMult.map(p => (
            <RecipeCard key={p.prod_name} kind="mult" item={p}
              onBatches={v => setBatches('mult', p.prod_name, v)}
              onField={(rowId, field, value) => saveField('mult', p.prod_name, rowId, field, value)}
              onPrint={() => doPrint([buildCard('mult', p)])} />
          ))}
        </div>
      )}
    </div>
  )
}
