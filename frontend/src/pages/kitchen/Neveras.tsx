/**
 * Pantalla de NEVERAS — alistamiento central.
 * Lista pedidos uno por uno en orden de llegada.
 * Operario alista todos los insumos del pedido y marca "Alistado".
 * Al completar, el pedido entra en estado in_preparation y se reparte a
 * parrilla / sudados / fritos automáticamente.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { kitchenApi } from '../../services/api'
import { NeverasOrder } from '../../types/kitchen'
import { useChannelWS } from '../../hooks/useChannelWS'
import { Snowflake, CheckCircle, Clock, ArrowRight, Flame, Coffee, ChefHat } from 'lucide-react'
import { useState, useEffect } from 'react'
import { COOKING_LABEL } from '../../types/kitchen'

const STATION_ICON: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  parrilla: { icon: Flame, color: 'text-red-400 bg-red-900/30 border-red-700', label: 'PARRILLA' },
  sudados:  { icon: Coffee, color: 'text-amber-400 bg-amber-900/30 border-amber-700', label: 'SUDADOS' },
  fritos:   { icon: Flame, color: 'text-yellow-400 bg-yellow-900/30 border-yellow-700', label: 'FRITOS' },
  emplatamiento: { icon: ChefHat, color: 'text-brand-400 bg-brand-900/30 border-brand-700', label: 'EMPLATAMIENTO' },
}

function fmtWait(seconds: number): { text: string; color: string } {
  const min = Math.floor(seconds / 60)
  const sec = seconds % 60
  let color = 'text-gray-300'
  if (min >= 15) color = 'text-red-500 animate-pulse'
  else if (min >= 10) color = 'text-orange-400'
  else if (min >= 5) color = 'text-yellow-400'
  return { text: `${min}:${sec.toString().padStart(2, '0')}`, color }
}

export default function Neveras() {
  const qc = useQueryClient()
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const { data: orders = [] } = useQuery<NeverasOrder[]>({
    queryKey: ['neveras-queue', tick],
    queryFn: () => kitchenApi.neverasQueue().then(r => r.data),
    refetchInterval: 6000,
  })

  useChannelWS('/ws/station/neveras', () => {
    qc.invalidateQueries({ queryKey: ['neveras-queue'] })
  })

  const complete = async (orderId: number) => {
    if (!confirm('¿Pedido alistado y enviado a cocción?')) return
    await kitchenApi.completeNeveras(orderId)
    qc.invalidateQueries({ queryKey: ['neveras-queue'] })
  }

  return (
    <div className="p-4 md:p-6 space-y-4 min-h-screen bg-dark-900">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Snowflake size={36} className="text-sky-400" />
          <div>
            <h1 className="text-3xl font-black text-white">Neveras · Alistamiento</h1>
            <p className="text-gray-400 text-sm">
              {orders.length} pedidos por alistar · orden de llegada estricto
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-brand-400 font-mono">
            {new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
        </div>
      </div>

      {orders.length === 0 && (
        <div className="text-center py-20 text-gray-500">
          <CheckCircle size={64} className="mx-auto mb-3 opacity-30" />
          <p className="text-xl">Sin pedidos por alistar</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {orders.map((order, idx) => {
          const wait = fmtWait(order.waiting_seconds)
          const isCurrent = idx === 0
          return (
            <div
              key={order.order_id}
              className={`rounded-2xl border-2 p-4 ${
                isCurrent
                  ? 'bg-sky-950/40 border-sky-500 shadow-xl shadow-sky-900/40'
                  : 'bg-dark-800 border-dark-600'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  {isCurrent && (
                    <div className="inline-block px-2 py-0.5 bg-sky-600 text-white text-xs font-bold rounded mb-1">
                      → ACTUAL
                    </div>
                  )}
                  <div className="font-mono text-sm text-gray-500">#{order.order_number}</div>
                  {order.table_number && (
                    <div className="text-2xl font-black text-brand-400">Mesa {order.table_number}</div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500">Esperando</div>
                  <div className="flex items-center gap-1 justify-end">
                    <Clock size={14} className="text-gray-500" />
                    <span className={`font-mono font-bold text-lg ${wait.color}`}>{wait.text}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 mb-3">
                {order.items.map(it => {
                  const tgt = STATION_ICON[it.target_station] || STATION_ICON.emplatamiento
                  const TgtIcon = tgt.icon
                  return (
                    <div key={it.order_item_id} className="flex items-center gap-2 bg-dark-700/50 rounded-lg p-2">
                      <div className={`flex items-center gap-1 px-2 py-0.5 rounded border ${tgt.color} text-xs font-bold flex-shrink-0`}>
                        <TgtIcon size={12} /> {tgt.label}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-white font-semibold truncate">
                          {it.quantity}× {it.product_name}
                          {it.variant_name && it.variant_name !== 'Plato' && (
                            <span className="text-gray-400 text-sm"> · {it.variant_name}</span>
                          )}
                        </div>
                        {it.cooking_point !== 'none' && (
                          <div className="text-red-300 text-xs font-bold">{COOKING_LABEL[it.cooking_point]}</div>
                        )}
                        {it.notes && (
                          <div className="text-yellow-300 text-xs italic">📝 {it.notes}</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              <button
                onClick={() => complete(order.order_id)}
                className="w-full py-3 bg-green-600 hover:bg-green-700 rounded-xl text-white font-black text-lg flex items-center justify-center gap-2"
              >
                Alistado <ArrowRight size={20} /> Enviar a cocción
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
