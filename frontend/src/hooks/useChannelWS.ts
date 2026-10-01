import { useEffect, useRef } from 'react'

/**
 * Hook genérico para WebSocket por canal (estación o cola de despacho).
 * Reintenta con backoff. Llama onMessage en cada evento del servidor.
 */
export function useChannelWS(path: string, onMessage: (evt: { type: string; data: unknown }) => void) {
  const wsRef = useRef<WebSocket | null>(null)
  const cbRef = useRef(onMessage)
  cbRef.current = onMessage

  useEffect(() => {
    let cancelled = false
    let reconnect: ReturnType<typeof setTimeout> | null = null
    let heartbeat: ReturnType<typeof setInterval> | null = null

    const connect = () => {
      if (cancelled) return
      try {
        const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
        const ws = new WebSocket(`${proto}://${window.location.host}${path}`)
        wsRef.current = ws
        ws.onopen = () => {
          heartbeat = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) ws.send('ping')
          }, 25000)
        }
        ws.onmessage = (msg) => {
          try {
            const data = JSON.parse(msg.data)
            cbRef.current(data)
          } catch {
            /* ignore non-json */
          }
        }
        ws.onclose = () => {
          if (heartbeat) { clearInterval(heartbeat); heartbeat = null }
          if (!cancelled) reconnect = setTimeout(connect, 2000)
        }
        ws.onerror = () => ws.close()
      } catch {
        if (!cancelled) reconnect = setTimeout(connect, 3000)
      }
    }

    connect()
    return () => {
      cancelled = true
      if (reconnect) clearTimeout(reconnect)
      if (heartbeat) clearInterval(heartbeat)
      try { wsRef.current?.close() } catch { /* noop */ }
    }
  }, [path])
}
