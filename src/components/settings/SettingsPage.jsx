import { useState, useEffect } from 'react'

const THEMES = [
  {
    key: 'purple',
    label: 'Purple (Default)',
    vars: { '--primary': '#7c3aed', '--primary-dark': '#6d28d9', '--primary-light': '#ede9fe', '--nav-bg': '#1e293b', '--nav-accent': '#a78bfa' }
  },
  {
    key: 'bakery',
    label: 'Warm Bakery',
    vars: { '--primary': '#92400e', '--primary-dark': '#78350f', '--primary-light': '#fef3c7', '--nav-bg': '#3a1f0e', '--nav-accent': '#fbbf24' }
  },
  {
    key: 'forest',
    label: 'Forest Green',
    vars: { '--primary': '#166534', '--primary-dark': '#14532d', '--primary-light': '#dcfce7', '--nav-bg': '#052e16', '--nav-accent': '#4ade80' }
  },
  {
    key: 'ocean',
    label: 'Ocean Blue',
    vars: { '--primary': '#1d4ed8', '--primary-dark': '#1e40af', '--primary-light': '#dbeafe', '--nav-bg': '#0f172a', '--nav-accent': '#60a5fa' }
  },
  {
    key: 'slate',
    label: 'Slate',
    vars: { '--primary': '#475569', '--primary-dark': '#334155', '--primary-light': '#f1f5f9', '--nav-bg': '#0f172a', '--nav-accent': '#94a3b8' }
  },
]

function applyTheme(key) {
  const theme = THEMES.find(t => t.key === key) || THEMES[0]
  const root = document.documentElement
  Object.entries(theme.vars).forEach(([k, v]) => root.style.setProperty(k, v))
  localStorage.setItem('bakery-theme', key)
}

export default function SettingsPage() {
  const [settings, setSettings] = useState({ bakery_name: '', baking_date: '' })
  const [saved, setSaved] = useState('')
  const [error, setError] = useState('')
  const [activeTheme, setActiveTheme] = useState(() => localStorage.getItem('bakery-theme') || 'purple')

  useEffect(() => {
    fetch('/api/settings', { credentials: 'include' })
      .then(r => r.json())
      .then(data => setSettings(s => ({ ...s, ...data })))
      .catch(() => {})
    // Re-apply saved theme on mount
    applyTheme(localStorage.getItem('bakery-theme') || 'purple')
  }, [])

  async function saveSetting(key, value) {
    try {
      await fetch(`/api/settings/${key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ value })
      })
      setSettings(s => ({ ...s, [key]: value }))
      setSaved(key)
      setTimeout(() => setSaved(''), 2000)
    } catch (e) {
      setError(`Save failed: ${e.message}`)
    }
  }

  function selectTheme(key) {
    setActiveTheme(key)
    applyTheme(key)
  }

  return (
    <div style={{ maxWidth: 520 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, letterSpacing: '-0.01em' }}>Settings</h2>

      {error && <div className="error-message">{error}</div>}

      {/* General */}
      <div className="section-card" style={{ marginBottom: 16 }}>
        <div className="card-header"><h2>General</h2></div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 6 }}>
              Bakery Name
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="form-control" style={{ flex: 1 }}
                value={settings.bakery_name}
                onChange={e => setSettings(s => ({ ...s, bakery_name: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && saveSetting('bakery_name', settings.bakery_name)} />
              <button className="btn btn-primary btn-sm" onClick={() => saveSetting('bakery_name', settings.bakery_name)}>
                {saved === 'bakery_name' ? '✓ Saved' : 'Save'}
              </button>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 6 }}>
              Baking Date
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="date" className="form-control" style={{ flex: 1 }}
                value={settings.baking_date}
                onChange={e => setSettings(s => ({ ...s, baking_date: e.target.value }))} />
              <button className="btn btn-primary btn-sm" onClick={() => saveSetting('baking_date', settings.baking_date)}>
                {saved === 'baking_date' ? '✓ Saved' : 'Save'}
              </button>
              <button className="btn btn-secondary btn-sm"
                onClick={() => { const t = new Date().toISOString().slice(0,10); setSettings(s=>({...s,baking_date:t})); saveSetting('baking_date',t) }}>
                Today
              </button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              Default date for Orders, Bake List, and Recipe Generator.
            </div>
          </div>

        </div>
      </div>

      {/* Theme */}
      <div className="section-card">
        <div className="card-header"><h2>Theme</h2></div>
        <div className="card-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {THEMES.map(theme => (
              <button key={theme.key}
                onClick={() => selectTheme(theme.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                  border: activeTheme === theme.key ? '2px solid var(--primary)' : '1px solid var(--border)',
                  background: activeTheme === theme.key ? 'var(--primary-light)' : 'var(--surface)',
                  cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)', transition: 'all 0.15s'
                }}>
                {/* Colour swatch */}
                <div style={{ display: 'flex', gap: 4 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 4, background: theme.vars['--primary'] }} />
                  <div style={{ width: 20, height: 20, borderRadius: 4, background: theme.vars['--nav-bg'] }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: activeTheme === theme.key ? 600 : 400 }}>{theme.label}</span>
                {activeTheme === theme.key && <span style={{ marginLeft: 'auto', color: 'var(--primary)', fontSize: 12, fontWeight: 700 }}>✓ Active</span>}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
            Theme is saved in your browser — each user can pick their own.
          </div>
        </div>
      </div>
    </div>
  )
}
