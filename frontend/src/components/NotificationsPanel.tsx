import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { notificationsApi } from '../services/api'
import { Bell, AlertTriangle, Info, X, Package, ChefHat, DollarSign } from 'lucide-react'

interface Alert {
  id: string
  type: 'critical' | 'warning' | 'info'
  title: string
  message: string
  category: 'inventory' | 'kitchen' | 'finance'
}

interface NotificationsData {
  total: number
  critical_count: number
  warning_count: number
  alerts: Alert[]
}

const categoryIcon = {
  inventory: <Package size={14} />,
  kitchen: <ChefHat size={14} />,
  finance: <DollarSign size={14} />,
}

const typeStyle = {
  critical: {
    border: 'border-red-700',
    bg: 'bg-red-900/20',
    icon: <AlertTriangle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />,
    title: 'text-red-300',
  },
  warning: {
    border: 'border-yellow-700',
    bg: 'bg-yellow-900/15',
    icon: <AlertTriangle size={14} className="text-yellow-400 flex-shrink-0 mt-0.5" />,
    title: 'text-yellow-300',
  },
  info: {
    border: 'border-blue-700',
    bg: 'bg-blue-900/15',
    icon: <Info size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />,
    title: 'text-blue-300',
  },
}

export default function NotificationsPanel() {
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const panelRef = useRef<HTMLDivElement>(null)

  const { data } = useQuery<NotificationsData>({
    queryKey: ['notifications'],
    queryFn: () => notificationsApi.get().then(r => r.data),
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  })

  // Close panel when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const visible = (data?.alerts ?? []).filter(a => !dismissed.has(a.id))
  const criticalCount = visible.filter(a => a.type === 'critical').length
  const warningCount = visible.filter(a => a.type === 'warning').length
  const badgeCount = visible.length

  const dismiss = (id: string) => setDismissed(prev => new Set(prev).add(id))

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-lg text-gray-400 hover:text-white hover:bg-dark-700 transition-colors"
        title="Notificaciones"
      >
        <Bell size={20} />
        {badgeCount > 0 && (
          <span className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full text-white text-xs font-bold flex items-center justify-center px-1 ${criticalCount > 0 ? 'bg-red-600' : 'bg-yellow-600'}`}>
            {badgeCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-dark-800 border border-dark-600 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-dark-600 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-brand-400" />
              <span className="font-semibold text-white text-sm">Notificaciones</span>
              {badgeCount > 0 && (
                <span className="text-xs text-gray-500">({badgeCount})</span>
              )}
            </div>
            {dismissed.size > 0 && (
              <button
                onClick={() => setDismissed(new Set())}
                className="text-gray-500 hover:text-gray-300 text-xs"
              >
                Restablecer
              </button>
            )}
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {visible.length === 0 ? (
              <div className="py-10 text-center">
                <Bell size={32} className="text-gray-700 mx-auto mb-2" />
                <p className="text-gray-500 text-sm">Sin alertas activas</p>
                <p className="text-gray-600 text-xs mt-1">Todo está en orden</p>
              </div>
            ) : (
              <div className="p-2 space-y-2">
                {/* Critical first */}
                {visible
                  .sort((a, b) => {
                    const order = { critical: 0, warning: 1, info: 2 }
                    return order[a.type] - order[b.type]
                  })
                  .map(alert => {
                    const s = typeStyle[alert.type]
                    return (
                      <div
                        key={alert.id}
                        className={`rounded-lg border p-3 ${s.border} ${s.bg} relative`}
                      >
                        <button
                          onClick={() => dismiss(alert.id)}
                          className="absolute top-2 right-2 text-gray-600 hover:text-gray-400"
                        >
                          <X size={12} />
                        </button>
                        <div className="flex gap-2 pr-4">
                          {s.icon}
                          <div className="flex-1 min-w-0">
                            <p className={`font-semibold text-xs leading-tight ${s.title}`}>
                              {alert.title}
                            </p>
                            <p className="text-gray-400 text-xs mt-0.5 leading-snug">
                              {alert.message}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 mt-1.5 text-gray-600">
                          {categoryIcon[alert.category]}
                          <span className="text-xs capitalize">{alert.category}</span>
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}
          </div>

          {/* Summary footer */}
          {visible.length > 0 && (
            <div className="px-4 py-2 border-t border-dark-600 flex items-center gap-4 text-xs text-gray-500">
              {criticalCount > 0 && <span className="text-red-400 font-semibold">{criticalCount} crítica(s)</span>}
              {warningCount > 0 && <span className="text-yellow-400 font-semibold">{warningCount} advertencia(s)</span>}
              <span className="ml-auto text-gray-600">Actualiza cada 60s</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
