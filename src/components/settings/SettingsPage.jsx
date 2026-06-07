import { useState, useEffect } from 'react'
import { THEMES, applyTheme } from '../../themes.js'

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
      if (['bg_url', 'bg_opacity', 'bg_tint', 'logo_url'].includes(key)) {
        localStorage.setItem(`bakery-${key}`, value ?? '')
        window.dispatchEvent(new Event('bakery-bg-changed'))
      }
    } catch (e) {
      setError(`Save failed: ${e.message}`)
    }
  }

  function selectTheme(key) {
    setActiveTheme(key)
    applyTheme(key)
  }

  const gradientThemes = THEMES.filter(t => t.gradient)
  const solidThemes    = THEMES.filter(t => !t.gradient)

  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, letterSpacing: '-0.01em' }}>Settings</h2>

      {error && <div className="error-message">{error}</div>}

      {/* General */}
      <div className="section-card" style={{ marginBottom: 16 }}>
        <div className="card-header"><h2>General</h2></div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 6 }}>Bakery Name</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="form-control" style={{ flex: 1 }} value={settings.bakery_name}
                onChange={e => setSettings(s => ({ ...s, bakery_name: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && saveSetting('bakery_name', settings.bakery_name)} />
              <button className="btn btn-primary btn-sm" onClick={() => saveSetting('bakery_name', settings.bakery_name)}>
                {saved === 'bakery_name' ? '✓ Saved' : 'Save'}
              </button>
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 6 }}>Logo URL</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {settings.logo_url && <img src={settings.logo_url} alt="logo preview" style={{ height: 36, width: 'auto', objectFit: 'contain', borderRadius: 4, border: '1px solid var(--border)' }} onError={e => e.target.style.display='none'} />}
              <input className="form-control" style={{ flex: 1 }} placeholder="https://… (link to your logo image)"
                value={settings.logo_url || ''}
                onChange={e => setSettings(s => ({ ...s, logo_url: e.target.value }))} />
              <button className="btn btn-primary btn-sm" onClick={() => saveSetting('logo_url', settings.logo_url || '')}>
                {saved === 'logo_url' ? '✓ Saved' : 'Save'}
              </button>
              {settings.logo_url && <button className="btn btn-secondary btn-sm" onClick={() => { setSettings(s => ({ ...s, logo_url: '' })); saveSetting('logo_url', '') }}>Remove</button>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Appears in the top-left of every page.</div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 6 }}>Baking Date</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="date" className="form-control" style={{ flex: 1 }} value={settings.baking_date}
                onChange={e => setSettings(s => ({ ...s, baking_date: e.target.value }))} />
              <button className="btn btn-primary btn-sm" onClick={() => saveSetting('baking_date', settings.baking_date)}>
                {saved === 'baking_date' ? '✓ Saved' : 'Save'}
              </button>
              <button className="btn btn-secondary btn-sm"
                onClick={() => { const t = new Date().toISOString().slice(0, 10); setSettings(s => ({ ...s, baking_date: t })); saveSetting('baking_date', t) }}>
                Today
              </button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Default date for Orders, Bake List, and Recipe Generator.</div>
          </div>
        </div>
      </div>

      {/* Theme */}
      <div className="section-card" style={{ marginBottom: 16 }}>
        <div className="card-header"><h2>Theme</h2></div>
        <div className="card-body">
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 }}>Solid</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
            {solidThemes.map(theme => (
              <ThemeButton key={theme.key} theme={theme} active={activeTheme === theme.key} onSelect={selectTheme} />
            ))}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 }}>Gradient</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {gradientThemes.map(theme => (
              <ThemeButton key={theme.key} theme={theme} active={activeTheme === theme.key} onSelect={selectTheme} />
            ))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>Saved in your browser — each user can pick their own.</div>
        </div>
      </div>

      {/* Background Photo */}
      <div className="section-card">
        <div className="card-header"><h2>Background Photo</h2></div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 6 }}>Image URL</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="form-control" style={{ flex: 1 }} placeholder="https://… (any public image URL)"
                value={settings.bg_url || ''} onChange={e => setSettings(s => ({ ...s, bg_url: e.target.value }))} />
              <button className="btn btn-primary btn-sm" onClick={() => saveSetting('bg_url', settings.bg_url || '')}>
                {saved === 'bg_url' ? '✓ Saved' : 'Save'}
              </button>
              {settings.bg_url && <button className="btn btn-secondary btn-sm" onClick={() => { setSettings(s => ({ ...s, bg_url: '' })); saveSetting('bg_url', '') }}>Remove</button>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Appears as a subtle background on all pages. Try Unsplash for bakery photos.</div>
          </div>

          {settings.bg_url && (
            <>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 6 }}>
                  Fade — {Math.round((parseFloat(settings.bg_opacity) || 0.08) * 100)}%
                </label>
                <input type="range" min="0" max="0.5" step="0.01" style={{ width: '100%' }}
                  value={settings.bg_opacity || 0.08}
                  onChange={e => { setSettings(s => ({ ...s, bg_opacity: e.target.value })); saveSetting('bg_opacity', e.target.value) }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 6 }}>Tint</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[{ label: 'None', value: 'none' }, { label: 'Dark', value: 'rgba(0,0,0,0.3)' }, { label: 'Light', value: 'rgba(255,255,255,0.4)' },
                    { label: 'Warm', value: 'rgba(180,100,30,0.25)' }, { label: 'Cool', value: 'rgba(30,60,120,0.25)' }, { label: 'Sepia', value: 'rgba(120,80,20,0.3)' }]
                    .map(t => (
                      <button key={t.value} className={`btn btn-sm ${(settings.bg_tint || 'none') === t.value ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => { setSettings(s => ({ ...s, bg_tint: t.value })); saveSetting('bg_tint', t.value) }}>
                        {t.label}
                      </button>
                    ))}
                </div>
              </div>
              <div style={{ borderRadius: 8, overflow: 'hidden', height: 80, position: 'relative', border: '1px solid var(--border)' }}>
                <img src={settings.bg_url} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: parseFloat(settings.bg_opacity) || 0.08 }} onError={e => e.target.style.display = 'none'} />
                {settings.bg_tint && settings.bg_tint !== 'none' && <div style={{ position: 'absolute', inset: 0, background: settings.bg_tint }} />}
                <span style={{ position: 'absolute', bottom: 4, right: 8, fontSize: 11, color: 'white', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>Preview</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ThemeButton({ theme, active, onSelect }) {
  const navColor = theme.vars['--nav-bg']
  const gradStr  = theme.vars['--nav-gradient']
  const accent   = theme.vars['--nav-accent']
  return (
    <button onClick={() => onSelect(theme.key)} style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
      borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font)',
      border: active ? '2px solid var(--primary)' : '1px solid var(--border)',
      background: active ? 'var(--primary-light)' : 'var(--surface)',
      cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s'
    }}>
      {/* Swatch */}
      <div style={{ display: 'flex', gap: 3 }}>
        <div style={{ width: 22, height: 22, borderRadius: 4, background: gradStr || navColor, border: '1px solid rgba(0,0,0,0.15)' }} />
        <div style={{ width: 22, height: 22, borderRadius: 4, background: theme.vars['--primary'], border: '1px solid rgba(0,0,0,0.1)' }} />
        <div style={{ width: 22, height: 22, borderRadius: 4, background: accent, border: '1px solid rgba(0,0,0,0.1)' }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: active ? 600 : 400 }}>{theme.label}</span>
      {theme.gradient && <span className="badge badge-purple" style={{ fontSize: 10 }}>Gradient</span>}
      {active && <span style={{ marginLeft: 'auto', color: 'var(--primary)', fontSize: 12, fontWeight: 700 }}>✓</span>}
    </button>
  )
}
