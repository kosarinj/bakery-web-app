import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'

const MODULES = [
  { to: '/orders',    icon: '📋', label: 'Orders',        desc: 'Enter and review daily orders' },
  { to: '/inventory', icon: '📦', label: 'Inventory',     desc: 'Update on-hand stock levels' },
  { to: '/products',  icon: '🥐', label: 'Products',      desc: 'Manage product catalog' },
  { to: '/recipes',   icon: '📖', label: 'Recipes',       desc: 'View and edit ingredient recipes' },
  { to: '/recipe-gen',icon: '🧾', label: 'Recipe Gen',    desc: 'Generate daily baking recipes' },
  { to: '/accounts',  icon: '🏪', label: 'Accounts',      desc: 'Manage customer accounts' },
  { to: '/pricing',   icon: '💲', label: 'Pricing',       desc: 'Set wholesale and retail prices' },
  { to: '/baking',    icon: '🍞', label: 'Bake List',     desc: 'Generate and manage bake schedule' },
  { to: '/billing',   icon: '💳', label: 'Billing',       desc: 'Generate bills and track payments' },
  { to: '/import',    icon: '⇅',  label: 'Import/Export', desc: 'Import or export data as CSV' },
]

const PIE_COLORS = ['#7c3aed','#0d9488','#e11d48','#ea580c','#1d4ed8','#4d7c0f','#be185d','#0369a1']

function StatCard({ label, value, color }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '16px 20px', boxShadow: 'var(--shadow-sm)'
    }}>
      <div style={{ fontSize: 28, fontWeight: 700, color, lineHeight: 1, marginBottom: 4 }}>{value ?? '—'}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</div>
    </div>
  )
}

function ChartCard({ title, children, height = 220 }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '16px', boxShadow: 'var(--shadow-sm)'
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12, letterSpacing: '-0.01em' }}>{title}</div>
      <div style={{ height }}>{children}</div>
    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

const fmtDate = d => {
  const dt = new Date(d + 'T00:00:00')
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const fmt$ = v => `$${Number(v || 0).toFixed(0)}`

export default function Dashboard() {
  const [stats, setStats]         = useState(null)
  const [settings, setSettings]   = useState({})
  const [trend, setTrend]         = useState([])
  const [byType, setByType]       = useState([])
  const [topAccounts, setTopAccts] = useState([])
  const navigate = useNavigate()

  useEffect(() => {
    const g = url => fetch(url, { credentials: 'include' }).then(r => r.json()).catch(() => null)
    Promise.all([
      g('/api/dashboard'),
      g('/api/settings'),
      g('/api/dashboard/revenue-trend?days=30'),
      g('/api/dashboard/by-type'),
      g('/api/dashboard/top-accounts'),
    ]).then(([s, cfg, tr, bt, ta]) => {
      if (s)   setStats(s)
      if (cfg) setSettings(cfg)
      if (Array.isArray(tr)) setTrend(tr.map(r => ({ ...r, date: fmtDate(r.date), revenue: parseFloat(r.revenue || 0) })))
      if (Array.isArray(bt)) setByType(bt.map(r => ({ ...r, units: parseFloat(r.units || 0) })))
      if (Array.isArray(ta)) setTopAccts(ta.map(r => ({ ...r, revenue: parseFloat(r.revenue || 0) })))
    })
  }, [])

  const bakingDate = settings.baking_date
    ? new Date(settings.baking_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : ''

  return (
    <div style={{ maxWidth: 1100 }}>
      {/* Hero */}
      <div style={{
        background: 'linear-gradient(135deg, var(--nav-bg) 0%, var(--primary-dark) 100%)',
        borderRadius: 'var(--radius)', padding: '24px 28px', marginBottom: 20, color: 'white'
      }}>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {settings.bakery_name || 'Bakery Manager'}
        </div>
        <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>{getGreeting()} 👋</div>
        {bakingDate && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>Baking date: {bakingDate}</div>}
      </div>

      {/* Stats */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          <StatCard label="Active Accounts"  value={stats.accounts}     color="var(--primary)" />
          <StatCard label="Active Products"  value={stats.products}     color="#0891b2" />
          <StatCard label="Today's Orders"   value={stats.orders_today} color="#059669" />
          <StatCard label="Order Lines"      value={stats.order_lines}  color="#d97706" />
        </div>
      )}

      {/* Charts row 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16, marginBottom: 16 }}>
        <ChartCard title="Order Revenue — Last 30 Days" height={220}>
          {trend.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} />
                <YAxis tickFormatter={fmt$} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} width={55} />
                <Tooltip formatter={(v) => [fmt$(v), 'Revenue']} labelStyle={{ fontWeight: 600 }} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                <Line type="monotone" dataKey="revenue" stroke="var(--primary)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 13 }}>
              No order data yet for the last 30 days
            </div>
          )}
        </ChartCard>

        <ChartCard title="Today's Orders by Type" height={220}>
          {byType.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={byType} dataKey="units" nameKey="type" cx="45%" cy="50%" outerRadius={75}
                  label={({ type, percent }) => percent > 0.05 ? `${type} ${(percent * 100).toFixed(0)}%` : ''}
                  labelLine={false}>
                  {byType.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [v + ' units', n]} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 13 }}>
              No orders for today yet
            </div>
          )}
        </ChartCard>
      </div>

      {/* Charts row 2 */}
      {topAccounts.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <ChartCard title="Top Accounts — Revenue Last 30 Days" height={200}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topAccounts} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" horizontal={false} />
                <XAxis type="number" tickFormatter={fmt$} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="account" width={110} tick={{ fontSize: 11, fill: 'var(--text)' }} tickLine={false} />
                <Tooltip formatter={(v) => [fmt$(v), 'Revenue']} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                <Bar dataKey="revenue" fill="var(--primary)" radius={[0, 4, 4, 0]}>
                  {topAccounts.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}

      {/* Module cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
        {MODULES.map(m => (
          <button key={m.to} onClick={() => navigate(m.to)}
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '14px 12px', textAlign: 'left',
              cursor: 'pointer', transition: 'all 0.15s', boxShadow: 'var(--shadow-sm)',
              fontFamily: 'var(--font)',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--primary-light)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; e.currentTarget.style.transform = 'none' }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>{m.icon}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>{m.label}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>{m.desc}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
