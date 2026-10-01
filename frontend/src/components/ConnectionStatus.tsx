/**
 * Indicador visual de conexión en la esquina superior.
 *  - Verde:   online + servidor OK
 *  - Naranja: offline / servidor sin respuesta (los pedidos se encolan)
 *  - Rojo:    sin red del navegador
 *
 * Auto-flush de la cola offline cada vez que vuelve la conexión.
 */
import { useEffect, useState } from 'react'
import { useConnectionStatus } from '../hooks/useConnectionStatus'
import { flushQueue, queueSize } from '../utils/offlineQueue'
import { Wifi, WifiOff, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'

export default function ConnectionStatus() {
  const { online, serverOk, healthy } = useConnectionStatus()
  const [pending, setPending] = useState(0)
  const [flushing, setFlushing] = useState(false)

  useEffect(() => {
    let alive = true
    const refresh = async () => {
      try {
        const n = await queueSize()
        if (alive) setPending(n)
      } catch { /* noop */ }
    }
    refresh()
    const t = setInterval(refresh, 5000)
    return () => { alive = false; clearInterval(t) }
  }, [healthy])

  // Auto-flush cuando recupera salud
  useEffect(() => {
    if (!healthy || pending === 0 || flushing) return
    let cancelled = false
    const run = async () => {
      setFlushing(true)
      try {
        const token = localStorage.getItem('token')
        const { sent, failed } = await flushQueue(token)
        if (cancelled) return
        if (sent > 0) toast.success(`✓ ${sent} pedidos sincronizados`)
        if (failed > 0) toast.error(`${failed} pedidos no se pudieron sincronizar`)
        setPending(await queueSize())
      } finally {
        setFlushing(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [healthy, pending, flushing])

  let icon = <CheckCircle size={14} />
  let bg = 'bg-green-700'
  let label = 'Conectado'
  if (!online) {
    icon = <WifiOff size={14} />
    bg = 'bg-red-700'
    label = 'Sin WiFi'
  } else if (!serverOk) {
    icon = <AlertTriangle size={14} />
    bg = 'bg-orange-600'
    label = 'Servidor sin respuesta'
  }

  return (
    <div className={`${bg} text-white text-xs px-2 py-1 rounded-full flex items-center gap-1 shadow-lg`}>
      {flushing ? <RefreshCw size={14} className="animate-spin" /> : icon}
      <span className="hidden sm:inline">{label}</span>
      {pending > 0 && (
        <span className="bg-white/20 px-1.5 py-0.5 rounded-full font-bold">
          {pending} pendientes
        </span>
      )}
    </div>
  )
}
