import { useState, useEffect } from 'react'
import EditableCell from '../shared/EditableCell'

const CATEGORIES = ['wholesale', 'retail', 'farmers_market', 'other']

const EMPTY_NEW = { name: '', route: '', sequence: 0, category: 'wholesale', acctgrp: '', prefix: '', notes: '' }

export default function AccountsList() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newAcct, setNewAcct] = useState(EMPTY_NEW)
  const [adding, setAdding] = useState(false)
  const [showInactive, setShowInactive] = useState(false)

  useEffect(() => { load() }, [])

  function load() {
    setLoading(true)
    const url = showInactive ? '/api/accounts?all=1' : '/api/accounts'
    fetch(url, { credentials: 'include' })
      .then(r => r.json())
      .then(data => { setAccounts(data); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }

  useEffect(() => { load() }, [showInactive])

  async function saveField(name, field, value) {
    try {
      await fetch(`/api/accounts/${encodeURIComponent(name)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ [field]: value })
      })
      setAccounts(prev => prev.map(a => a.name === name ? { ...a, [field]: value } : a))
    } catch (e) {
      setError(`Save failed: ${e.message}`)
    }
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
    } catch (e) {
      setError(`Add failed: ${e.message}`)
    }
  }

  async function toggleActive(name, current) {
    await saveField(name, 'active', !current)
  }

  if (loading) return <div className="loading">Loading accounts...</div>

  return (
    <div>
      <div className="page-toolbar">
        <span className="toolbar-info">{accounts.length} accounts</span>
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
        <div className="grid-scroll-container" style={{ border: 'none', borderRadius: 0, boxShadow: 'none', maxHeight: 'calc(100vh - 140px)' }}>
          <table className="data-grid" style={{ minWidth: 800 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 150 }}>Account Name</th>
                <th style={{ minWidth: 80 }}>Route</th>
                <th style={{ minWidth: 60, textAlign: 'right' }}>Seq</th>
                <th style={{ minWidth: 110 }}>Category</th>
                <th style={{ minWidth: 90 }}>Group</th>
                <th style={{ minWidth: 70 }}>Prefix</th>
                <th style={{ minWidth: 70, textAlign: 'center' }}>Post Ord</th>
                <th style={{ minWidth: 70, textAlign: 'center' }}>Active</th>
                <th style={{ minWidth: 200 }}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map(acct => (
                <tr key={acct.name} style={{ opacity: acct.active ? 1 : 0.5 }}>
                  <td style={{ fontWeight: 500 }}>{acct.name}</td>
                  <td>
                    <EditableCell value={acct.route || ''} onSave={v => saveField(acct.name, 'route', v)} type="text" align="left" />
                  </td>
                  <td>
                    <EditableCell value={acct.sequence ?? 0} onSave={v => saveField(acct.name, 'sequence', v)} type="number" align="right" />
                  </td>
                  <td>
                    <select
                      value={acct.category || 'wholesale'}
                      onChange={e => saveField(acct.name, 'category', e.target.value)}
                      style={{ border: '1px solid var(--border-light)', borderRadius: 2, padding: '2px 6px', fontSize: 13, background: 'transparent' }}
                    >
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                  <td>
                    <EditableCell value={acct.acctgrp || ''} onSave={v => saveField(acct.name, 'acctgrp', v)} type="text" align="left" />
                  </td>
                  <td>
                    <EditableCell value={acct.prefix || ''} onSave={v => saveField(acct.name, 'prefix', v)} type="text" align="left" />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={!!acct.postord}
                      onChange={e => saveField(acct.name, 'postord', e.target.checked)}
                    />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span
                      className={`badge ${acct.active ? 'badge-green' : 'badge-red'}`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => toggleActive(acct.name, acct.active)}
                      title="Click to toggle"
                    >
                      {acct.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <EditableCell value={acct.notes || ''} onSave={v => saveField(acct.name, 'notes', v)} type="text" align="left" />
                  </td>
                </tr>
              ))}

              {adding && (
                <tr style={{ background: 'var(--cell-edit-bg)' }}>
                  <td>
                    <input
                      autoFocus
                      type="text"
                      placeholder="Account name"
                      style={{ width: '100%', border: '2px solid var(--accent)', borderRadius: 2, padding: '3px 6px', fontSize: 13 }}
                      value={newAcct.name}
                      onChange={e => setNewAcct(p => ({ ...p, name: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') addAccount(); if (e.key === 'Escape') { setAdding(false); setNewAcct(EMPTY_NEW) } }}
                    />
                  </td>
                  <td>
                    <input type="text" placeholder="Route" style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 2, padding: '3px 6px', fontSize: 13 }}
                      value={newAcct.route} onChange={e => setNewAcct(p => ({ ...p, route: e.target.value }))} />
                  </td>
                  <td>
                    <input type="number" style={{ width: 60, border: '1px solid var(--border)', borderRadius: 2, padding: '3px 4px', textAlign: 'right', fontSize: 13 }}
                      value={newAcct.sequence} onChange={e => setNewAcct(p => ({ ...p, sequence: parseInt(e.target.value) || 0 }))} />
                  </td>
                  <td>
                    <select value={newAcct.category} onChange={e => setNewAcct(p => ({ ...p, category: e.target.value }))}
                      style={{ border: '1px solid var(--border)', borderRadius: 2, padding: '3px 6px', fontSize: 13 }}>
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                  <td>
                    <input type="text" placeholder="Group" style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 2, padding: '3px 6px', fontSize: 13 }}
                      value={newAcct.acctgrp} onChange={e => setNewAcct(p => ({ ...p, acctgrp: e.target.value }))} />
                  </td>
                  <td>
                    <input type="text" placeholder="Prefix" style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 2, padding: '3px 6px', fontSize: 13 }}
                      value={newAcct.prefix} onChange={e => setNewAcct(p => ({ ...p, prefix: e.target.value }))} />
                  </td>
                  <td colSpan={2} style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <button className="btn btn-primary btn-sm" style={{ marginRight: 4 }} onClick={addAccount}>Add</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setAdding(false); setNewAcct(EMPTY_NEW) }}>Cancel</button>
                  </td>
                  <td>
                    <input type="text" placeholder="Notes" style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 2, padding: '3px 6px', fontSize: 13 }}
                      value={newAcct.notes} onChange={e => setNewAcct(p => ({ ...p, notes: e.target.value }))} />
                  </td>
                </tr>
              )}

              {accounts.length === 0 && !adding && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>
                    No accounts yet. Click "+ Add Account" to add one.
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
