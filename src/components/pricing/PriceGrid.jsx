import { useState, useEffect } from 'react'
import EditableCell from '../shared/EditableCell'

export default function PriceGrid() {
  const [rows, setRows] = useState([])
  const [accounts, setAccounts] = useState([])
  const [selectedAccount, setSelectedAccount] = useState('')
  const [acctPrices, setAcctPrices] = useState({})
  const [search, setSearch] = useState('')
  const [filterGroup, setFilterGroup] = useState('')
  const [filterProd, setFilterProd] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mode, setMode] = useState('standard')  // 'standard' | 'account'

  // Which price list the Standard grid is showing. Each list holds its own
  // wholesale and retail price per product; an account's category picks the list
  // its prices come from.
  const [lists, setLists] = useState([])
  const [list, setList] = useState('wholesale')
  const [busy, setBusy] = useState(false)

  function loadLists(select) {
    return fetch('/api/price-categories', { credentials: 'include' })
      .then(r => r.json())
      .then(ls => {
        const arr = Array.isArray(ls) ? ls : []
        setLists(arr)
        // Keep the current selection if it survived; otherwise fall back to the
        // first list rather than showing a grid for a list that no longer exists.
        setList(prev => {
          const want = select || prev
          return arr.some(l => l.name === want) ? want : (arr[0]?.name || 'wholesale')
        })
        return arr
      })
  }

  useEffect(() => {
    Promise.all([
      loadLists(),
      fetch('/api/accounts', { credentials: 'include' }).then(r => r.json()),
    ]).then(([, accts]) => {
      setAccounts(accts)
      if (accts.length) setSelectedAccount(accts[0].name)
    }).catch(e => { setError(e.message); setLoading(false) })
  }, [])

  // Re-fetch the grid whenever the selected list changes. The server returns one
  // row per active product already scoped to the list, so there is nothing to
  // de-duplicate here any more.
  useEffect(() => {
    if (!list) return
    setLoading(true)
    fetch(`/api/prices?category=${encodeURIComponent(list)}`, { credentials: 'include' })
      .then(r => r.json())
      .then(prices => {
        setRows((Array.isArray(prices) ? prices : []).map(p => ({
          prod_name: p.prod_name, prod_type: p.prod_type, prod_group: p.prod_group,
          whole_price: parseFloat(p.whole_price) || 0,
          ret_price: parseFloat(p.ret_price) || 0,
          has_price: p.has_price,
        })))
        setLoading(false)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [list])

  async function addList() {
    const name = window.prompt('Name for the new price list (e.g. GREEN MARKET):', '')
    if (name === null) return
    if (!name.trim()) { setError('Enter a name for the price list.'); return }
    // Offer to start from the list on screen — building several hundred prices
    // from scratch is not realistic, and copy-then-adjust is how these are made.
    const copyFrom = window.confirm(
      `Start "${name.trim()}" as a copy of "${list}"?

` +
      `OK — copy every price from "${list}", then adjust.
` +
      `Cancel — start with an empty list.`) ? list : ''
    setBusy(true); setError('')
    try {
      const r = await fetch('/api/price-categories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ name: name.trim(), copy_from: copyFrom }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      await loadLists(d.name)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  async function renameList() {
    const current = lists.find(l => l.name === list)
    const name = window.prompt(`Rename price list "${list}" to:`, list)
    if (name === null || name.trim() === list) return
    if (!name.trim()) { setError('Enter a name for the price list.'); return }
    if (current?.account_count) {
      if (!window.confirm(
        `${current.account_count} account${current.account_count === 1 ? '' : 's'} use "${list}".

` +
        `They will be moved to "${name.trim()}" so their prices keep working. Continue?`)) return
    }
    setBusy(true); setError('')
    try {
      const r = await fetch(`/api/price-categories/${encodeURIComponent(list)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ name: name.trim() }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      await loadLists(name.trim())
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  async function deleteList() {
    if (lists.length <= 1) { setError('There has to be at least one price list.'); return }
    if (!window.confirm(`Delete the price list "${list}"?`)) return
    setBusy(true); setError('')
    try {
      let r = await fetch(`/api/price-categories/${encodeURIComponent(list)}`, {
        method: 'DELETE', credentials: 'include' })
      let d = await r.json()
      // 409 means the list still holds prices — a second, specific confirmation,
      // because this is the step that actually destroys pricing data.
      if (r.status === 409 && d.needsConfirm) {
        if (!window.confirm(`"${list}" still has ${d.prices} prices in it.

Delete the list and all of its prices?`)) {
          setBusy(false); return
        }
        r = await fetch(`/api/price-categories/${encodeURIComponent(list)}?force=1`, {
          method: 'DELETE', credentials: 'include' })
        d = await r.json()
      }
      if (!r.ok) throw new Error(d.error)
      await loadLists()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  useEffect(() => {
    if (!selectedAccount || mode !== 'account') return
    fetch(`/api/account-prices/${encodeURIComponent(selectedAccount)}`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        const map = {}
        data.forEach(p => { map[p.prod_name] = { whole: parseFloat(p.whole_price) || 0, ret: parseFloat(p.ret_price) || 0 } })
        setAcctPrices(map)
      })
  }, [selectedAccount, mode])

  async function saveStandardPrice(prod_name, field, value) {
    try {
      await fetch('/api/prices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ prod_name, category: list, [field]: value })
      })
      setRows(prev => prev.map(r => r.prod_name === prod_name ? { ...r, [field]: value } : r))
    } catch (e) {
      setError(`Save failed: ${e.message}`)
    }
  }

  async function saveAcctPrice(prod_name, field, value) {
    try {
      const existing = acctPrices[prod_name] || {}
      await fetch('/api/account-prices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          account: selectedAccount,
          prod_name,
          whole_price: field === 'whole' ? value : (existing.whole ?? null),
          ret_price: field === 'ret' ? value : (existing.ret ?? null),
        })
      })
      setAcctPrices(prev => ({
        ...prev,
        [prod_name]: { ...existing, [field]: value }
      }))
    } catch (e) {
      setError(`Save failed: ${e.message}`)
    }
  }

  if (loading) return <div className="loading">Loading prices...</div>

  const allGroups = [...new Set(rows.map(r => r.prod_group).filter(Boolean))].sort()
  const filteredRows = rows.filter(r => {
    if (filterGroup && r.prod_group !== filterGroup) return false
    if (filterProd && r.prod_name !== filterProd) return false
    if (search && !(r.prod_name||'').toLowerCase().includes(search.toLowerCase()) && !(r.prod_group||'').toLowerCase().includes(search.toLowerCase())) return false
    return true
  })
  const groupProducts = rows.filter(r => !filterGroup || r.prod_group === filterGroup)

  const groups = filteredRows.reduce((acc, r) => {
    const g = r.prod_group || 'Other'
    if (!acc[g]) acc[g] = []
    acc[g].push(r)
    return acc
  }, {})

  return (
    <div>
      <div className="page-toolbar">
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            className={`btn btn-sm ${mode === 'standard' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setMode('standard')}
          >Standard Prices</button>
          <button
            className={`btn btn-sm ${mode === 'account' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setMode('account')}
          >Account Prices</button>
        </div>

        {mode === 'standard' && (
          <>
            <label>
              Price list:
              <select value={list} onChange={e => setList(e.target.value)} disabled={busy}
                style={{ marginLeft: 6, border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '4px 8px', fontSize: 13, fontWeight: 600 }}>
                {lists.map(l => (
                  <option key={l.name} value={l.name}>
                    {l.name}{l.account_count ? ` (${l.account_count} accounts)` : ''}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn btn-sm btn-secondary" onClick={addList} disabled={busy}
              title="Add a new price list, optionally copied from this one">+ New list</button>
            <button className="btn btn-sm btn-secondary" onClick={renameList} disabled={busy}
              title="Rename this price list">Rename</button>
            <button className="btn btn-sm btn-secondary" onClick={deleteList} disabled={busy || lists.length <= 1}
              title={lists.length <= 1 ? 'There has to be at least one price list' : 'Delete this price list'}>Delete</button>
          </>
        )}

        {mode === 'account' && (
          <label>
            Account:
            <select
              value={selectedAccount}
              onChange={e => setSelectedAccount(e.target.value)}
              style={{ marginLeft: 6, border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '4px 8px', fontSize: 13 }}
            >
              {accounts.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
            </select>
          </label>
        )}

        <select value={filterGroup} onChange={e => { setFilterGroup(e.target.value); setFilterProd('') }}
          style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '5px 8px', fontSize: 13, background: filterGroup ? 'var(--primary-light)' : 'var(--surface)' }}>
          <option value="">All categories</option>
          {allGroups.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <select value={filterProd} onChange={e => setFilterProd(e.target.value)}
          style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '5px 8px', fontSize: 13, background: filterProd ? 'var(--primary-light)' : 'var(--surface)', maxWidth: 200 }}>
          <option value="">All products</option>
          {groupProducts.map(r => <option key={r.prod_name} value={r.prod_name}>{r.prod_name}</option>)}
        </select>
        <input type="text" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '5px 10px', fontSize: 13, width: 130 }} />
        <span className="toolbar-info">
          {filteredRows.length} of {rows.length}
          {mode === 'standard' && ` · ${rows.filter(r => r.has_price).length} priced in ${list}`}
        </span>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="grid-scroll-container">
        <table className="data-grid" style={{ minWidth: 500 }}>
          <thead>
            <tr>
              <th style={{ minWidth: 180 }}>Product</th>
              <th style={{ minWidth: 80 }}>Type</th>
              <th style={{ minWidth: 110, textAlign: 'right' }}>Wholesale $</th>
              <th style={{ minWidth: 110, textAlign: 'right' }}>Retail $</th>
              {mode === 'account' && <th style={{ fontSize: 11, color: '#ffd0a0' }}>↑ Account Override</th>}
            </tr>
          </thead>
          <tbody>
            {Object.entries(groups).map(([group, items]) => (
              <>
                <tr key={`g-${group}`} className="inv-group-header">
                  <td colSpan={mode === 'account' ? 5 : 4}>{group}</td>
                </tr>
                {items.map(row => {
                  const ap = acctPrices[row.prod_name]
                  return (
                    <tr key={row.prod_name}>
                      <td style={{ paddingLeft: 16, fontWeight: 500 }}>{row.prod_name}</td>
                      <td>
                        {row.prod_type && <span className="badge badge-blue">{row.prod_type}</span>}
                      </td>
                      {mode === 'standard' ? (
                        <>
                          <td className="order-cell">
                            <EditableCell
                              value={row.whole_price ?? 0}
                              onSave={v => saveStandardPrice(row.prod_name, 'whole_price', v)}
                              type="number"
                              align="right"
                              formatter={v => v > 0 ? `$${parseFloat(v).toFixed(4)}` : ''}
                            />
                          </td>
                          <td className="order-cell">
                            <EditableCell
                              value={row.ret_price ?? 0}
                              onSave={v => saveStandardPrice(row.prod_name, 'ret_price', v)}
                              type="number"
                              align="right"
                              formatter={v => v > 0 ? `$${parseFloat(v).toFixed(4)}` : ''}
                            />
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="order-cell">
                            <span style={{ color: 'var(--text-muted)', fontSize: 12, paddingRight: 6, display: 'block', textAlign: 'right' }}>
                              {row.whole_price > 0 ? `$${parseFloat(row.whole_price).toFixed(4)}` : '—'}
                            </span>
                          </td>
                          <td className="order-cell">
                            <span style={{ color: 'var(--text-muted)', fontSize: 12, paddingRight: 6, display: 'block', textAlign: 'right' }}>
                              {row.ret_price > 0 ? `$${parseFloat(row.ret_price).toFixed(4)}` : '—'}
                            </span>
                          </td>
                          <td style={{ display: 'flex', gap: 8, padding: '2px 4px' }}>
                            <EditableCell
                              value={ap?.whole ?? 0}
                              onSave={v => saveAcctPrice(row.prod_name, 'whole', v)}
                              type="number"
                              align="right"
                              placeholder="wholesale"
                            />
                            <EditableCell
                              value={ap?.ret ?? 0}
                              onSave={v => saveAcctPrice(row.prod_name, 'ret', v)}
                              type="number"
                              align="right"
                              placeholder="retail"
                            />
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
