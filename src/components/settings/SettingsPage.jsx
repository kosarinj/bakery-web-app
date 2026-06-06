import { useState, useEffect } from 'react'

export default function SettingsPage() {
  const [settings, setSettings] = useState({ bakery_name: '', baking_date: '' })
  const [saved, setSaved] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/settings', { credentials: 'include' })
      .then(r => r.json())
      .then(data => setSettings(s => ({ ...s, ...data })))
      .catch(() => {})
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

  return (
    <div style={{ maxWidth: 500 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, letterSpacing: '-0.01em' }}>Settings</h2>

      {error && <div className="error-message">{error}</div>}

      <div className="section-card">
        <div className="card-header"><h2>General</h2></div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 6 }}>
              Bakery Name
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="form-control"
                style={{ flex: 1 }}
                value={settings.bakery_name}
                onChange={e => setSettings(s => ({ ...s, bakery_name: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && saveSetting('bakery_name', settings.bakery_name)}
              />
              <button className="btn btn-primary btn-sm" onClick={() => saveSetting('bakery_name', settings.bakery_name)}>
                {saved === 'bakery_name' ? '✓ Saved' : 'Save'}
              </button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              Shown in the header and on the login page.
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 6 }}>
              Baking Date
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="date"
                className="form-control"
                style={{ flex: 1 }}
                value={settings.baking_date}
                onChange={e => setSettings(s => ({ ...s, baking_date: e.target.value }))}
              />
              <button className="btn btn-primary btn-sm" onClick={() => saveSetting('baking_date', settings.baking_date)}>
                {saved === 'baking_date' ? '✓ Saved' : 'Save'}
              </button>
              <button className="btn btn-secondary btn-sm"
                onClick={() => {
                  const today = new Date().toISOString().slice(0, 10)
                  setSettings(s => ({ ...s, baking_date: today }))
                  saveSetting('baking_date', today)
                }}>
                Today
              </button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              Default date used by Orders, Bake List, and other screens. Update this each morning.
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
