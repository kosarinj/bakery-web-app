import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const MODULES = [
  { to: '/orders',    icon: '📋', label: 'Orders',       desc: 'Enter and review daily orders' },
  { to: '/inventory', icon: '📦', label: 'Inventory',    desc: 'Update on-hand stock levels' },
  { to: '/products',  icon: '🥐', label: 'Products',     desc: 'Manage product catalog' },
  { to: '/recipes',   icon: '📖', label: 'Recipes',      desc: 'View and edit recipes' },
  { to: '/accounts',  icon: '🏪', label: 'Accounts',     desc: 'Manage customer accounts' },
  { to: '/pricing',   icon: '💲', label: 'Pricing',      desc: 'Set wholesale and retail prices' },
  { to: '/baking',    icon: '🍞', label: 'Bake List',    desc: 'Generate and manage bake schedule' },
  { to: '/import',    icon: '⇅',  label: 'Import/Export','desc': 'Import or export data as CSV' },
]

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [settings, setSettings] = useState({})
  const navigate = useNavigate()

  useEffect(() => {
    Promise.all([
      fetch('/api/dashboard', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/settings', { credentials: 'include' }).then(r => r.json()),
    ]).then(([s, cfg]) => {
      setStats(s)
      setSettings(cfg)
    }).catch(() => {})
  }, [])

  const bakingDate = settings.baking_date
    ? new Date(settings.baking_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : ''

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Hero */}
      <div style={{
        background: 'linear-gradient(135deg, var(--nav-bg) 0%, #2d1f3d 100%)',
        borderRadius: 'var(--radius)',
        padding: '28px 32px',
        marginBottom: 24,
        color: 'white',
      }}>
        <div style={{ fontSize: 13, color: '#a78bfa', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {settings.bakery_name || 'Bakery Manager'}
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>
          Good {getGreeting()}
        </div>
        {bakingDate && (
          <div style={{ fontSize: 14, color: '#c4b5fd' }}>
            Baking date: {bakingDate}
          </div>
        )}
      </div>

      {/* Stats row */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Accounts',     value: stats.accounts,      color: '#7c3aed' },
            { label: 'Products',     value: stats.products,      color: '#0891b2' },
            { label: "Today's Orders", value: stats.orders_today, color: '#059669' },
            { label: 'Order Lines',  value: stats.order_lines,   color: '#d97706' },
          ].map(s => (
            <div key={s.label} style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '16px 20px',
              boxShadow: 'var(--shadow-sm)',
            }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: s.color, lineHeight: 1, marginBottom: 4 }}>
                {s.value ?? '—'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Module cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {MODULES.map(m => (
          <button
            key={m.to}
            onClick={() => navigate(m.to)}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '18px 16px',
              textAlign: 'left',
              cursor: 'pointer',
              transition: 'all 0.15s',
              boxShadow: 'var(--shadow-sm)',
              fontFamily: 'var(--font)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'var(--primary)'
              e.currentTarget.style.boxShadow = '0 0 0 3px var(--primary-light)'
              e.currentTarget.style.transform = 'translateY(-1px)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.boxShadow = 'var(--shadow-sm)'
              e.currentTarget.style.transform = 'none'
            }}
          >
            <div style={{ fontSize: 24, marginBottom: 8 }}>{m.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>{m.label}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>{m.desc}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
