import { useState, useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'

const NAV_ITEMS = [
  { to: '/',          icon: '🏠', label: 'Dashboard', end: true },
  { to: '/orders',    icon: '📋', label: 'Orders' },
  { to: '/inventory', icon: '📦', label: 'Inventory' },
  { to: '/products',  icon: '🥐', label: 'Products' },
  { to: '/recipes',   icon: '📖', label: 'Recipes' },
  { to: '/recipe-gen',icon: '🧾', label: 'Recipe Gen' },
  { to: '/accounts',  icon: '🏪', label: 'Accounts' },
  { to: '/pricing',   icon: '💲', label: 'Pricing' },
  { to: '/baking',    icon: '🍞', label: 'Bake List' },
  { to: '/billing',   icon: '🧾', label: 'Billing' },
  { to: '/import',    icon: '⇅',  label: 'Import/Export' },
  { to: '/settings',  icon: '⚙',  label: 'Settings' },
]

export default function Layout({ user, setUser }) {
  const [bakeryName, setBakeryName] = useState('Bakery Manager')
  const [bgUrl, setBgUrl] = useState('')
  const [bgOpacity, setBgOpacity] = useState(0.08)
  const [bgTint, setBgTint] = useState('none')

  useEffect(() => {
    fetch('/api/settings', { credentials: 'include' })
      .then(r => r.json())
      .then(s => {
        if (s.bakery_name) setBakeryName(s.bakery_name)
        if (s.bg_url) setBgUrl(s.bg_url)
        if (s.bg_opacity) setBgOpacity(parseFloat(s.bg_opacity))
        if (s.bg_tint) setBgTint(s.bg_tint)
      })
      .catch(() => {})
  }, [])

  async function logout() {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' })
    setUser(null)
  }

  return (
    <>
      {bgUrl && (
        <>
          <div style={{
            position: 'fixed', inset: 0, zIndex: -1,
            backgroundImage: `url(${bgUrl})`,
            backgroundSize: 'cover', backgroundPosition: 'center',
            opacity: bgOpacity,
          }} />
          {bgTint && bgTint !== 'none' && (
            <div style={{ position: 'fixed', inset: 0, zIndex: -1, background: bgTint }} />
          )}
        </>
      )}
      <header className="app-header">
        <div className="brand">{bakeryName}</div>
        <div className="header-right">
          <span className="username">{user.username}</span>
          <button className="btn-logout" onClick={logout}>Sign Out</button>
        </div>
      </header>

      <div className="app-layout">
        <nav className="app-nav">
          {NAV_ITEMS.map(({ to, icon, label, end }) => (
            <NavLink key={to} to={to} end={end}>
              <span className="nav-icon">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </>
  )
}
