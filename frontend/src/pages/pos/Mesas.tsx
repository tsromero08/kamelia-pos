import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ordersApi } from '../../services/api'
import { formatCurrency } from '../../utils/format'
import { Plus, RefreshCw, ChefHat, Coffee, DollarSign, CheckCircle, AlertTriangle } from 'lucide-react'

type TableState = 'available' | 'occupied' | 'pending_payment' | 'paid'

interface TableInfo {
  number: string
  state: TableState
  orderNumber?: string
  total?: number
  status?: string
}

const DEFAULT_TABLES = 10

const STATE_META: Record<TableState, {
  label: string
  bg: string
  border: string
  text: string
  glow: string
  icon: React.ElementType
}> = {
  available:        { label: 'Disponible',        bg: 'bg-dark-700',          border: 'border-dark-500 hover:border-brand-500',  text: 'text-white',        glow: '',                            icon: Plus },
  occupied:         { label: 'Ocupada',           bg: 'bg-blue-900/40',       border: 'border-blue-700',                          text: 'text-blue-200',     glow: 'shadow-blue-900/40',          icon: ChefHat },
  pending_payment:  { label: 'Pendiente de pago', bg: 'bg-orange-900/50',     border: 'border-orange-600',                        text: 'text-orange-200',   glow: 'shadow-orange-900/40',        icon: DollarSign },
  paid:             { label: 'Pagada',            bg: 'bg-green-900/40',      border: 'border-green-700',                         text: 'text-green-200',    glow: 'shadow-green-900/40',         icon: CheckCircle },
}

export default function Mesas() {
  const navigate = useNavigate()
  const [tableCount, setTableCount] = useState<number>(() => {
    const stored = parseInt(localStorage.getItem('pb-table-count') || '')
    return Number.isFinite(stored) && stored > 0 ? stored : DEFAULT_TABLES
  })

  const { data: status = {}, isFetching, refetch } = useQuery<Record<string, { table_state: TableState; order_number: string; total: string; status: string }>>({
    queryKey: ['tables-status'],
    queryFn: () => ordersApi.tablesStatus().then(r => r.data),
    refetchInterval: 5000,
  })

  const updateTableCount = (n: number) => {
    const safe = Math.max(1, Math.min(50, n))
    setTableCount(safe)
    localStorage.setItem('pb-table-count', String(safe))
  }

  const tables: TableInfo[] = Array.from({ length: tableCount }, (_, i) => {
    const num = String(i + 1)
    const info = status[num]
    if (!info) return { number: num, state: 'available' }
    return {
      number: num,
      state: info.table_state,
      orderNumber: info.order_number,
      total: parseFloat(info.total || '0'),
      status: info.status,
    }
  })

  const counts = tables.reduce<Record<TableState, number>>(
    (acc, t) => ({ ...acc, [t.state]: acc[t.state] + 1 }),
    { available: 0, occupied: 0, pending_payment: 0, paid: 0 },
  )

  const goToPos = (table: TableInfo) => {
    if (table.state === 'pending_payment') {
      navigate(`/admin/caja?mesa=${table.number}`)
      return
    }
    navigate(`/admin/pos?mesa=${table.number}`)
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-white flex items-center gap-2">
            <Coffee size={28} className="text-brand-400" /> Mesas
          </h1>
          <p className="text-gray-500 text-sm">Selecciona una mesa para tomar el pedido</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-gray-400 text-xs">Total mesas</label>
          <input
            type="number"
            min={1}
            max={50}
            value={tableCount}
            onChange={e => updateTableCount(parseInt(e.target.value) || DEFAULT_TABLES)}
            className="input w-20 h-9 text-center"
          />
          <button
            onClick={() => refetch()}
            className="btn-secondary flex items-center gap-1 h-9 px-3"
            title="Actualizar"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Resumen de estados */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {(['available', 'occupied', 'pending_payment', 'paid'] as TableState[]).map(s => {
          const meta = STATE_META[s]
          const Icon = meta.icon
          return (
            <div key={s} className={`${meta.bg} border ${meta.border} rounded-xl px-3 py-2 flex items-center gap-2`}>
              <Icon size={18} className={meta.text} />
              <div>
                <p className={`text-[11px] font-bold uppercase ${meta.text}`}>{meta.label}</p>
                <p className="text-white text-xl font-black">{counts[s]}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Grid de mesas */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {tables.map(t => {
          const meta = STATE_META[t.state]
          const Icon = meta.icon
          return (
            <button
              key={t.number}
              onClick={() => goToPos(t)}
              className={`${meta.bg} border-2 ${meta.border} rounded-2xl p-4 text-left transition-all active:scale-95 shadow-lg ${meta.glow} min-h-[140px] flex flex-col justify-between`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">Mesa</p>
                  <p className={`${meta.text} text-4xl font-black leading-none`}>{t.number}</p>
                </div>
                <Icon size={22} className={meta.text} />
              </div>
              <div className="space-y-0.5">
                <p className={`${meta.text} text-xs font-bold uppercase`}>{meta.label}</p>
                {t.orderNumber && (
                  <p className="text-gray-400 text-[10px] truncate">#{t.orderNumber}</p>
                )}
                {typeof t.total === 'number' && t.total > 0 && (
                  <p className="text-white text-sm font-bold">{formatCurrency(t.total)}</p>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Leyenda */}
      <div className="bg-dark-800 border border-dark-600 rounded-xl p-3 text-xs text-gray-500 flex items-start gap-2">
        <AlertTriangle size={14} className="text-yellow-500 flex-shrink-0 mt-0.5" />
        <p>
          La mesa solo se libera cuando el cliente paga. Mesas <span className="text-orange-300 font-bold">pendientes de pago</span> redirigen a Caja al tocarlas. Las mesas se actualizan en tiempo real.
        </p>
      </div>
    </div>
  )
}
