import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

export default function ScanPage() {
  const navigate = useNavigate()
  const videoRef    = useRef(null)
  const controlsRef = useRef(null)
  const lastCodeRef = useRef(null)  // debounce: don't re-fire same barcode
  const qtyInputRef = useRef(null)

  const [products, setProducts]         = useState([])
  const [matched,  setMatched]          = useState(null)  // product row or { unknown: true, code }
  const [qty,      setQty]              = useState('')
  const [saving,   setSaving]           = useState(false)
  const [saveMsg,  setSaveMsg]          = useState('')
  const [log,      setLog]              = useState([])    // [{ prod_name, qty, time }]
  const [camStatus, setCamStatus]       = useState('loading') // loading | ready | denied | error
  const [manualSearch, setManualSearch] = useState('')

  // Load all products + current inventory
  useEffect(() => {
    fetch('/api/inventory', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setProducts(d) })
      .catch(() => {})
  }, [])

  // products ref so the camera callback always sees fresh data
  const productsRef = useRef([])
  useEffect(() => { productsRef.current = products }, [products])

  function handleCode(code) {
    if (code === lastCodeRef.current) return  // same barcode still in view
    lastCodeRef.current = code
    setTimeout(() => { if (lastCodeRef.current === code) lastCodeRef.current = null }, 2500)

    const hit = productsRef.current.find(p => p.barcode && p.barcode.trim() === code.trim())
    if (hit) {
      setMatched(hit)
      setQty(String(hit.units ?? 0))
      setManualSearch('')
      setTimeout(() => qtyInputRef.current?.select(), 80)
    } else {
      setMatched({ unknown: true, code })
    }
    try { navigator.vibrate?.(60) } catch (_) {}
  }

  // Start camera + scanner
  useEffect(() => {
    let active = true
    async function start() {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const reader = new BrowserMultiFormatReader()
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } },
          videoRef.current,
          (result) => { if (active && result) handleCode(result.getText()) }
        )
        controlsRef.current = controls
        if (active) setCamStatus('ready')
      } catch (e) {
        if (!active) return
        setCamStatus(e?.name === 'NotAllowedError' ? 'denied' : 'error')
      }
    }
    start()
    return () => {
      active = false
      try { controlsRef.current?.stop() } catch (_) {}
    }
  }, [])

  async function save() {
    if (!matched || matched.unknown || !qty) return
    const n = parseFloat(qty)
    if (isNaN(n) || n < 0) return
    setSaving(true)
    try {
      await fetch(`/api/inventory/${encodeURIComponent(matched.prod_name)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ units: n }),
      })
      setProducts(prev => prev.map(p => p.prod_name === matched.prod_name ? { ...p, units: n } : p))
      setLog(prev => [{ prod_name: matched.prod_name, qty: n, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }, ...prev.slice(0, 29)])
      setSaveMsg('Saved')
      setTimeout(() => setSaveMsg(''), 1800)
      lastCodeRef.current = null  // allow re-scanning same barcode
      setMatched(null)
      setQty('')
    } catch {
      setSaveMsg('Save failed')
    }
    setSaving(false)
  }

  function dismiss() {
    lastCodeRef.current = null
    setMatched(null)
    setQty('')
    setSaveMsg('')
  }

  const searchResults = manualSearch.length > 1
    ? products.filter(p => (p.prod_name || '').toLowerCase().includes(manualSearch.toLowerCase())).slice(0, 8)
    : []

  const card = {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 14, padding: '16px', marginBottom: 14,
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '14px 16px', fontFamily: 'var(--font)', minHeight: '100vh', background: 'var(--bg)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <button onClick={() => navigate('/inventory')}
          style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 14, cursor: 'pointer', padding: '4px 0', fontFamily: 'var(--font)', fontWeight: 600 }}>
          ← Inventory
        </button>
        <span style={{ fontSize: 17, fontWeight: 700, flex: 1 }}>Scan Inventory</span>
        {camStatus === 'ready' && (
          <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600, background: '#dcfce7', padding: '3px 8px', borderRadius: 20 }}>Camera ready</span>
        )}
      </div>

      {/* Camera */}
      <div style={{ position: 'relative', background: '#111', borderRadius: 14, overflow: 'hidden', marginBottom: 14, aspectRatio: '4/3' }}>
        <video ref={videoRef} muted playsInline autoPlay
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />

        {/* Scan target overlay */}
        {camStatus === 'ready' && !matched && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ width: '70%', height: 60, border: '2px solid rgba(255,255,255,0.85)', borderRadius: 8, boxShadow: '0 0 0 1000px rgba(0,0,0,0.35)' }}>
              <div style={{ position: 'absolute', bottom: 10, left: 0, right: 0, textAlign: 'center', color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
                Align barcode within the frame
              </div>
            </div>
          </div>
        )}

        {camStatus === 'loading' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 14 }}>
            Starting camera…
          </div>
        )}
        {camStatus === 'denied' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
            <div style={{ color: 'white' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📷</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Camera access denied</div>
              <div style={{ fontSize: 12, marginTop: 6, opacity: 0.75 }}>Use the manual search below</div>
            </div>
          </div>
        )}
        {camStatus === 'error' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
            <div style={{ color: 'white' }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Camera unavailable</div>
              <div style={{ fontSize: 12, marginTop: 6, opacity: 0.75 }}>Use the manual search below</div>
            </div>
          </div>
        )}
      </div>

      {/* Matched product */}
      {matched && !matched.unknown && (
        <div style={{ ...card, border: '2px solid var(--primary)', boxShadow: '0 0 0 3px var(--primary-light)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{matched.prod_name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {matched.prod_group || matched.prod_type || ''}{matched.prod_group && matched.prod_type ? ` · ${matched.prod_type}` : ''}
                &nbsp;· current: <strong>{matched.units}</strong> units
              </div>
            </div>
            <button onClick={dismiss}
              style={{ background: 'none', border: 'none', fontSize: 18, color: 'var(--text-muted)', cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <input ref={qtyInputRef} type="number" inputMode="numeric" value={qty}
              onChange={e => setQty(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && save()}
              style={{ flex: 1, fontSize: 36, fontWeight: 700, textAlign: 'center', border: '2px solid var(--border)', borderRadius: 10, padding: '10px 8px', fontFamily: 'var(--font)', outline: 'none', minWidth: 0 }} />
            <button onClick={save} disabled={saving}
              style={{ fontSize: 16, padding: '12px 22px', background: saving ? '#aaa' : 'var(--primary)', color: 'white', border: 'none', borderRadius: 10, fontWeight: 700, cursor: saving ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
              {saving ? '…' : 'Save'}
            </button>
          </div>
          {saveMsg && (
            <div style={{ marginTop: 10, textAlign: 'center', fontWeight: 700, color: saveMsg === 'Saved' ? '#16a34a' : '#e11d48', fontSize: 14 }}>
              {saveMsg}
            </div>
          )}
        </div>
      )}

      {/* Unknown barcode */}
      {matched?.unknown && (
        <div style={{ ...card, borderColor: '#fbbf24' }}>
          <div style={{ fontWeight: 600, color: '#92400e', marginBottom: 6 }}>Unknown barcode</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace', marginBottom: 8 }}>{matched.code}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Search for the product below to count it manually.</div>
          <button onClick={dismiss} style={{ marginTop: 10, fontSize: 13, padding: '6px 14px', background: 'none', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font)' }}>Dismiss</button>
        </div>
      )}

      {/* Manual search */}
      <div style={card}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Manual Search</div>
        <input type="text" inputMode="search" placeholder="Type product name…"
          value={manualSearch} onChange={e => setManualSearch(e.target.value)}
          style={{ width: '100%', fontSize: 16, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, boxSizing: 'border-box', fontFamily: 'var(--font)' }} />
        {searchResults.length > 0 && (
          <div style={{ marginTop: 6, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {searchResults.map((p, i) => (
              <button key={p.prod_name}
                onClick={() => { setMatched(p); setQty(String(p.units ?? 0)); setManualSearch(''); setTimeout(() => qtyInputRef.current?.select(), 80) }}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '12px 14px', textAlign: 'left', border: 'none', borderBottom: i < searchResults.length - 1 ? '1px solid var(--border-light)' : 'none', background: 'var(--surface)', cursor: 'pointer', fontSize: 14, fontFamily: 'var(--font)' }}>
                <span style={{ fontWeight: 600 }}>{p.prod_name}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{p.units ?? 0} units</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Session log */}
      {log.length > 0 && (
        <div style={card}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Session — {log.length} saved
          </div>
          {log.map((item, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: i < log.length - 1 ? '1px solid var(--border-light)' : 'none', fontSize: 14 }}>
              <span style={{ fontWeight: 500 }}>{item.prod_name}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{item.qty} units · {item.time}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
