import { useState, useEffect } from 'react'
import EditableCell from '../shared/EditableCell'

const EMPTY_NEW = { ingredient: '', sequence: 0, qty: 0, teaspoons: 0, tablespoons: 0, cups: 0, pounds: 0, rectext: '' }

function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n }
function trim(n) { const v = parseFloat(n); return v % 1 === 0 ? String(v) : v.toFixed(2).replace(/\.?0+$/, '') }

// Scale one recipe row by `scale` and return its printable ingredient parts (matches RecipeGenerator).
function scaledParts(row, scale) {
  const parts = []
  const lbs = num(row.pounds) * scale, cups = num(row.cups) * scale, tbsp = num(row.tablespoons) * scale, tsp = num(row.teaspoons) * scale, qty = num(row.qty) * scale
  if (lbs)  parts.push(`${trim(lbs)} lbs.`)
  if (cups) parts.push(`${trim(cups)} cup(s)`)
  if (tbsp) parts.push(`${trim(tbsp)} tbsp`)
  if (tsp)  parts.push(`${trim(tsp)} tsp`)
  if (qty)  parts.push(`${trim(qty)} ${row.ingr_unit || row.ingredient_unit || ''}`.trim())
  return parts
}

export default function RecipeGrid() {
  const [products, setProducts] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [selectedProduct, setSelectedProduct] = useState('')
  const [rows, setRows] = useState([])
  const [productSearch, setProductSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [newRow, setNewRow] = useState(EMPTY_NEW)
  const [adding, setAdding] = useState(false)
  const [scaleQty, setScaleQty] = useState('')   // quantity of the product to scale the recipe for
  const [bakeryName, setBakeryName] = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/products', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/ingredients', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/settings', { credentials: 'include' }).then(r => r.json()).catch(() => ({})),
    ]).then(([prods, ings, settings]) => {
      setProducts(prods)
      setIngredients(ings)
      setBakeryName(settings?.bakery_name || '')
      if (prods.length) setSelectedProduct(prods[0].prod_name)
    })
  }, [])

  useEffect(() => {
    if (!selectedProduct) return
    setLoading(true)
    fetch(`/api/recipes?product=${encodeURIComponent(selectedProduct)}`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data)) { setError(data?.error || 'Failed to load recipe'); setLoading(false); return }
        setRows(data); setLoading(false)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [selectedProduct])

  async function saveField(row, field, value) {
    try {
      await fetch(`/api/recipes/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ [field]: value })
      })
      setRows(prev => prev.map(r => r.id === row.id ? { ...r, [field]: value } : r))
    } catch (e) {
      setError(`Save failed: ${e.message}`)
    }
  }

  async function addRow() {
    if (!newRow.ingredient) return
    try {
      await fetch('/api/recipes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ product: selectedProduct, ...newRow })
      })
      setNewRow(EMPTY_NEW)
      setAdding(false)
      // Reload
      const data = await fetch(`/api/recipes?product=${encodeURIComponent(selectedProduct)}`, { credentials: 'include' }).then(r => r.json())
      setRows(data)
    } catch (e) {
      setError(`Add failed: ${e.message}`)
    }
  }

  async function deleteRow(id) {
    if (!confirm('Remove this ingredient from recipe?')) return
    try {
      await fetch(`/api/recipes/${id}`, { method: 'DELETE', credentials: 'include' })
      setRows(prev => prev.filter(r => r.id !== id))
    } catch (e) {
      setError(`Delete failed: ${e.message}`)
    }
  }

  const availableIngredients = ingredients.filter(
    i => !rows.find(r => r.ingredient === i.name)
  )

  // Scale-for-quantity: enter a number of the product, get batches the same way the
  // recipe generator does (ceil(units / multiplier)), then scale every ingredient by it.
  const selProd = products.find(p => p.prod_name === selectedProduct)
  const multiplier = num(selProd?.multiplier) || 1
  const qtyNum = num(scaleQty)
  const batches = qtyNum > 0 ? (multiplier > 0 ? Math.ceil(qtyNum / multiplier) : qtyNum) : 0
  const showScaled = qtyNum > 0 && rows.length > 0

  // Print the scaled recipe — mirrors RecipeGenerator's doPrint output for a single card.
  function printScaled() {
    if (!showScaled) return
    const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
    const line = (row) => {
      if (row.space) return '<div class="sp"></div>'
      if (row.rectext && !row.ingredient) return `<div class="sec">${esc(row.rectext)}</div>`
      return `<div class="ing"><span class="nm">${esc(row.ingredient)}:</span> ${scaledParts(row, batches).map(esc).join('  ')}</div>`
    }
    const body = rows.map(line).join('')
    const title = (bakeryName ? `${bakeryName} ` : '') + 'Recipe'
    const today = new Date().toISOString().slice(0, 10)
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)} ${esc(selectedProduct)}</title><style>
      *{box-sizing:border-box}
      body{font-family:Arial,Helvetica,sans-serif;color:#000;margin:0;padding:.4in}
      h1{font-family:"Book Antiqua","Palatino Linotype",Georgia,serif;font-size:22px;margin:0 0 4px}
      .date{font-size:12px;color:#444;margin-bottom:14px}
      .recipe{page-break-inside:avoid;margin:0 0 18px;padding-bottom:10px;border-bottom:1px solid #bbb}
      .recipe h2{font-size:16px;margin:0 0 6px}
      .recipe h2 .meta{font-weight:400;font-size:12px;color:#555}
      .ing{font-size:13px;margin:2px 0;padding-left:8px}
      .ing .nm{font-weight:700;display:inline-block;min-width:120px}
      .sec{font-size:13px;font-weight:700;font-style:italic;margin:8px 0 2px;color:#222}
      .sp{height:7px}
      @page{margin:.5in}
    </style></head><body>
      <h1>${esc(title)}</h1>
      <div class="date">${esc(today)}</div>
      <div class="recipe">
        <h2>${esc(selectedProduct)} <span class="meta">— ${trim(qtyNum)} units · ${trim(batches)} batch${batches !== 1 ? 'es' : ''}</span></h2>
        ${body || '<div class="ing">No recipe.</div>'}
      </div>
    </body></html>`
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
    document.body.appendChild(iframe)
    const doc = iframe.contentWindow.document
    doc.open(); doc.write(html); doc.close()
    iframe.contentWindow.focus()
    setTimeout(() => { iframe.contentWindow.print(); setTimeout(() => document.body.removeChild(iframe), 1500) }, 300)
  }

  return (
    <div className="recipe-layout">
      <div className="recipe-sidebar">
        <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: 6 }}>
          Products
        </div>
        <input type="text" placeholder="Search…" value={productSearch} onChange={e => setProductSearch(e.target.value)}
          style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '5px 8px', fontSize: 13, marginBottom: 4, boxSizing: 'border-box' }} />
        <select
          value={selectedProduct}
          onChange={e => setSelectedProduct(e.target.value)}
          size={Math.min(products.length + 1, 20)}
        >
          {products
            .filter(p => !productSearch || p.prod_name.toLowerCase().includes(productSearch.toLowerCase()))
            .map(p => (
              <option key={p.prod_name} value={p.prod_name}>{p.prod_name}</option>
            ))}
        </select>
      </div>

      <div className="recipe-grid-wrap">
        {error && <div className="error-message">{error}</div>}

        <div className="page-toolbar">
          <strong style={{ fontSize: 15, color: 'var(--primary)' }}>{selectedProduct}</strong>
          <div className="toolbar-spacer" />
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-muted)' }}
            title="Enter a quantity of this product to scale the recipe, then print">
            Qty:
            <input type="number" step="any" min="0" value={scaleQty}
              onChange={e => setScaleQty(e.target.value)} placeholder="0"
              style={{ width: 64, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '2px 5px', fontSize: 13, fontWeight: 700, textAlign: 'right' }} />
          </label>
          {showScaled && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              → <strong style={{ color: 'var(--primary)' }}>{trim(batches)}</strong> batch{batches !== 1 ? 'es' : ''}
              {multiplier !== 1 && <span style={{ opacity: 0.7 }}> (×{trim(multiplier)}/batch)</span>}
            </span>
          )}
          <button className="btn btn-secondary btn-sm" onClick={printScaled} disabled={!showScaled}
            title="Print this recipe scaled to the entered quantity">🖨 Print</button>
          {!adding && (
            <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}
              disabled={!selectedProduct || availableIngredients.length === 0}>
              + Add Ingredient
            </button>
          )}
        </div>

        {loading && <div className="loading">Loading recipe...</div>}

        {!loading && (
          <div className="grid-scroll-container">
            <table className="data-grid" style={{ minWidth: 600 }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 50 }}>Seq</th>
                  <th style={{ minWidth: 160 }}>Ingredient</th>
                  <th style={{ minWidth: 70, textAlign: 'right' }}>Qty</th>
                  <th style={{ minWidth: 70, textAlign: 'right' }}>Tsp</th>
                  <th style={{ minWidth: 70, textAlign: 'right' }}>Tbsp</th>
                  <th style={{ minWidth: 70, textAlign: 'right' }}>Cups</th>
                  <th style={{ minWidth: 70, textAlign: 'right' }}>Lbs</th>
                  <th style={{ minWidth: 150 }}>Notes</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id}>
                    <td>
                      <EditableCell value={row.sequence} onSave={v => saveField(row, 'sequence', v)} type="number" align="center" />
                    </td>
                    <td style={{ fontWeight: 500 }}>
                      {row.ingredient}
                      {row.ingredient_unit && <span style={{ color: 'var(--text-muted)', marginLeft: 4, fontSize: 11 }}>({row.ingredient_unit})</span>}
                    </td>
                    <td>
                      <EditableCell value={parseFloat(row.qty) || 0} onSave={v => saveField(row, 'qty', v)} type="number" align="right" />
                    </td>
                    <td>
                      <EditableCell value={parseFloat(row.teaspoons) || 0} onSave={v => saveField(row, 'teaspoons', v)} type="number" align="right" />
                    </td>
                    <td>
                      <EditableCell value={parseFloat(row.tablespoons) || 0} onSave={v => saveField(row, 'tablespoons', v)} type="number" align="right" />
                    </td>
                    <td>
                      <EditableCell value={parseFloat(row.cups) || 0} onSave={v => saveField(row, 'cups', v)} type="number" align="right" />
                    </td>
                    <td>
                      <EditableCell value={parseFloat(row.pounds) || 0} onSave={v => saveField(row, 'pounds', v)} type="number" align="right" />
                    </td>
                    <td>
                      <EditableCell value={row.rectext || ''} onSave={v => saveField(row, 'rectext', v)} type="text" align="left" />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        className="btn btn-danger btn-sm"
                        style={{ padding: '2px 6px', fontSize: 11 }}
                        onClick={() => deleteRow(row.id)}
                        title="Remove ingredient"
                      >✕</button>
                    </td>
                  </tr>
                ))}

                {adding && (
                  <tr style={{ background: 'var(--cell-edit-bg)' }}>
                    <td>
                      <input type="number" style={{ width: 50, border: '1px solid var(--border)', borderRadius: 2, padding: '2px 4px' }}
                        value={newRow.sequence} onChange={e => setNewRow(p => ({ ...p, sequence: parseInt(e.target.value) || 0 }))} />
                    </td>
                    <td>
                      <select
                        style={{ width: '100%', border: '1px solid var(--accent)', borderRadius: 2, padding: '2px 4px', fontSize: 13 }}
                        value={newRow.ingredient}
                        onChange={e => setNewRow(p => ({ ...p, ingredient: e.target.value }))}
                      >
                        <option value="">— select —</option>
                        {availableIngredients.map(i => (
                          <option key={i.name} value={i.name}>{i.name}</option>
                        ))}
                      </select>
                    </td>
                    {['qty', 'teaspoons', 'tablespoons', 'cups', 'pounds'].map(f => (
                      <td key={f}>
                        <input type="number" style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 2, padding: '2px 4px', textAlign: 'right' }}
                          value={newRow[f]} onChange={e => setNewRow(p => ({ ...p, [f]: parseFloat(e.target.value) || 0 }))} />
                      </td>
                    ))}
                    <td>
                      <input type="text" style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 2, padding: '2px 4px' }}
                        value={newRow.rectext} onChange={e => setNewRow(p => ({ ...p, rectext: e.target.value }))} />
                    </td>
                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <button className="btn btn-primary btn-sm" style={{ marginRight: 4 }} onClick={addRow}>Save</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => { setAdding(false); setNewRow(EMPTY_NEW) }}>✕</button>
                    </td>
                  </tr>
                )}

                {rows.length === 0 && !adding && (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>
                      No ingredients in recipe. Click "Add Ingredient" to start.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {!loading && showScaled && (
          <div style={{ marginTop: 16, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px 16px', background: 'var(--cell-edit-bg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <strong style={{ fontSize: 14, color: 'var(--primary)' }}>Scaled recipe</strong>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {trim(qtyNum)} {selectedProduct} → {trim(batches)} batch{batches !== 1 ? 'es' : ''}
              </span>
              <div className="toolbar-spacer" />
              <button className="btn btn-secondary btn-sm" onClick={printScaled} title="Print this scaled recipe">🖨 Print</button>
            </div>
            {rows.map(row => {
              if (row.space) return <div key={row.id} style={{ height: 8 }} />
              if (row.rectext && !row.ingredient) return <div key={row.id} style={{ fontWeight: 700, fontStyle: 'italic', margin: '8px 0 2px' }}>{row.rectext}</div>
              const parts = scaledParts(row, batches)
              return (
                <div key={row.id} style={{ fontSize: 13, margin: '2px 0', paddingLeft: 8 }}>
                  <span style={{ fontWeight: 700, display: 'inline-block', minWidth: 140 }}>{row.ingredient}:</span>
                  {parts.join('   ')}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
