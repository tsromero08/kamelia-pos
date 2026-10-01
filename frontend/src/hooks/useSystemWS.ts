import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'

/**
 * Conexión global a /ws/system para sincronización en tiempo real entre
 * POS, Caja, Pedidos y Cocina. Invalida queries relevantes ante cualquier
 * evento. Reintenta automáticamente con backoff y mantiene heartbeat.
 *
 * Eventos esperados del backend:
 *  - order_created  → POS / Caja / Cocina deben refrescar
 *  - order_paid     → Caja (facturas + pendientes) + Dashboard
 *  - order_updated  → todo el flujo (cambios admin)
 */
export function useSystemWS() {
  const qc = useQueryClient()
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let heartbeat: ReturnType<typeof setInterval> | null = null
    let cancelled = false

    const invalidateAll = () => {
      qc.invalidateQueries({ queryKey: ['caja-orders'] })
      qc.invalidateQueries({ queryKey: ['invoices-list'] })
      qc.invalidateQueries({ queryKey: ['orders-list'] })
      qc.invalidateQueries({ queryKey: ['kitchen-orders'] })
      qc.invalidateQueries({ queryKey: ['tables-status'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['notifications'] })
    }

    const connect = () => {
      if (cancelled) return
      try {
        const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
        const ws = new WebSocket(`${proto}://${window.location.host}/ws/system`)
        wsRef.current = ws

        ws.onopen = () => {
          heartbeat = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) ws.send('ping')
          }, 25000)
        }

        ws.onmessage = () => {
          // Cualquier mensaje del sistema invalida; React Query trae lo nuevo.
          invalidateAll()
        }

        ws.onclose = () => {
          if (heartbeat) { clearInterval(heartbeat); heartbeat = null }
          if (!cancelled) reconnectTimer = setTimeout(connect, 2000)
        }
        ws.onerror = () => ws.close()
      } catch {
        if (!cancelled) reconnectTimer = setTimeout(connect, 3000)
      }
    }

    connect()
    return () => {
      cancelled = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (heartbeat) clearInterval(heartbeat)
      try { wsRef.current?.close() } catch { /* noop */ }
    }
  }, [qc])
}
