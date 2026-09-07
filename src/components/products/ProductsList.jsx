import { useState, useEffect, useMemo, Fragment } from 'react'
import EditableCell from '../shared/EditableCell'

const EMPTY_NEW = { prod_name: '', prod_type: '', prod_group: '', subtype: '', multiplier: 1, divisor: 1, batch: false, is_extra: false, notes: '' }

const TABS = [
  { key: 'basic',  label: 'Basic' },
  { key: 'labels', label: 'Labels' },
  { key: 'codes',  label: 'Codes & Sizes' },
]

function BoolCell({ value, onChange }) {
  return <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} style={{ cursor: 'pointer' }} />
}

const TYPE_INPUT_STYLE = { width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px 8px', fontSize: 13, fontFamily: 'var(--font)', background: 'var(--surface)', color: 'inherit' }

// Product Type dropdown: pick from existing types, or "＋ New type…" to type a
// brand-new one (types aren't a fixed list — they're derived from products).
// Option elements are identical in every row, so they are built once per type
// list rather than once per product. React elements are plain objects and are
// safe to render in more than one place. Rebuilding them per row is what made a
// 349-row Special Orders day take ten seconds to draw.
const typeOptionsCache = { key: null, els: null }
function typeOptionEls(options) {
  const key = options.join(',')
  if (typeOptionsCache.key !== key) {
    typeOptionsCache.key = key
    typeOptionsCache.els = options.map(t => <option key={t} value={t}>{t}</option>)
  }
  return typeOptionsCache.els
}

function TypeSelect({ value, options, onChange }) {
  const NEW = '__add_new__'
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState('')
  if (creating) {
    return (
      <input autoFocus type="text" placeholder="New type…" value={draft}
        style={TYPE_INPUT_STYLE}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { const v = draft.trim(); if (v) onChange(v); setCreating(false); setDraft('') }}
        onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur() } if (e.key === 'Escape') { setCreating(false); setDraft('') } }} />
    )
  }
  const known = !value || options.includes(value)
  return (
    <select value={value || ''} style={{ ...TYPE_INPUT_STYLE, cursor: 'pointer' }}
      onChange={e => { const v = e.target.value; if (v === NEW) { setDraft(''); setCreating(true) } else onChange(v) }}>
      <option value="">— Type —</option>
      {!known && <option value={value}>{value}</option>}
      {typeOptionEls(options)}
      <option value={NEW}>＋ New type…</option>
    </select>
  )
}

export default function ProductsList() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newProd, setNewProd] = useState(EMPTY_NEW)
  const [adding, setAdding] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [tab, setTab] = useState('basic')
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [extrasOnly, setExtrasOnly] = useState(false)

  useEffect(() => { load() }, [showInactive])

  function load() {
    setLoading(true)
    fetch(`/api/products${showInactive ? '?all=1' : ''}`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data)) { setError(data?.error || 'Failed to load products'); setLoading(false); return }
        setProducts(data); setLoading(false)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }

  // Renaming the primary key goes through its own endpoint: every table that
  // references a product declares ON UPDATE CASCADE, so orders, prices, recipes
  // and the rest follow the new name in one statement — including historical
  // ones, which is the point. A rename is the same product under a new name,
  // not a new product.
  async function rename(from, to) {
    const next = String(to || '').trim()
    if (!next || next === from) return
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(from)}/rename`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ prod_name: next }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `Rename failed (${res.status})`)
      setProducts(prev => prev.map(p => p.prod_name === from ? { ...p, prod_name: next } : p))
      setError('')
    } catch (e) {
      setError(`Rename failed: ${e.message}`)
    }
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


  const safeProducts = useMemo(() => (Array.isArray(products) ? products : []), [products])
  const q = search.toLowerCase()
  const filtered = useMemo(() => safeProducts.filter(p => {
    if (extrasOnly && !p.is_extra) return false
    if (filterType && (p.prod_type || '') !== filterType) return false
    if (q && !(
      (p.prod_name||'').toLowerCase().includes(q) ||
      (p.prod_type||'').toLowerCase().includes(q) ||
      (p.prod_group||'').toLowerCase().includes(q))) return false
    return true
  }), [safeProducts, extrasOnly, filterType, q])

  const productTypes = useMemo(
    () => [...new Set(safeProducts.map(p => p.prod_type).filter(Boolean))].sort(),
    [safeProducts])

  const totalShown = filtered.length
  const groups = useMemo(() => filtered.reduce((acc, p) => {
    const g = p.prod_group || '—'
    if (!acc[g]) acc[g] = []
    acc[g].push(p)
    return acc
  }, {}), [filtered])

  // After every hook, never before. Returning early above the useMemos meant the
  // first (loading) render ran none of them and the next ran four, which is
  // exactly what React #310 reports.
  if (loading) return <div className="loading">Loading products...</div>

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
        <input
          type="text"
          placeholder="Search products…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '5px 10px', fontSize: 13, width: 200 }}
        />
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          title="Filter by product type"
          style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '5px 8px', fontSize: 13, width: 160, cursor: 'pointer', background: filterType ? 'var(--primary-light)' : 'var(--surface)', color: 'inherit' }}
        >
          <option value="">All types</option>
          {productTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <span className="toolbar-info">
          {(search || filterType || extrasOnly) ? `${totalShown} of ${safeProducts.length}` : `${safeProducts.length} total`}
        </span>
        <label style={{ gap: 6, fontWeight: extrasOnly ? 700 : 400, color: extrasOnly ? 'var(--primary)' : 'inherit' }}
          title="Show only products flagged as extras — the same flag the Orders screen filters on.">
          <input type="checkbox" checked={extrasOnly} onChange={e => setExtrasOnly(e.target.checked)} />
          Extras only
        </label>
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
                  <th style={{ minWidth: 60, textAlign: 'center' }}>Extra</th>
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
                        <td style={{ fontWeight: 600, paddingLeft: 16 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <EditableCell value={p.prod_name} onSave={v => rename(p.prod_name, v)} type="text" align="left" />
                            {p.has_recipe && <span style={{ color: '#16a34a', fontSize: 11, fontWeight: 700 }} title="Has recipe">●</span>}
                          </span>
                        </td>
                        <td><TypeSelect value={p.prod_type||''} options={productTypes} onChange={v=>save(p.prod_name,'prod_type',v)}/></td>
                        <td><EditableCell value={p.prod_group||''} onSave={v=>save(p.prod_name,'prod_group',v)} type="text" align="left"/></td>
                        <td><EditableCell value={p.subtype||''} onSave={v=>save(p.prod_name,'subtype',v)} type="text" align="left"/></td>
                        <td style={{textAlign:'center'}}><BoolCell value={p.batch} onChange={v=>save(p.prod_name,'batch',v)}/></td>
                        <td style={{textAlign:'center'}}><BoolCell value={p.gluten_free} onChange={v=>save(p.prod_name,'gluten_free',v)}/></td>
                        <td style={{textAlign:'center'}}><BoolCell value={p.is_extra} onChange={v=>save(p.prod_name,'is_extra',v)}/></td>
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
                    <td><TypeSelect value={newProd.prod_type} options={productTypes} onChange={v=>setNewProd(p=>({...p,prod_type:v}))}/></td>
                    <td><input type="text" placeholder="Group" value={newProd.prod_group}
                      style={{width:'100%',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',padding:'4px 8px',fontSize:13,fontFamily:'var(--font)'}}
                      onChange={e=>setNewProd(p=>({...p,prod_group:e.target.value}))}/></td>
                    <td colSpan={5} style={{textAlign:'center',whiteSpace:'nowrap'}}>
                      <button className="btn btn-primary btn-sm" style={{marginRight:6}} onClick={addProduct}>Add</button>
                      <button className="btn btn-secondary btn-sm" onClick={()=>{setAdding(false);setNewProd(EMPTY_NEW)}}>Cancel</button>
                    </td>
                    <td><input type="text" placeholder="Notes" value={newProd.notes}
                      style={{width:'100%',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',padding:'4px 8px',fontSize:13,fontFamily:'var(--font)'}}
                      onChange={e=>setNewProd(p=>({...p,notes:e.target.value}))}/></td>
                  </tr>
                )}
                {safeProducts.length===0&&!adding&&<tr><td colSpan={9} style={{textAlign:'center',color:'var(--text-muted)',padding:32}}>No products yet.</td></tr>}
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
                {filtered.map(p => (
                  <tr key={p.prod_name} style={{ opacity: p.active ? 1 : 0.5 }}>
                    <td style={{ fontWeight: 500 }}>
                      {p.prod_name}
                      {p.has_recipe && <span style={{ marginLeft: 6, color: '#16a34a', fontSize: 11, fontWeight: 700 }} title="Has recipe">●</span>}
                    </td>
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
                {filtered.map(p => (
                  <tr key={p.prod_name} style={{ opacity: p.active ? 1 : 0.5 }}>
                    <td style={{ fontWeight: 500 }}>
                      {p.prod_name}
                      {p.has_recipe && <span style={{ marginLeft: 6, color: '#16a34a', fontSize: 11, fontWeight: 700 }} title="Has recipe">●</span>}
                    </td>
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
