import { useState, useEffect, Fragment } from 'react'
import EditableCell from '../shared/EditableCell'

const EMPTY_NEW = { prod_name: '', prod_type: '', prod_group: '', subtype: '', multiplier: 1, divisor: 1, batch: false, notes: '' }

const TABS = [
  { key: 'basic',  label: 'Basic' },
  { key: 'labels', label: 'Labels' },
  { key: 'codes',  label: 'Codes & Sizes' },
]

function BoolCell({ value, onChange }) {
  return <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} style={{ cursor: 'pointer' }} />
}

export default function ProductsList() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newProd, setNewProd] = useState(EMPTY_NEW)
  const [adding, setAdding] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [tab, setTab] = useState('basic')

  useEffect(() => { load() }, [showInactive])

  function load() {
    setLoading(true)
    fetch(`/api/products${showInactive ? '?all=1' : ''}`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => { setProducts(data); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }

  async function save(prod_name, field, value) {
    try {
      await fetch(`/api/products/${encodeURIComponent(prod_name)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ [field]: value })
      })
      setProducts(prev => prev.map(p => p.prod_name === prod_name ? { ...p, [field]: value } : p))
    } catch (e) { setError(`Save failed: ${e.message}`) }
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
    } catch (e) { setError(`Add failed: ${e.message}`) }
  }

  if (loading) return <div className="loading">Loading products...</div>

  const groups = products.reduce((acc, p) => {
    const g = p.prod_group || '—'
    if (!acc[g]) acc[g] = []
    acc[g].push(p)
    return acc
  }, {})

  return (
    <div>
      <div className="page-toolbar">
        <div style={{ display: 'flex', gap: 2 }}>
          {TABS.map(t => (
            <button key={t.key}
              className={`btn btn-sm ${tab === t.key ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </div>
        <span className="toolbar-info">{products.length} products</span>
        <label style={{ gap: 6 }}>
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
        <div className="toolbar-spacer" />
        {!adding && <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>+ Add Product</button>}
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="section-card">
        <div className="grid-scroll-container" style={{ border: 'none', borderRadius: 0, boxShadow: 'none', maxHeight: 'calc(100vh - 145px)' }}>

          {/* ── BASIC TAB ───────────────────────────────────── */}
          {tab === 'basic' && (
            <table className="data-grid" style={{ minWidth: 800 }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 170 }}>Product Name</th>
                  <th style={{ minWidth: 90 }}>Type</th>
                  <th style={{ minWidth: 110 }}>Group</th>
                  <th style={{ minWidth: 90 }}>Subtype</th>
                  <th style={{ minWidth: 65, textAlign: 'center' }}>Batch</th>
                  <th style={{ minWidth: 70, textAlign: 'center' }}>Gluten Free</th>
                  <th style={{ minWidth: 70, textAlign: 'center' }}>Active</th>
                  <th style={{ minWidth: 200 }}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(groups).map(([group, items]) => (
                  <Fragment key={group}>
                    <tr className="inv-group-header"><td colSpan={8}>{group}</td></tr>
                    {items.map(p => (
                      <tr key={p.prod_name} style={{ opacity: p.active ? 1 : 0.5 }}>
                        <td style={{ fontWeight: 600, paddingLeft: 16 }}>{p.prod_name}</td>
                        <td><EditableCell value={p.prod_type||''} onSave={v=>save(p.prod_name,'prod_type',v)} type="text" align="left"/></td>
                        <td><EditableCell value={p.prod_group||''} onSave={v=>save(p.prod_name,'prod_group',v)} type="text" align="left"/></td>
                        <td><EditableCell value={p.subtype||''} onSave={v=>save(p.prod_name,'subtype',v)} type="text" align="left"/></td>
                        <td style={{textAlign:'center'}}><BoolCell value={p.batch} onChange={v=>save(p.prod_name,'batch',v)}/></td>
                        <td style={{textAlign:'center'}}><BoolCell value={p.gluten_free} onChange={v=>save(p.prod_name,'gluten_free',v)}/></td>
                        <td style={{textAlign:'center'}}>
                          <span className={`badge ${p.active?'badge-green':'badge-red'}`} style={{cursor:'pointer'}}
                            onClick={()=>save(p.prod_name,'active',!p.active)}>
                            {p.active?'Active':'Inactive'}
                          </span>
                        </td>
                        <td><EditableCell value={p.notes||''} onSave={v=>save(p.prod_name,'notes',v)} type="text" align="left"/></td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
                {adding && (
                  <tr style={{ background: 'var(--cell-edit-bg)' }}>
                    <td><input autoFocus type="text" placeholder="Product name" value={newProd.prod_name}
                      style={{width:'100%',border:'2px solid var(--primary)',borderRadius:'var(--radius-sm)',padding:'4px 8px',fontSize:13,fontFamily:'var(--font)'}}
                      onChange={e=>setNewProd(p=>({...p,prod_name:e.target.value}))}
                      onKeyDown={e=>{if(e.key==='Enter')addProduct();if(e.key==='Escape'){setAdding(false);setNewProd(EMPTY_NEW)}}}/></td>
                    <td><input type="text" placeholder="Type" value={newProd.prod_type}
                      style={{width:'100%',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',padding:'4px 8px',fontSize:13,fontFamily:'var(--font)'}}
                      onChange={e=>setNewProd(p=>({...p,prod_type:e.target.value}))}/></td>
                    <td><input type="text" placeholder="Group" value={newProd.prod_group}
                      style={{width:'100%',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',padding:'4px 8px',fontSize:13,fontFamily:'var(--font)'}}
                      onChange={e=>setNewProd(p=>({...p,prod_group:e.target.value}))}/></td>
                    <td colSpan={4} style={{textAlign:'center',whiteSpace:'nowrap'}}>
                      <button className="btn btn-primary btn-sm" style={{marginRight:6}} onClick={addProduct}>Add</button>
                      <button className="btn btn-secondary btn-sm" onClick={()=>{setAdding(false);setNewProd(EMPTY_NEW)}}>Cancel</button>
                    </td>
                    <td><input type="text" placeholder="Notes" value={newProd.notes}
                      style={{width:'100%',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',padding:'4px 8px',fontSize:13,fontFamily:'var(--font)'}}
                      onChange={e=>setNewProd(p=>({...p,notes:e.target.value}))}/></td>
                  </tr>
                )}
                {products.length===0&&!adding&&<tr><td colSpan={8} style={{textAlign:'center',color:'var(--text-muted)',padding:32}}>No products yet.</td></tr>}
              </tbody>
            </table>
          )}

          {/* ── LABELS TAB ──────────────────────────────────── */}
          {tab === 'labels' && (
            <table className="data-grid" style={{ minWidth: 800 }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 170 }}>Product Name</th>
                  <th style={{ minWidth: 120 }}>Label 1</th>
                  <th style={{ minWidth: 120 }}>Label 2</th>
                  <th style={{ minWidth: 120 }}>Label 3</th>
                  <th style={{ minWidth: 100 }}>Which Label</th>
                  <th style={{ minWidth: 70, textAlign:'right' }}>Label Size</th>
                  <th style={{ minWidth: 70, textAlign:'right' }}>Ing Size</th>
                  <th style={{ minWidth: 70, textAlign:'right' }}>Ing Height</th>
                  <th style={{ minWidth: 70, textAlign:'right' }}>Wt Size</th>
                  <th style={{ minWidth: 70, textAlign:'right' }}>Weight</th>
                  <th style={{ minWidth: 70, textAlign:'right' }}>Labor Wt</th>
                </tr>
              </thead>
              <tbody>
                {products.map(p => (
                  <tr key={p.prod_name} style={{ opacity: p.active ? 1 : 0.5 }}>
                    <td style={{ fontWeight: 500 }}>{p.prod_name}</td>
                    <td><EditableCell value={p.label1||''} onSave={v=>save(p.prod_name,'label1',v)} type="text" align="left"/></td>
                    <td><EditableCell value={p.label2||''} onSave={v=>save(p.prod_name,'label2',v)} type="text" align="left"/></td>
                    <td><EditableCell value={p.label3||''} onSave={v=>save(p.prod_name,'label3',v)} type="text" align="left"/></td>
                    <td><EditableCell value={p.whichlabel||''} onSave={v=>save(p.prod_name,'whichlabel',v)} type="text" align="left"/></td>
                    <td><EditableCell value={parseFloat(p.labelsize)||0} onSave={v=>save(p.prod_name,'labelsize',v)} type="number" align="right"/></td>
                    <td><EditableCell value={parseFloat(p.ingsize)||0} onSave={v=>save(p.prod_name,'ingsize',v)} type="number" align="right"/></td>
                    <td><EditableCell value={parseFloat(p.ingheight)||0} onSave={v=>save(p.prod_name,'ingheight',v)} type="number" align="right"/></td>
                    <td><EditableCell value={parseFloat(p.weightsize)||0} onSave={v=>save(p.prod_name,'weightsize',v)} type="number" align="right"/></td>
                    <td><EditableCell value={parseFloat(p.weight)||0} onSave={v=>save(p.prod_name,'weight',v)} type="number" align="right"/></td>
                    <td><EditableCell value={parseFloat(p.labor_weight)||0} onSave={v=>save(p.prod_name,'labor_weight',v)} type="number" align="right"/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ── CODES & SIZES TAB ───────────────────────────── */}
          {tab === 'codes' && (
            <table className="data-grid" style={{ minWidth: 700 }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 170 }}>Product Name</th>
                  <th style={{ minWidth: 130 }}>Barcode</th>
                  <th style={{ minWidth: 130 }}>UPC Code</th>
                  <th style={{ minWidth: 70, textAlign:'right' }}>Multiplier</th>
                  <th style={{ minWidth: 70, textAlign:'right' }}>Divisor</th>
                  <th style={{ minWidth: 80 }}>Color 1</th>
                  <th style={{ minWidth: 80 }}>Color 2</th>
                  <th style={{ minWidth: 80 }}>Color 3</th>
                  <th style={{ minWidth: 90 }}>Web Type</th>
                  <th style={{ minWidth: 60, textAlign:'right' }}>ID</th>
                </tr>
              </thead>
              <tbody>
                {products.map(p => (
                  <tr key={p.prod_name} style={{ opacity: p.active ? 1 : 0.5 }}>
                    <td style={{ fontWeight: 500 }}>{p.prod_name}</td>
                    <td><EditableCell value={p.barcode||''} onSave={v=>save(p.prod_name,'barcode',v)} type="text" align="left"/></td>
                    <td><EditableCell value={p.upc_code||''} onSave={v=>save(p.prod_name,'upc_code',v)} type="text" align="left"/></td>
                    <td><EditableCell value={parseFloat(p.multiplier)||1} onSave={v=>save(p.prod_name,'multiplier',v)} type="number" align="right"/></td>
                    <td><EditableCell value={parseFloat(p.divisor)||1} onSave={v=>save(p.prod_name,'divisor',v)} type="number" align="right"/></td>
                    <td><EditableCell value={p.color1||''} onSave={v=>save(p.prod_name,'color1',v)} type="text" align="left"/></td>
                    <td><EditableCell value={p.color2||''} onSave={v=>save(p.prod_name,'color2',v)} type="text" align="left"/></td>
                    <td><EditableCell value={p.color3||''} onSave={v=>save(p.prod_name,'color3',v)} type="text" align="left"/></td>
                    <td><EditableCell value={p.webtype||''} onSave={v=>save(p.prod_name,'webtype',v)} type="text" align="left"/></td>
                    <td style={{textAlign:'right',paddingRight:8,fontSize:12,color:'var(--text-muted)'}}>{p.prod_id||''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

        </div>
      </div>
    </div>
  )
}
