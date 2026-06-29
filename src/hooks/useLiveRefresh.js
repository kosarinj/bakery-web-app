import { useEffect, useRef } from 'react'

// Subscribe to server-sent change events and run `onChange(channel)` when one of
// the watched channels is touched by ANY user. Debounced so a burst of writes
// (e.g. a bulk add, or fast cell edits) triggers a single refetch.
//
//   useLiveRefresh('spec-orders', () => load(true))
//   useLiveRefresh(['orders', 'accounts'], reload)
//
// `channels` maps to the first path segment after /api (e.g. POST /api/spec-orders
// → "spec-orders"). Same-origin EventSource sends the session cookie automatically.
export default function useLiveRefresh(channels, onChange, { debounce = 400 } = {}) {
  const cbRef = useRef(onChange)
  cbRef.current = onChange
  const key = (Array.isArray(channels) ? channels : [channels]).filter(Boolean).join(',')

  useEffect(() => {
    if (!key) return
    const watch = new Set(key.split(','))
    let timer = null
    let es
    try {
      es = new EventSource('/api/events', { withCredentials: true })
    } catch {
      return
    }
    es.addEventListener('change', (e) => {
      let channel = ''
      try { channel = JSON.parse(e.data).channel } catch { /* ignore */ }
      if (!watch.has(channel)) return
      clearTimeout(timer)
      timer = setTimeout(() => cbRef.current && cbRef.current(channel), debounce)
    })
    // EventSource auto-reconnects on transient errors; nothing to do here.
    return () => { clearTimeout(timer); if (es) es.close() }
  }, [key, debounce])
}
