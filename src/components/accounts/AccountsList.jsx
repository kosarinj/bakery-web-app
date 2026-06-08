import { useState, useEffect } from 'react'
import EditableCell from '../shared/EditableCell'

const CATEGORIES = ['wholesale', 'retail', 'farmers_market', 'other']

const EMPTY_NEW = {
  name: '', route: '', sequence: 0, category: 'wholesale',
  acctgrp: '', region: '', prefix: '', notes: ''
}

const TABS = [
  { key: 'basic',    label: 'Basic' },
  { key: 'contact',  label: 'Contact' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'web',      label: 'Web / Other' },
]

function BoolCell({ value, onChange }) {
  return (
    <input type="checkbox" checked={!!value}
      onChange={e => onChange(e.target.checked)}
      style={{ cursor: 'pointer' }} />
  )
}

export default function AccountsList() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newAcct, setNewAcct] = useState(EMPTY_NEW)
  const [adding, setAdding] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [tab, setTab] = useState('basic')
  const [search, setSearch] = useState('')

  useEffect(() => { load() }, [showInactive])

  function load() {
    setLoading(true)
    fetch(`/api/accounts${showInactive ? '?all=1' : ''}`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data)) { setError(data?.error || 'Failed to load accounts'); setLoading(false); return }
        setAccounts(data); setLoading(false)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }

  async function save(name, field, value) {
    try {
      await fetch(`/api/accounts/${encodeURIComponent(name)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ [field]: value })
      })
      setAccounts(prev => prev.map(a => a.name === name ? { ...a, [field]: value } : a))
    } catch (e) { setError(`Save failed: ${e.message}`) }
  }

  async function addAccount() {
    if (!newAcct.name.trim()) return
    try {
      const r = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(newAcct)
      })
      const row = await r.json()
      if (!r.ok) throw new Error(row.error)
      setAccounts(prev => [...prev, row])
      setNewAcct(EMPTY_NEW)
      setAdding(false)
    } catch (e) { setError(`Add failed: ${e.message}`) }
  }

  if (loading) return <div className="loading">Loading accounts...</div>

  const fmtDate = v => v ? new Date(v).toLocaleDateString() : ''
  const q = search.toLowerCase()
  const visibleAccounts = q
    ? accounts.filter(a => (a.name||'').toLowerCase().includes(q) || (a.acctgrp||'').toLowerCase().includes(q) || (a.route||'').toLowerCase().includes(q))
    : accounts

  return (
    <div>
      <div className="page-toolbar">
        <div style={{ display: 'flex', gap: 2 }}>
          {TABS.map(t => (
            <button
              key={t.key}
              className={`btn btn-sm ${tab === t.key ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setTab(t.key)}
            >{t.label}</button>
          ))}
        </div>
        <input type="text" placeholder="Search accounts…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '5px 10px', fontSize: 13, width: 180 }} />
        <span className="toolbar-info">{visibleAccounts.length} of {accounts.length}</span>
        <label style={{ gap: 6 }}>
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
        <div className="toolbar-spacer" />
        {!adding && (
          <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>+ Add Account</button>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="section-card">
        <div className="grid-scroll-container" style={{ border: 'none', borderRadius: 0, boxShadow: 'none', maxHeight: 'calc(100vh - 145px)' }}>

          {/* ── BASIC TAB ────────────────────────────────────────── */}
          {tab === 'basic' && (
            <table className="data-grid" style={{ minWidth: 800 }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 150 }}>Account Name</th>
                  <th style={{ minWidth: 90 }}>Group</th>
                  <th style={{ minWidth: 100 }}>Subcategory</th>
                  <th style={{ minWidth: 110 }}>Category</th>
                  <th style={{ minWidth: 80 }}>Route</th>
                  <th style={{ minWidth: 55, textAlign: 'right' }}>Seq</th>
                  <th style={{ minWidth: 90 }}>Region</th>
                  <th style={{ minWidth: 100 }}>Day of Week</th>
                  <th style={{ minWidth: 70, textAlign: 'center' }}>Active</th>
                  <th style={{ minWidth: 200 }}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {visibleAccounts.map(a => (
                  <tr key={a.name} style={{ opacity: a.active ? 1 : 0.5 }}>
                    <td style={{ fontWeight: 600 }}>{a.name}</td>
                    <td><EditableCell value={a.acctgrp||''} onSave={v=>save(a.name,'acctgrp',v)} type="text" align="left"/></td>
                    <td><EditableCell value={a.subcategory||''} onSave={v=>save(a.name,'subcategory',v)} type="text" align="left"/></td>
                    <td>
                      <select value={a.category||'wholesale'} onChange={e=>save(a.name,'category',e.target.value)}
                        style={{border:'1px solid var(--border-light)',borderRadius:2,padding:'2px 6px',fontSize:13,background:'transparent'}}>
                        {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td><EditableCell value={a.route||''} onSave={v=>save(a.name,'route',v)} type="text" align="left"/></td>
                    <td><EditableCell value={a.sequence??0} onSave={v=>save(a.name,'sequence',v)} type="number" align="right"/></td>
                    <td><EditableCell value={a.region||''} onSave={v=>save(a.name,'region',v)} type="text" align="left"/></td>
                    <td><EditableCell value={a.day_of_week||''} onSave={v=>save(a.name,'day_of_week',v)} type="text" align="left"/></td>
                    <td style={{textAlign:'center'}}>
                      <span className={`badge ${a.active?'badge-green':'badge-red'}`} style={{cursor:'pointer'}}
                        onClick={()=>save(a.name,'active',!a.active)}>
                        {a.active?'Active':'Inactive'}
                      </span>
                    </td>
                    <td><EditableCell value={a.notes||''} onSave={v=>save(a.name,'notes',v)} type="text" align="left"/></td>
                  </tr>
                ))}
                {adding && (
                  <tr style={{background:'var(--cell-edit-bg)'}}>
                    <td><input autoFocus type="text" placeholder="Account name" value={newAcct.name}
                      style={{width:'100%',border:'2px solid var(--primary)',borderRadius:'var(--radius-sm)',padding:'4px 8px',fontSize:13,fontFamily:'var(--font)'}}
                      onChange={e=>setNewAcct(p=>({...p,name:e.target.value}))}
                      onKeyDown={e=>{if(e.key==='Enter')addAccount();if(e.key==='Escape'){setAdding(false);setNewAcct(EMPTY_NEW)}}}/></td>
                    <td><input type="text" placeholder="Group" value={newAcct.acctgrp}
                      style={{width:'100%',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',padding:'4px 8px',fontSize:13,fontFamily:'var(--font)'}}
                      onChange={e=>setNewAcct(p=>({...p,acctgrp:e.target.value}))}/></td>
                    <td colSpan={2}>
                      <select value={newAcct.category} onChange={e=>setNewAcct(p=>({...p,category:e.target.value}))}
                        style={{border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',padding:'4px 8px',fontSize:13,fontFamily:'var(--font)'}}>
                        {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td><input type="text" placeholder="Route" value={newAcct.route}
                      style={{width:'100%',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',padding:'4px 8px',fontSize:13,fontFamily:'var(--font)'}}
                      onChange={e=>setNewAcct(p=>({...p,route:e.target.value}))}/></td>
                    <td><input type="number" value={newAcct.sequence}
                      style={{width:60,border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',padding:'4px',textAlign:'right',fontSize:13}}
                      onChange={e=>setNewAcct(p=>({...p,sequence:parseInt(e.target.value)||0}))}/></td>
                    <td colSpan={3} style={{textAlign:'center',whiteSpace:'nowrap'}}>
                      <button className="btn btn-primary btn-sm" style={{marginRight:6}} onClick={addAccount}>Add</button>
                      <button className="btn btn-secondary btn-sm" onClick={()=>{setAdding(false);setNewAcct(EMPTY_NEW)}}>Cancel</button>
                    </td>
                    <td><input type="text" placeholder="Notes" value={newAcct.notes}
                      style={{width:'100%',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',padding:'4px 8px',fontSize:13,fontFamily:'var(--font)'}}
                      onChange={e=>setNewAcct(p=>({...p,notes:e.target.value}))}/></td>
                  </tr>
                )}
                {accounts.length===0&&!adding&&<tr><td colSpan={10} style={{textAlign:'center',color:'var(--text-muted)',padding:32}}>No accounts yet.</td></tr>}
              </tbody>
            </table>
          )}

          {/* ── CONTACT TAB ──────────────────────────────────────── */}
          {tab === 'contact' && (
            <table className="data-grid" style={{ minWidth: 800 }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 150 }}>Account Name</th>
                  <th style={{ minWidth: 200 }}>Address</th>
                  <th style={{ minWidth: 100 }}>City</th>
                  <th style={{ minWidth: 50 }}>State</th>
                  <th style={{ minWidth: 130 }}>Phone</th>
                  <th style={{ minWidth: 130 }}>Fax</th>
                  <th style={{ minWidth: 180 }}>Email</th>
                  <th style={{ minWidth: 120 }}>Manager</th>
                  <th style={{ minWidth: 120 }}>Owner</th>
                </tr>
              </thead>
              <tbody>
                {visibleAccounts.map(a => (
                  <tr key={a.name} style={{ opacity: a.active ? 1 : 0.5 }}>
                    <td style={{ fontWeight: 600 }}>{a.name}</td>
                    <td><EditableCell value={a.address||''} onSave={v=>save(a.name,'address',v)} type="text" align="left"/></td>
                    <td><EditableCell value={a.city||''} onSave={v=>save(a.name,'city',v)} type="text" align="left"/></td>
                    <td><EditableCell value={a.state||''} onSave={v=>save(a.name,'state',v)} type="text" align="left"/></td>
                    <td><EditableCell value={a.phone||''} onSave={v=>save(a.name,'phone',v)} type="text" align="left"/></td>
                    <td><EditableCell value={a.fax||''} onSave={v=>save(a.name,'fax',v)} type="text" align="left"/></td>
                    <td><EditableCell value={a.email||''} onSave={v=>save(a.name,'email',v)} type="text" align="left"/></td>
                    <td><EditableCell value={a.manager||''} onSave={v=>save(a.name,'manager',v)} type="text" align="left"/></td>
                    <td><EditableCell value={a.owner||''} onSave={v=>save(a.name,'owner',v)} type="text" align="left"/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ── DELIVERY TAB ─────────────────────────────────────── */}
          {tab === 'delivery' && (
            <table className="data-grid" style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 150 }}>Account Name</th>
                  <th style={{ minWidth: 200 }}>Delivery Instructions</th>
                  <th style={{ minWidth: 55 }}>Prefix</th>
                  <th style={{ minWidth: 65, textAlign:'center' }}>Post Ord</th>
                  <th style={{ minWidth: 65, textAlign:'center' }}>Entire Inv</th>
                  <th style={{ minWidth: 70, textAlign:'center' }}>Wrap Muf</th>
                  <th style={{ minWidth: 65, textAlign:'center' }}>Print Inv</th>
                  <th style={{ minWidth: 100 }}>Next Del</th>
                  <th style={{ minWidth: 70, textAlign:'right' }}>Mkt Fee</th>
                  <th style={{ minWidth: 60, textAlign:'right' }}>Gas</th>
                  <th style={{ minWidth: 60, textAlign:'right' }}>Tolls</th>
                  <th style={{ minWidth: 70, textAlign:'right' }}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {visibleAccounts.map(a => (
                  <tr key={a.name} style={{ opacity: a.active ? 1 : 0.5 }}>
                    <td style={{ fontWeight: 600 }}>{a.name}</td>
                    <td><EditableCell value={a.del_inst||''} onSave={v=>save(a.name,'del_inst',v)} type="text" align="left"/></td>
                    <td><EditableCell value={a.prefix||''} onSave={v=>save(a.name,'prefix',v)} type="text" align="left"/></td>
                    <td style={{textAlign:'center'}}><BoolCell value={a.postord} onChange={v=>save(a.name,'postord',v)}/></td>
                    <td style={{textAlign:'center'}}><BoolCell value={a.entire_inv} onChange={v=>save(a.name,'entire_inv',v)}/></td>
                    <td style={{textAlign:'center'}}><BoolCell value={a.wrap_muffins} onChange={v=>save(a.name,'wrap_muffins',v)}/></td>
                    <td style={{textAlign:'center'}}><BoolCell value={a.print_inv} onChange={v=>save(a.name,'print_inv',v)}/></td>
                    <td>
                      <input type="date" value={a.next_del ? String(a.next_del).slice(0,10) : ''}
                        onChange={e => save(a.name, 'next_del', e.target.value || null)}
                        style={{ border: 'none', background: 'transparent', fontSize: 12, color: 'var(--text)', cursor: 'pointer' }} />
                    </td>
                    <td><EditableCell value={parseFloat(a.marketfee)||0} onSave={v=>save(a.name,'marketfee',v)} type="number" align="right"/></td>
                    <td><EditableCell value={parseFloat(a.gas)||0} onSave={v=>save(a.name,'gas',v)} type="number" align="right"/></td>
                    <td><EditableCell value={parseFloat(a.tolls)||0} onSave={v=>save(a.name,'tolls',v)} type="number" align="right"/></td>
                    <td><EditableCell value={parseFloat(a.balance)||0} onSave={v=>save(a.name,'balance',v)} type="number" align="right"/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ── WEB / OTHER TAB ──────────────────────────────────── */}
          {tab === 'web' && (
            <table className="data-grid" style={{ minWidth: 700 }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 150 }}>Account Name</th>
                  <th style={{ minWidth: 180 }}>Web Name</th>
                  <th style={{ minWidth: 65, textAlign:'center' }}>Send Web</th>
                  <th style={{ minWidth: 100 }}>Web Start</th>
                  <th style={{ minWidth: 100 }}>Web End</th>
                  <th style={{ minWidth: 70, textAlign:'right' }}>Adj Level</th>
                  <th style={{ minWidth: 100 }}>Opened</th>
                  <th style={{ minWidth: 70, textAlign:'right' }}>Acct ID</th>
                </tr>
              </thead>
              <tbody>
                {visibleAccounts.map(a => (
                  <tr key={a.name} style={{ opacity: a.active ? 1 : 0.5 }}>
                    <td style={{ fontWeight: 600 }}>{a.name}</td>
                    <td><EditableCell value={a.webname||''} onSave={v=>save(a.name,'webname',v)} type="text" align="left"/></td>
                    <td style={{textAlign:'center'}}><BoolCell value={a.sendweb} onChange={v=>save(a.name,'sendweb',v)}/></td>
                    <td style={{fontSize:12,paddingLeft:6}}>{fmtDate(a.webstart)}</td>
                    <td style={{fontSize:12,paddingLeft:6}}>{fmtDate(a.webend)}</td>
                    <td><EditableCell value={a.adj_level??0} onSave={v=>save(a.name,'adj_level',v)} type="number" align="right"/></td>
                    <td style={{fontSize:12,paddingLeft:6}}>{fmtDate(a.open_dt)}</td>
                    <td style={{textAlign:'right',paddingRight:8,fontSize:12,color:'var(--text-muted)'}}>{a.acct_id||''}</td>
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
