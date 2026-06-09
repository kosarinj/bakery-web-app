import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

const TODAY = new Date().toISOString().slice(0, 10)

export default function ScanPage() {
  const navigate = useNavigate()
  const videoRef    = useRef(null)
  const controlsRef = useRef(null)
  const lastCodeRef = useRef(null)
  const leftInputRef = useRef(null)

  // Session state — persisted to sessionStorage
  const [location,  setLocation]  = useState(() => sessionStorage.getItem('scan_location') || '')
  const [scanDate,  setScanDate]  = useState(TODAY)

  const [products,   setProducts]   = useState([])
  const [locations,  setLocations]  = useState([])
  const [matched,    setMatched]    = useState(null)   // product row | { unknown, code }
  const [leftQty,    setLeftQty]    = useState('0')
  const [returnQty,  setReturnQty]  = useState('0')
  const [saving,     setSaving]     = useState(false)
  const [saveMsg,    setSaveMsg]    = useState('')
  const [sessionLog, setSessionLog] = useState([])    // scans saved this session
  const [camStatus,  setCamStatus]  = useState('loading')
  const [manualSearch, setManualSearch] = useState('')

  useEffect(() => { sessionStorage.setItem('scan_location', location) }, [location])

  // Load products (for barcode matching) and known locations
  useEffect(() => {
    const g = url => fetch(url, { credentials: 'include' }).then(r => r.json()).catch(() => [])
    Promise.all([g('/api/products'), g('/api/daily-inventory/locations')]).then(([prods, locs]) => {
      if (Array.isArray(prods))    setProducts(prods)
      if (Array.isArray(locs))     setLocations(locs)
    })
  }, [])

  const productsRef = useRef([])
  useEffect(() => { productsRef.current = products }, [products])

  function handleCode(code) {
    if (code === lastCodeRef.current) return
    lastCodeRef.current = code
    setTimeout(() => { if (lastCodeRef.current === code) lastCodeRef.current = null }, 2500)

    const hit = productsRef.current.find(p => p.barcode && p.barcode.trim() === code.trim())
    if (hit) {
      setMatched(hit)
      setLeftQty('0')
      setReturnQty('0')
      setManualSearch('')
      setTimeout(() => leftInputRef.current?.select(), 80)
    } else {
      setMatched({ unknown: true, code })
    }
    try { navigator.vibrate?.(60) } catch (_) {}
  }

  // Start camera
  useEffect(() => {
    let active = true
    async function start() {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const reader   = new BrowserMultiFormatReader()
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } },
          videoRef.current,
          result => { if (active && result) handleCode(result.getText()) }
        )
        controlsRef.current = controls
        if (active) setCamStatus('ready')
      } catch (e) {
        if (!active) return
        setCamStatus(e?.name === 'NotAllowedError' ? 'denied' : 'error')
      }
    }
    start()
    return () => { active = false; try { controlsRef.current?.stop() } catch (_) {} }
  }, [])

  async function save() {
    if (!matched || matched.unknown) return
    if (!location.trim()) { setSaveMsg('Set a location first'); return }
    setSaving(true)
    try {
      const body = {
        location: location.trim(),
        inv_date: scanDate,
        prod_name: matched.prod_name,
        left_qty:   parseFloat(leftQty)   || 0,
        return_qty: parseFloat(returnQty) || 0,
      }
      await fetch('/api/daily-inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      setSessionLog(prev => [{
        prod_name:  matched.prod_name,
        left_qty:   body.left_qty,
        return_qty: body.return_qty,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }, ...prev.slice(0, 49)])
      setSaveMsg('Saved')
      setTimeout(() => setSaveMsg(''), 1600)
      lastCodeRef.current = null
      setMatched(null)
      setLeftQty('0')
      setReturnQty('0')
    } catch {
      setSaveMsg('Save failed')
    }
    setSaving(false)
  }

  function dismiss() {
    lastCodeRef.current = null
    setMatched(null)
    setSaveMsg('')
  }

  const searchResults = manualSearch.length > 1
    ? products.filter(p => (p.prod_name || '').toLowerCase().includes(manualSearch.toLowerCase())).slice(0, 8)
    : []

  const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, marginBottom: 14 }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '14px 16px', fontFamily: 'var(--font)', minHeight: '100vh', background: 'var(--bg)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <button onClick={() => navigate('/inventory')}
          style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 600 }}>
          ← Inventory
        </button>
        <span style={{ fontSize: 17, fontWeight: 700, flex: 1 }}>Daily Inventory Scan</span>
        {camStatus === 'ready' && (
          <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600, background: '#dcfce7', padding: '3px 8px', borderRadius: 20 }}>Camera on</span>
        )}
      </div>

      {/* Location + Date */}
      <div style={{ ...card, display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Location</div>
          <input list="locations-list" value={location} onChange={e => setLocation(e.target.value)}
            placeholder="e.g. 10.5 or 57th Wed"
            style={{ width: '100%', fontSize: 16, padding: '9px 12px', border: '2px solid ' + (location ? 'var(--primary)' : 'var(--border)'), borderRadius: 8, boxSizing: 'border-box', fontFamily: 'var(--font)', fontWeight: 600 }} />
          <datalist id="locations-list">
            {locations.map(l => <option key={l} value={l} />)}
          </datalist>
        </div>
        <div style={{ minWidth: 130 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Date</div>
          <input type="date" value={scanDate} onChange={e => setScanDate(e.target.value)}
            style={{ width: '100%', fontSize: 14, padding: '9px 10px', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'var(--font)' }} />
        </div>
      </div>

      {/* Camera */}
      <div style={{ position: 'relative', background: '#111', borderRadius: 14, overflow: 'hidden', marginBottom: 14, aspectRatio: '4/3' }}>
        <video ref={videoRef} muted playsInline autoPlay style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />

        {camStatus === 'ready' && !matched && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ width: '72%', height: 56, border: '2px solid rgba(255,255,255,0.85)', borderRadius: 8, boxShadow: '0 0 0 1000px rgba(0,0,0,0.3)' }} />
            <div style={{ marginTop: 14, color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>Align barcode within the frame</div>
          </div>
        )}
        {camStatus === 'loading' && <CamMsg>Starting camera…</CamMsg>}
        {camStatus === 'denied' && <CamMsg icon="📷">Camera access denied — use manual search below</CamMsg>}
        {camStatus === 'error'  && <CamMsg>Camera unavailable — use manual search below</CamMsg>}
      </div>

      {/* Matched product */}
      {matched && !matched.unknown && (
        <div style={{ ...card, border: '2px solid var(--primary)', boxShadow: '0 0 0 3px var(--primary-light)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700 }}>{matched.prod_name}</div>
              {matched.prod_group && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{matched.prod_group}</div>}
            </div>
            <button onClick={dismiss} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--text-muted)', cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>×</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <QtyField label="Left" value={leftQty} onChange={setLeftQty} inputRef={leftInputRef} onEnter={() => save()} />
            <QtyField label="Return" value={returnQty} onChange={setReturnQty} onEnter={() => save()} />
          </div>

          <button onClick={save} disabled={saving}
            style={{ width: '100%', fontSize: 16, padding: '13px', background: saving ? '#aaa' : 'var(--primary)', color: 'white', border: 'none', borderRadius: 10, fontWeight: 700, cursor: saving ? 'default' : 'pointer' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          {saveMsg && (
            <div style={{ marginTop: 8, textAlign: 'center', fontWeight: 700, fontSize: 14, color: saveMsg === 'Saved' ? '#16a34a' : '#e11d48' }}>{saveMsg}</div>
          )}
        </div>
      )}

      {/* Unknown barcode */}
      {matched?.unknown && (
        <div style={{ ...card, border: '2px solid #fbbf24' }}>
          <div style={{ fontWeight: 600, color: '#92400e', marginBottom: 4 }}>Unknown barcode</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace', marginBottom: 8 }}>{matched.code}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>Search for the product below to count it manually.</div>
          <button onClick={dismiss} style={{ fontSize: 13, padding: '6px 14px', background: 'none', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font)' }}>Dismiss</button>
        </div>
      )}

      {/* No-location warning */}
      {saveMsg === 'Set a location first' && (
        <div style={{ marginBottom: 14, padding: '10px 14px', background: '#fef9c3', border: '1px solid #fbbf24', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#92400e' }}>
          Enter a location at the top before saving.
        </div>
      )}

      {/* Manual search */}
      <div style={card}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Manual Search</div>
        <input type="text" inputMode="search" placeholder="Type product name…"
          value={manualSearch} onChange={e => setManualSearch(e.target.value)}
          style={{ width: '100%', fontSize: 16, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, boxSizing: 'border-box', fontFamily: 'var(--font)' }} />
        {searchResults.length > 0 && (
          <div style={{ marginTop: 6, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {searchResults.map((p, i) => (
              <button key={p.prod_name}
                onClick={() => { setMatched(p); setLeftQty('0'); setReturnQty('0'); setManualSearch(''); setTimeout(() => leftInputRef.current?.select(), 80) }}
                style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '12px 14px', textAlign: 'left', border: 'none', borderBottom: i < searchResults.length - 1 ? '1px solid var(--border-light)' : 'none', background: 'var(--surface)', cursor: 'pointer', fontSize: 14, fontFamily: 'var(--font)' }}>
                <span style={{ fontWeight: 600 }}>{p.prod_name}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{p.prod_group || p.prod_type || ''}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Session log */}
      {sessionLog.length > 0 && (
        <div style={card}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Session — {sessionLog.length} scan{sessionLog.length !== 1 ? 's' : ''}{location ? ` @ ${location}` : ''}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto auto', gap: '6px 10px', fontSize: 13, alignItems: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>Time</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>Product</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textAlign: 'right' }}>Left</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textAlign: 'right' }}>Ret</div>
            <div />
            {sessionLog.map((item, i) => (
              <>
                <div key={`t${i}`} style={{ color: 'var(--text-muted)', fontSize: 12 }}>{item.time}</div>
                <div key={`p${i}`} style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.prod_name}</div>
                <div key={`l${i}`} style={{ textAlign: 'right', fontWeight: 600 }}>{item.left_qty}</div>
                <div key={`r${i}`} style={{ textAlign: 'right', color: item.return_qty > 0 ? '#dc2626' : 'var(--text-muted)' }}>{item.return_qty}</div>
                <div key={`d${i}`} style={{ borderBottom: i < sessionLog.length - 1 ? '1px solid var(--border-light)' : 'none', gridColumn: '1 / -1', height: 1 }} />
              </>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function QtyField({ label, value, onChange, inputRef, onEnter }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>{label}</div>
      <input ref={inputRef} type="number" inputMode="numeric" value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onEnter?.()}
        style={{ width: '100%', fontSize: 30, fontWeight: 700, textAlign: 'center', border: '2px solid var(--border)', borderRadius: 10, padding: '10px 8px', fontFamily: 'var(--font)', boxSizing: 'border-box' }} />
    </div>
  )
}

function CamMsg({ children, icon }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
      <div style={{ color: 'white' }}>
        {icon && <div style={{ fontSize: 32, marginBottom: 8 }}>{icon}</div>}
        <div style={{ fontSize: 14 }}>{children}</div>
      </div>
    </div>
  )
}
