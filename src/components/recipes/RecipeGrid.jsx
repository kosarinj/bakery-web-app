import { useState, useEffect } from 'react'
import EditableCell from '../shared/EditableCell'

const EMPTY_NEW = { ingredient: '', sequence: 0, qty: 0, teaspoons: 0, tablespoons: 0, cups: 0, pounds: 0, rectext: '' }

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

  useEffect(() => {
    Promise.all([
      fetch('/api/products', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/ingredients', { credentials: 'include' }).then(r => r.json()),
    ]).then(([prods, ings]) => {
      setProducts(prods)
      setIngredients(ings)
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
      </div>
    </div>
  )
}
