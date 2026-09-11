import { useState, useEffect } from 'react'
import EditableCell from '../shared/EditableCell'
import { effectiveBakingDate } from '../../lib/bakingDate'

const fmt$ = v => v != null ? `$${parseFloat(v).toFixed(2)}` : '—'
const fmtDate = d => { if (!d) return '—'; const s = String(d).slice(0,10); return new Date(s + 'T00:00:00').toLocaleDateString() }

const selStyle = {
  border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
  padding: '4px 6px', fontSize: 12, marginLeft: 4,
}

export default function BillingPage() {
  const [view, setView] = useState('tickets')  // 'tickets' | 'aged'
  const [tickets, setTickets] = useState([])
  // Ticket layout, seeded from the saved default in Settings. Changing it here
  // affects this screen's prints and exports only — it does not write back, so
  // one driver's one-off re-sort cannot silently become everyone's default.
  const [ticketOpts, setTicketOpts] = useState(null)
  const [layout, setLayout] = useState({ group: 'prod_type', sort: 'name', gf: '1' })
  const [aged, setAged] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Ticket filters
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [acctFilter, setAcctFilter] = useState('')
  const [unpaidOnly, setUnpaidOnly] = useState(false)
  const [selected, setSelected] = useState(new Set())

  // Generate bills
  const [genDate, setGenDate] = useState('')
  const [genMsg, setGenMsg] = useState('')
  const [generating, setGenerating] = useState(false)
  const [exportAcct, setExportAcct] = useState('')

  useEffect(() => {
    fetch('/api/settings', { credentials: 'include' }).then(r => r.json())
      .then(s => {
        const d = effectiveBakingDate(s.baking_date)
        setGenDate(d)
        const monthAgo = new Date(d); monthAgo.setDate(monthAgo.getDate() - 30)
        setFrom(monthAgo.toISOString().slice(0, 10))
        setTo(d)
      }).catch(() => {})
  }, [])

  useEffect(() => {
    Promise.all([
      fetch('/api/billing/ticket-options', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/settings', { credentials: 'include' }).then(r => r.json()),
    ]).then(([opts, st]) => {
      setTicketOpts(opts)
      setLayout({
        group: st.ticket_group_by || 'prod_type',
        sort: st.ticket_sort_within || 'name',
        gf: st.ticket_gf_separate === 'false' ? '0' : '1',
      })
    }).catch(() => {})
  }, [])

  async function loadTickets() {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      if (acctFilter) params.set('account', acctFilter)
      if (unpaidOnly) params.set('unpaid_only', '1')
      const r = await fetch(`/api/billing/tickets?${params}`, { credentials: 'include' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setTickets(Array.isArray(d) ? d : [])
      setSelected(new Set())
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  async function loadAged() {
    setLoading(true); setError('')
    try {
      const r = await fetch('/api/billing/aged', { credentials: 'include' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setAged(Array.isArray(d) ? d : [])
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    if (view === 'tickets' && from && to) loadTickets()
    if (view === 'aged') loadAged()
  }, [view])

  async function generateBills() {
    if (!genDate) return
    setGenerating(true); setGenMsg(''); setError('')
    try {
      const r = await fetch('/api/billing/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ del_date: genDate })
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setGenMsg(`✓ ${d.accounts} accounts — ${d.created} new, ${d.updated} updated`)
      setTimeout(() => setGenMsg(''), 5000)
      if (view === 'tickets') loadTickets()
    } catch (e) { setError(e.message) }
    finally { setGenerating(false) }
  }

  async function savePaid(id, paid) {
    await fetch(`/api/billing/tickets/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ paid })
    })
    setTickets(prev => prev.map(t => t.id === id ? { ...t, paid, outstanding: t.total - paid } : t))
  }

  async function payInFull(ids) {
    if (!ids.length) return
    await fetch('/api/billing/pay-full', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ ids })
    })
    setTickets(prev => prev.map(t => ids.includes(t.id) ? { ...t, paid: t.total, outstanding: 0 } : t))
    setSelected(new Set())
  }

  const toggleSelect = id => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const totalOutstanding = tickets.reduce((s, t) => s + parseFloat(t.outstanding || 0), 0)
  const totalBilled      = tickets.reduce((s, t) => s + parseFloat(t.total || 0), 0)
  const selectedArr      = [...selected]

  // Only the ticket export lists products per account; packing and inventory
  // are built differently, so the layout does not apply to them.
  function exportXlsx(type) {
    const params = new URLSearchParams({ del_date: genDate })
    if (exportAcct) params.set('account', exportAcct)
    if (type === 'tickets') addLayout(params)
    window.open(`/api/billing/export/${type}?${params}`, '_blank')
  }

  function addLayout(params) {
    params.set('group', layout.group)
    params.set('sort', layout.sort)
    params.set('gf', layout.gf)
  }

  // Printing from the workbook means opening each account's worksheet and
  // setting up the page for every one. This is the same tickets as one page per
  // account, with the breaks already in place — respects the account filter, so
  // the same button prints one or all.
  function printTickets() {
    const params = new URLSearchParams({ del_date: genDate })
    if (exportAcct) params.set('account', exportAcct)
    addLayout(params)
    window.open(`/api/billing/print/tickets?${params}`, '_blank')
  }

  return (
    <div>
      {/* Top row */}
      <div className="page-toolbar" style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 2 }}>
          <button className={`btn btn-sm ${view === 'tickets' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setView('tickets')}>Tickets</button>
          <button className={`btn btn-sm ${view === 'aged' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setView('aged'); loadAged() }}>Aged Receivables</button>
        </div>

        <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />

        <label>Date:
          <input type="date" value={genDate} onChange={e => setGenDate(e.target.value)} />
        </label>
        <button className="btn btn-primary btn-sm" onClick={generateBills} disabled={generating || !genDate}>
          {generating ? 'Generating…' : '⚡ Generate Bills'}
        </button>
        {genMsg && <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>{genMsg}</span>}

        <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />

        <input type="text" placeholder="Account (blank = all)…" value={exportAcct} onChange={e => setExportAcct(e.target.value)}
          style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '5px 10px', fontSize: 13, width: 160 }} />
        <label title="How products are listed on tickets. The default is set in Settings → Delivery Tickets.">
          Group:
          <select value={layout.group} onChange={e => setLayout(l => ({ ...l, group: e.target.value }))}
            style={selStyle}>
            {(ticketOpts?.groups || [{ value: 'prod_type', label: 'Product type' }])
              .map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label title="Order of products within each group.">
          Sort:
          <select value={layout.sort} onChange={e => setLayout(l => ({ ...l, sort: e.target.value }))}
            style={selStyle}>
            {(ticketOpts?.sorts || [{ value: 'name', label: 'Name (A–Z)' }])
              .map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label title="Whether gluten free products print in their own block at the foot of the ticket.">
          GF:
          <select value={layout.gf} onChange={e => setLayout(l => ({ ...l, gf: e.target.value }))}
            style={selStyle}>
            <option value="1">Own block</option>
            <option value="0">Mixed in</option>
          </select>
        </label>
        <button className="btn btn-secondary btn-sm" onClick={printTickets} disabled={!genDate}
          title={exportAcct ? `Print the ticket for ${exportAcct}` : 'Print every ticket for this date, one per page'}>
          🖨 Print Tickets{exportAcct ? '' : ' (all)'}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => exportXlsx('tickets')} disabled={!genDate}
          title="Delivery invoices with pricing">
          ⬇ Tickets
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => exportXlsx('packing')} disabled={!genDate}
          title="Packing sheets — units and product only, no totals">
          ⬇ Packing
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => exportXlsx('inventory')} disabled={!genDate}
          title="Inventory sheets for end-of-day scanning">
          ⬇ Inventory
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => window.open(`/api/billing/export/lead?del_date=${genDate}`, '_blank')} disabled={!genDate}
          title="Lead sheet — accounts grouped by route for drivers">
          ⬇ Lead Sheet
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* TICKETS VIEW */}
      {view === 'tickets' && (
        <>
          <div className="page-toolbar" style={{ marginBottom: 10 }}>
            <label>From: <input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
            <label>To: <input type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
            <input type="text" placeholder="Account…" value={acctFilter} onChange={e => setAcctFilter(e.target.value)}
              style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '5px 10px', fontSize: 13, width: 150 }} />
            <label style={{ gap: 6 }}><input type="checkbox" checked={unpaidOnly} onChange={e => setUnpaidOnly(e.target.checked)} /> Unpaid only</label>
            <button className="btn btn-secondary btn-sm" onClick={loadTickets}>Search</button>
            <div className="toolbar-spacer" />
            {selected.size > 0 && (
              <>
                <span className="toolbar-info">{selected.size} selected</span>
                <button className="btn btn-primary btn-sm" onClick={() => payInFull(selectedArr)}>✓ Pay In Full</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setSelected(new Set())}>Clear</button>
              </>
            )}
            <span className="toolbar-info">{tickets.length} tickets · {fmt$(totalBilled)} billed · {fmt$(totalOutstanding)} outstanding</span>
          </div>

          {loading ? <div className="loading">Loading…</div> : (
            <div className="grid-scroll-container">
              <table className="data-grid" style={{ minWidth: 700 }}>
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>
                      <input type="checkbox"
                        checked={selected.size === tickets.length && tickets.length > 0}
                        onChange={e => setSelected(e.target.checked ? new Set(tickets.map(t => t.id)) : new Set())} />
                    </th>
                    <th style={{ minWidth: 90 }}>Date</th>
                    <th style={{ minWidth: 160 }}>Account</th>
                    <th style={{ minWidth: 80 }}>Route</th>
                    <th style={{ minWidth: 100, textAlign: 'right' }}>Total</th>
                    <th style={{ minWidth: 100, textAlign: 'right' }}>Paid</th>
                    <th style={{ minWidth: 110, textAlign: 'right' }}>Outstanding</th>
                    <th style={{ minWidth: 80, textAlign: 'center' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map(t => {
                    const outstanding = parseFloat(t.total) - parseFloat(t.paid)
                    const paid = parseFloat(t.paid)
                    const total = parseFloat(t.total)
                    const isPaid = outstanding <= 0.001
                    const isPartial = paid > 0 && !isPaid
                    return (
                      <tr key={t.id} style={{ background: selected.has(t.id) ? 'var(--primary-light)' : undefined }}>
                        <td style={{ textAlign: 'center' }}>
                          <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleSelect(t.id)} />
                        </td>
                        <td style={{ fontSize: 13 }}>{fmtDate(t.tix_date)}</td>
                        <td style={{ fontWeight: 500 }}>{t.account}</td>
                        <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{t.route || '—'}</td>
                        <td style={{ textAlign: 'right', paddingRight: 10 }}>{fmt$(total)}</td>
                        <td className="order-cell">
                          <EditableCell value={paid} onSave={v => savePaid(t.id, v)} type="number" align="right"
                            formatter={v => fmt$(v)} />
                        </td>
                        <td style={{ textAlign: 'right', paddingRight: 10, fontWeight: outstanding > 0 ? 600 : 400, color: outstanding > 0 ? 'var(--error)' : '#16a34a' }}>
                          {outstanding > 0 ? fmt$(outstanding) : '—'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {isPaid
                            ? <span className="badge badge-green">Paid</span>
                            : isPartial
                            ? <span className="badge badge-orange">Partial</span>
                            : <span className="badge badge-red">Unpaid</span>}
                        </td>
                      </tr>
                    )
                  })}
                  {tickets.length === 0 && (
                    <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                      No tickets found. Generate bills or adjust date range.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* AGED RECEIVABLES VIEW */}
      {view === 'aged' && (
        <>
          {loading ? <div className="loading">Loading…</div> : (
            <div className="grid-scroll-container">
              <table className="data-grid" style={{ minWidth: 650 }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: 180 }}>Account</th>
                    <th style={{ minWidth: 110, textAlign: 'right' }}>0–30 days</th>
                    <th style={{ minWidth: 110, textAlign: 'right' }}>31–60 days</th>
                    <th style={{ minWidth: 110, textAlign: 'right' }}>61–90 days</th>
                    <th style={{ minWidth: 110, textAlign: 'right' }}>90+ days</th>
                    <th style={{ minWidth: 120, textAlign: 'right' }}>Total Outstanding</th>
                    <th style={{ minWidth: 100 }}>Last Bill</th>
                  </tr>
                </thead>
                <tbody>
                  {aged.map(a => (
                    <tr key={a.account}>
                      <td style={{ fontWeight: 500 }}>{a.account}</td>
                      <td style={{ textAlign: 'right', paddingRight: 10 }}>{parseFloat(a.age_0_30) > 0 ? fmt$(a.age_0_30) : '—'}</td>
                      <td style={{ textAlign: 'right', paddingRight: 10 }}>{parseFloat(a.age_31_60) > 0 ? fmt$(a.age_31_60) : '—'}</td>
                      <td style={{ textAlign: 'right', paddingRight: 10 }}>{parseFloat(a.age_61_90) > 0 ? fmt$(a.age_61_90) : '—'}</td>
                      <td style={{ textAlign: 'right', paddingRight: 10, color: parseFloat(a.age_90_plus) > 0 ? 'var(--error)' : undefined, fontWeight: parseFloat(a.age_90_plus) > 0 ? 600 : 400 }}>
                        {parseFloat(a.age_90_plus) > 0 ? fmt$(a.age_90_plus) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', paddingRight: 10, fontWeight: 700, color: 'var(--primary)' }}>{fmt$(a.total_outstanding)}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{a.last_bill_date ? fmtDate(a.last_bill_date) : '—'}</td>
                    </tr>
                  ))}
                  {aged.length > 0 && (
                    <tr className="totals-row">
                      <td>Total</td>
                      <td style={{ textAlign: 'right', paddingRight: 10 }}>{fmt$(aged.reduce((s, a) => s + parseFloat(a.age_0_30 || 0), 0))}</td>
                      <td style={{ textAlign: 'right', paddingRight: 10 }}>{fmt$(aged.reduce((s, a) => s + parseFloat(a.age_31_60 || 0), 0))}</td>
                      <td style={{ textAlign: 'right', paddingRight: 10 }}>{fmt$(aged.reduce((s, a) => s + parseFloat(a.age_61_90 || 0), 0))}</td>
                      <td style={{ textAlign: 'right', paddingRight: 10 }}>{fmt$(aged.reduce((s, a) => s + parseFloat(a.age_90_plus || 0), 0))}</td>
                      <td className="total-cell">{fmt$(aged.reduce((s, a) => s + parseFloat(a.total_outstanding || 0), 0))}</td>
                      <td />
                    </tr>
                  )}
                  {aged.length === 0 && (
                    <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>No outstanding balances.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
