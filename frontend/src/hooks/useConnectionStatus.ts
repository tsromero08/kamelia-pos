import { useState, useEffect } from 'react'

/**
 * Estado de conexión: online/offline + ping al backend cada 10s.
 * Diferencia entre "navegador sin red" y "servidor caído".
 */
export function useConnectionStatus() {
  const [online, setOnline] = useState(navigator.onLine)
  const [serverOk, setServerOk] = useState(true)
  const [lastPing, setLastPing] = useState<Date | null>(null)

  useEffect(() => {
    const onOn = () => setOnline(true)
    const onOff = () => setOnline(false)
    window.addEventListener('online', onOn)
    window.addEventListener('offline', onOff)
    return () => {
      window.removeEventListener('online', onOn)
      window.removeEventListener('offline', onOff)
    }
  }, [])

  useEffect(() => {
    const ping = async () => {
      try {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 4000)
        const r = await fetch('/health', { signal: ctrl.signal, cache: 'no-store' })
        clearTimeout(timer)
        setServerOk(r.ok)
        setLastPing(new Date())
      } catch {
        setServerOk(false)
      }
    }
    ping()
    const t = setInterval(ping, 10000)
    return () => clearInterval(t)
  }, [])

  return { online, serverOk, healthy: online && serverOk, lastPing }
}
