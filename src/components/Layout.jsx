import { useState, useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'

const NAV_ITEMS = [
  { to: '/orders',    icon: '📋', label: 'Orders' },
  { to: '/inventory', icon: '📦', label: 'Inventory' },
  { to: '/products',  icon: '🥐', label: 'Products' },
  { to: '/recipes',   icon: '📖', label: 'Recipes' },
  { to: '/accounts',  icon: '🏪', label: 'Accounts' },
  { to: '/pricing',   icon: '💲', label: 'Pricing' },
  { to: '/baking',    icon: '🍞', label: 'Bake List' },
  { to: '/import',    icon: '⇅',  label: 'Import/Export' },
]

export default function Layout({ user, setUser }) {
  const [bakeryName, setBakeryName] = useState('Bakery Manager')

  useEffect(() => {
    fetch('/api/settings', { credentials: 'include' })
      .then(r => r.json())
      .then(s => { if (s.bakery_name) setBakeryName(s.bakery_name) })
      .catch(() => {})
  }, [])

  async function logout() {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' })
    setUser(null)
  }

  return (
    <>
      <header className="app-header">
        <div className="brand">{bakeryName}</div>
        <div className="header-right">
          <span className="username">{user.username}</span>
          <button className="btn-logout" onClick={logout}>Sign Out</button>
        </div>
      </header>

      <div className="app-layout">
        <nav className="app-nav">
          {NAV_ITEMS.map(({ to, icon, label }) => (
            <NavLink key={to} to={to}>
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
