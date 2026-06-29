import { useState, useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'

const NAV_ITEMS = [
  { to: '/',           label: 'Dashboard',    end: true },
  { to: '/orders',     label: 'Orders' },
  { to: '/spec-orders',label: 'Special Orders' },
  { to: '/inventory',       label: 'Inventory' },
  { to: '/daily-inventory', label: 'Daily Inventory' },
  { to: '/products',   label: 'Products' },
  { to: '/recipes',      label: 'Recipes' },
  { to: '/recipe-gen',   label: 'Recipe Gen' },
  { to: '/ingredients',  label: 'Ingredients' },
  { to: '/accounts',   label: 'Accounts' },
  { to: '/pricing',    label: 'Pricing' },
  { to: '/baking',     label: 'Bake List' },
  { to: '/billing',    label: 'Billing' },
  { to: '/import',     label: 'Import/Export' },
  { to: '/users',      label: 'Users' },
  { to: '/activity',   label: 'Activity' },
  { to: '/settings',   label: 'Settings' },
]

export default function Layout({ user, setUser }) {
  const [bakeryName, setBakeryName] = useState('Bakery Manager')
  const [logoUrl, setLogoUrl]       = useState(() => localStorage.getItem('bakery-logo_url') || '')
  const [bgUrl, setBgUrl]           = useState(() => localStorage.getItem('bakery-bg_url') || '')
  const [bgOpacity, setBgOpacity]   = useState(() => parseFloat(localStorage.getItem('bakery-bg_opacity')) || 0.08)
  const [bgTint, setBgTint]         = useState(() => localStorage.getItem('bakery-bg_tint') || 'none')

  useEffect(() => {
    fetch('/api/settings', { credentials: 'include' })
      .then(r => r.json())
      .then(s => {
        if (s.bakery_name) setBakeryName(s.bakery_name)
        if (s.logo_url)   { setLogoUrl(s.logo_url);                        localStorage.setItem('bakery-logo_url',  s.logo_url) }
        if (s.bg_url)     { setBgUrl(s.bg_url);                            localStorage.setItem('bakery-bg_url',    s.bg_url) }
        if (s.bg_opacity) { setBgOpacity(parseFloat(s.bg_opacity));        localStorage.setItem('bakery-bg_opacity', s.bg_opacity) }
        if (s.bg_tint)    { setBgTint(s.bg_tint);                          localStorage.setItem('bakery-bg_tint',   s.bg_tint) }
      })
      .catch(() => {})

    function onBgChanged() {
      setLogoUrl(localStorage.getItem('bakery-logo_url') || '')
      setBgUrl(localStorage.getItem('bakery-bg_url') || '')
      setBgOpacity(parseFloat(localStorage.getItem('bakery-bg_opacity')) || 0.08)
      setBgTint(localStorage.getItem('bakery-bg_tint') || 'none')
    }
    window.addEventListener('bakery-bg-changed', onBgChanged)
    return () => window.removeEventListener('bakery-bg-changed', onBgChanged)
  }, [])

  async function logout() {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' })
    setUser(null)
  }

  return (
    <>
      {bgUrl && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: -1, backgroundImage: `url(${bgUrl})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: bgOpacity }} />
          {bgTint && bgTint !== 'none' && <div style={{ position: 'fixed', inset: 0, zIndex: -1, background: bgTint }} />}
        </>
      )}

      {/* ── Top header row ── */}
      <header className="app-header">
        <div className="brand">
          <img src={logoUrl || '/logo.jpg'} alt="logo" style={{ height: 34, width: 'auto', objectFit: 'contain', borderRadius: 4 }} onError={e => e.target.style.display = 'none'} />
          <span className="brand-name">{bakeryName}</span>
        </div>
        <div className="header-right">
          <span className="release-stamp"
            title={`Last release: ${new Date(__BUILD_TIME__).toLocaleString()}`}
            style={{ fontSize: 11, opacity: 0.5, whiteSpace: 'nowrap' }}>
            {new Date(__BUILD_TIME__).toLocaleString('en-US', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
          <span className="username">{user.username}</span>
          <button className="btn-logout" onClick={logout}>Sign Out</button>
        </div>
      </header>

      {/* ── Horizontal nav bar ── */}
      <nav className="top-nav">
        {NAV_ITEMS.map(({ to, label, end }) => (
          <NavLink key={to} to={to} end={end}>{label}</NavLink>
        ))}
      </nav>

      {/* ── Main content ── */}
      <main className="app-main-top">
        <Outlet />
      </main>
    </>
  )
}
