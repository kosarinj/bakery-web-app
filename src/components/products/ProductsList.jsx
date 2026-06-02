import { useState, useEffect } from 'react'
import EditableCell from '../shared/EditableCell'

const EMPTY_NEW = { prod_name: '', prod_type: '', prod_group: '', barcode: '', multiplier: 1, divisor: 1, batch: false, notes: '' }

export default function ProductsList() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newProd, setNewProd] = useState(EMPTY_NEW)
  const [adding, setAdding] = useState(false)
  const [showInactive, setShowInactive] = useState(false)

  useEffect(() => { load() }, [showInactive])

  function load() {
    setLoading(true)
    const url = showInactive ? '/api/products?all=1' : '/api/products'
    fetch(url, { credentials: 'include' })
      .then(r => r.json())
      .then(data => { setProducts(data); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }

  async function saveField(prod_name, field, value) {
    try {
      await fetch(`/api/products/${encodeURIComponent(prod_name)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ [field]: value })
      })
      setProducts(prev => prev.map(p => p.prod_name === prod_name ? { ...p, [field]: value } : p))
    } catch (e) {
      setError(`Save failed: ${e.message}`)
    }
  }

  async function addProduct() {
    if (!newProd.prod_name.trim()) return
    try {
      const r = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(newProd)
      })
      const row = await r.json()
      if (!r.ok) throw new Error(row.error)
      setProducts(prev => [...prev, row])
      setNewProd(EMPTY_NEW)
      setAdding(false)
    } catch (e) {
      setError(`Add failed: ${e.message}`)
    }
  }

  if (loading) return <div className="loading">Loading products...</div>

  // Group by prod_group
  const groups = products.reduce((acc, p) => {
    const g = p.prod_group || '—'
    if (!acc[g]) acc[g] = []
    acc[g].push(p)
    return acc
  }, {})

  return (
    <div>
      <div className="page-toolbar">
        <span className="toolbar-info">{products.length} products</span>
        <label style={{ gap: 6 }}>
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
        <div className="toolbar-spacer" />
        {!adding && (
          <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>+ Add Product</button>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="section-card">
        <div className="grid-scroll-container" style={{ border: 'none', borderRadius: 0, boxShadow: 'none', maxHeight: 'calc(100vh - 140px)' }}>
          <table className="data-grid" style={{ minWidth: 750 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 160 }}>Product Name</th>
                <th style={{ minWidth: 90 }}>Type</th>
                <th style={{ minWidth: 110 }}>Group</th>
                <th style={{ minWidth: 90 }}>Barcode</th>
                <th style={{ minWidth: 70, textAlign: 'right' }}>Multiplier</th>
                <th style={{ minWidth: 70, textAlign: 'right' }}>Divisor</th>
                <th style={{ minWidth: 60, textAlign: 'center' }}>Batch</th>
                <th style={{ minWidth: 60, textAlign: 'center' }}>Active</th>
                <th style={{ minWidth: 180 }}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(groups).map(([group, items]) => (
                <>
                  <tr key={`g-${group}`} className="inv-group-header">
                    <td colSpan={9}>{group}</td>
                  </tr>
                  {items.map(prod => (
                    <tr key={prod.prod_name} style={{ opacity: prod.active ? 1 : 0.5 }}>
                      <td style={{ fontWeight: 500, paddingLeft: 16 }}>{prod.prod_name}</td>
                      <td>
                        <EditableCell value={prod.prod_type || ''} onSave={v => saveField(prod.prod_name, 'prod_type', v)} type="text" align="left" />
                      </td>
                      <td>
                        <EditableCell value={prod.prod_group || ''} onSave={v => saveField(prod.prod_name, 'prod_group', v)} type="text" align="left" />
                      </td>
                      <td>
                        <EditableCell value={prod.barcode || ''} onSave={v => saveField(prod.prod_name, 'barcode', v)} type="text" align="left" />
                      </td>
                      <td>
                        <EditableCell value={parseFloat(prod.multiplier) || 1} onSave={v => saveField(prod.prod_name, 'multiplier', v)} type="number" align="right" />
                      </td>
                      <td>
                        <EditableCell value={parseFloat(prod.divisor) || 1} onSave={v => saveField(prod.prod_name, 'divisor', v)} type="number" align="right" />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <input type="checkbox" checked={!!prod.batch}
                          onChange={e => saveField(prod.prod_name, 'batch', e.target.checked)} />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span
                          className={`badge ${prod.active ? 'badge-green' : 'badge-red'}`}
                          style={{ cursor: 'pointer' }}
                          onClick={() => saveField(prod.prod_name, 'active', !prod.active)}
                          title="Click to toggle"
                        >
                          {prod.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <EditableCell value={prod.notes || ''} onSave={v => saveField(prod.prod_name, 'notes', v)} type="text" align="left" />
                      </td>
                    </tr>
                  ))}
                </>
              ))}

              {adding && (
                <tr style={{ background: 'var(--cell-edit-bg)' }}>
                  <td>
                    <input
                      autoFocus
                      type="text"
                      placeholder="Product name"
                      style={{ width: '100%', border: '2px solid var(--primary)', borderRadius: 'var(--radius-sm)', padding: '4px 8px', fontSize: 13, fontFamily: 'var(--font)' }}
                      value={newProd.prod_name}
                      onChange={e => setNewProd(p => ({ ...p, prod_name: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') addProduct(); if (e.key === 'Escape') { setAdding(false); setNewProd(EMPTY_NEW) } }}
                    />
                  </td>
                  <td>
                    <input type="text" placeholder="Type"
                      style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px 8px', fontSize: 13, fontFamily: 'var(--font)' }}
                      value={newProd.prod_type} onChange={e => setNewProd(p => ({ ...p, prod_type: e.target.value }))} />
                  </td>
                  <td>
                    <input type="text" placeholder="Group"
                      style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px 8px', fontSize: 13, fontFamily: 'var(--font)' }}
                      value={newProd.prod_group} onChange={e => setNewProd(p => ({ ...p, prod_group: e.target.value }))} />
                  </td>
                  <td>
                    <input type="text" placeholder="Barcode"
                      style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px 8px', fontSize: 13, fontFamily: 'var(--font)' }}
                      value={newProd.barcode} onChange={e => setNewProd(p => ({ ...p, barcode: e.target.value }))} />
                  </td>
                  <td colSpan={4} style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <button className="btn btn-primary btn-sm" style={{ marginRight: 6 }} onClick={addProduct}>Add</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setAdding(false); setNewProd(EMPTY_NEW) }}>Cancel</button>
                  </td>
                  <td>
                    <input type="text" placeholder="Notes"
                      style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px 8px', fontSize: 13, fontFamily: 'var(--font)' }}
                      value={newProd.notes} onChange={e => setNewProd(p => ({ ...p, notes: e.target.value }))} />
                  </td>
                </tr>
              )}

              {products.length === 0 && !adding && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                    No products yet. Click "+ Add Product" to add one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
