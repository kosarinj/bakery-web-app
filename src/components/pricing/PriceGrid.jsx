import { useState, useEffect } from 'react'
import EditableCell from '../shared/EditableCell'

export default function PriceGrid() {
  const [rows, setRows] = useState([])
  const [accounts, setAccounts] = useState([])
  const [selectedAccount, setSelectedAccount] = useState('')
  const [acctPrices, setAcctPrices] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mode, setMode] = useState('standard')  // 'standard' | 'account'

  useEffect(() => {
    Promise.all([
      fetch('/api/prices', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/accounts', { credentials: 'include' }).then(r => r.json()),
    ]).then(([prices, accts]) => {
      // prices: [{prod_name, prod_type, prod_group, category, whole_price, ret_price}]
      // Deduplicate: one row per product, show 'wholesale' prices
      const map = {}
      prices.forEach(p => {
        if (!map[p.prod_name]) map[p.prod_name] = { prod_name: p.prod_name, prod_type: p.prod_type, prod_group: p.prod_group }
        if (p.category === 'wholesale') {
          map[p.prod_name].whole_price = parseFloat(p.whole_price) || 0
          map[p.prod_name].ret_price = parseFloat(p.ret_price) || 0
          map[p.prod_name].category = p.category
        }
      })
      setRows(Object.values(map))
      setAccounts(accts)
      if (accts.length) setSelectedAccount(accts[0].name)
      setLoading(false)
    }).catch(e => { setError(e.message); setLoading(false) })
  }, [])

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
        body: JSON.stringify({ prod_name, category: 'wholesale', [field]: value })
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

  const groups = rows.reduce((acc, r) => {
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

        <span className="toolbar-info">{rows.length} products</span>
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
