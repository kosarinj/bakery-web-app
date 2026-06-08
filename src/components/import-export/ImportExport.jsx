import { useState, useRef } from 'react'

const TABLES = [
  {
    key: 'products',
    label: 'Products',
    desc: 'All bakery products',
    cols: 'prod_name, prod_type, prod_group, barcode, multiplier, divisor, batch, active, notes',
    note: 'Import this first before Prices, Recipes, or Inventory',
  },
  {
    key: 'accounts',
    label: 'Accounts',
    desc: 'Customer accounts and routes',
    cols: 'name, route, sequence, category, acctgrp, marketfee, prefix, postord, active, notes',
    note: 'Import this first before Account Prices',
  },
  {
    key: 'prices',
    label: 'Prices',
    desc: 'Standard wholesale / retail prices per product',
    cols: 'prod_name, category, whole_price, ret_price',
  },
  {
    key: 'account_prices',
    label: 'Account Prices',
    desc: 'Per-account price overrides',
    cols: 'account, prod_name, whole_price, ret_price',
  },
  {
    key: 'ingredients',
    label: 'Ingredients',
    desc: 'Ingredient master list',
    cols: 'name, unit, notes',
    note: 'Import this before Recipes',
  },
  {
    key: 'recipes',
    label: 'Recipes',
    desc: 'Product ingredient recipes',
    cols: 'product, ingredient, sequence, qty, teaspoons, tablespoons, cups, pounds, rectext',
  },
  {
    key: 'inventory',
    label: 'Inventory',
    desc: 'Current on-hand quantities',
    cols: 'prod_name, units, sod_inv, location',
  },
  {
    key: 'spec_orders',
    label: 'Special Orders',
    desc: 'Historical special/custom orders',
    cols: 'order_num, account, location, ordr_dt, del_date, prod_name, units, price, phone, notes',
    note: 'Import before Track Tickets; products/accounts auto-created if missing',
  },
  {
    key: 'track_tix',
    label: 'Track Tickets',
    desc: 'Historical billing and payment records',
    cols: 'date, account, total, paid',
    note: 'Import this to load historical payment history from Access',
  },
  {
    key: 'daily_orders',
    label: 'Daily Orders',
    desc: 'Historical order data',
    cols: 'order_num, account, ordr_dt, prod_name, units, wprice, rprice, del_date, special_ords, postbake_adj, notes',
    note: 'Re-import safe — order_num prevents duplicates',
  },
]

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim())
  if (lines.length < 2) return []

  function parseLine(line) {
    const fields = []
    let inQuote = false, field = ''
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { field += '"'; i++ }
        else inQuote = !inQuote
      } else if (ch === ',' && !inQuote) {
        fields.push(field); field = ''
      } else {
        field += ch
      }
    }
    fields.push(field)
    return fields
  }

  const headers = parseLine(lines[0]).map(h => h.trim())
  return lines.slice(1).map(line => {
    const vals = parseLine(line)
    const obj = {}
    headers.forEach((h, i) => { obj[h] = vals[i] ?? '' })
    return obj
  })
}

function triggerDownload(filename, content) {
  const blob = new Blob([content], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export default function ImportExport() {
  const [results, setResults] = useState({})
  const [busy, setBusy] = useState({})
  const fileRefs = useRef({})

  async function handleExport(tbl) {
    const r = await fetch(`/api/export/${tbl.key}`, { credentials: 'include' })
    if (!r.ok) { alert('Export failed'); return }
    triggerDownload(`${tbl.key}.csv`, await r.text())
  }

  function downloadTemplate(tbl) {
    triggerDownload(`${tbl.key}_template.csv`, tbl.cols.split(', ').join(',') + '\n')
  }

  function handleFileChange(tbl, e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async ev => {
      const rows = parseCSV(ev.target.result)
      if (!rows.length) {
        setResults(p => ({ ...p, [tbl.key]: { error: 'No data rows found in file' } }))
        return
      }
      setBusy(p => ({ ...p, [tbl.key]: true }))
      setResults(p => ({ ...p, [tbl.key]: null }))
      try {
        const r = await fetch(`/api/import/${tbl.key}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ rows })
        })
        const data = await r.json()
        if (!r.ok) throw new Error(data.error)
        setResults(p => ({ ...p, [tbl.key]: data }))
      } catch (err) {
        setResults(p => ({ ...p, [tbl.key]: { error: err.message } }))
      } finally {
        setBusy(p => ({ ...p, [tbl.key]: false }))
        e.target.value = ''
      }
    }
    reader.readAsText(file)
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 6, letterSpacing: '-0.01em' }}>
          Import / Export
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, maxWidth: 640 }}>
          Export any table as CSV, or import from a CSV file — including exports from Access.
          Imports are safe to re-run: existing rows are updated, new rows are added, nothing is deleted.
        </p>
      </div>

      <div className="section-card">
        <table className="data-grid" style={{ minWidth: 680 }}>
          <thead>
            <tr>
              <th style={{ minWidth: 130 }}>Table</th>
              <th>Expected columns</th>
              <th style={{ minWidth: 230 }}>Actions</th>
              <th style={{ minWidth: 180 }}>Result</th>
            </tr>
          </thead>
          <tbody>
            {TABLES.map(tbl => {
              const res = results[tbl.key]
              const isBusy = busy[tbl.key]
              return (
                <tr key={tbl.key}>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{tbl.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{tbl.desc}</div>
                    {tbl.note && (
                      <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 3 }}>⚠ {tbl.note}</div>
                    )}
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', lineHeight: 1.8 }}>
                    {tbl.cols}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => downloadTemplate(tbl)}
                        title="Download an empty CSV with the correct column headers">
                        ↓ Template
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => handleExport(tbl)}
                        title="Download current data as CSV">
                        ↓ Export
                      </button>
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={isBusy}
                        onClick={() => fileRefs.current[tbl.key]?.click()}
                        title="Upload a CSV file to import into this table"
                      >
                        {isBusy ? 'Importing…' : '↑ Import CSV'}
                      </button>
                      <input
                        type="file"
                        accept=".csv,.txt"
                        style={{ display: 'none' }}
                        ref={el => fileRefs.current[tbl.key] = el}
                        onChange={e => handleFileChange(tbl, e)}
                      />
                    </div>
                  </td>
                  <td>
                    {res && (
                      res.error
                        ? <span style={{ color: 'var(--error)', fontSize: 12, fontWeight: 500 }}>✕ {res.error}</span>
                        : <div>
                            <span style={{ color: '#16a34a', fontSize: 13, fontWeight: 600 }}>
                              ✓ {res.imported} rows imported
                            </span>
                            {res.errors?.length > 0 && (
                              <div style={{ color: 'var(--error)', fontSize: 11, marginTop: 4, maxWidth: 300 }}>
                                <strong>{res.errors.length} skipped</strong> — {res.errors[0]?.error}
                              </div>
                            )}
                          </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 16, padding: 14, background: 'var(--border-light)', borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.8 }}>
        <strong style={{ color: 'var(--text)', display: 'block', marginBottom: 4 }}>Importing from Access:</strong>
        Open each table in Access → select all rows → copy into Excel → File → Save As → CSV.
        Or use File → Export → Text File and choose Delimited / CSV format.<br />
        Column names are matched case-insensitively. Extra columns in your file are ignored.<br />
        <strong>Recommended order:</strong> Products → Accounts → Ingredients → Prices → Account Prices → Recipes → Inventory
      </div>
    </div>
  )
}
