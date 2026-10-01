/**
 * Pantalla universal de estación de cocina.
 * Usada para: entradas, sopas, barra (pedidos uno por uno).
 *
 * Para parrilla/sudados/fritos/emplatamiento → ver TotalsScreen.
 * Para neveras → ver NeverasScreen.
 */
import { useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { kitchenApi } from '../../services/api'
import { StationItem, StationKey, COOKING_LABEL } from '../../types/kitchen'
import { useChannelWS } from '../../hooks/useChannelWS'
import { Flame, Clock, CheckCircle, PlayCircle, Coffee, Soup, GlassWater, Snowflake } from 'lucide-react'
import { useState, useEffect } from 'react'

const STATION_META: Record<string, { icon: React.ElementType; title: string; color: string }> = {
  entradas: { icon: Flame, title: 'Entradas', color: 'text-lime-400' },
  sopas:    { icon: Soup, title: 'Sopas', color: 'text-purple-400' },
  barra:    { icon: GlassWater, title: 'Barra / Bebidas', color: 'text-cyan-400' },
  parrilla: { icon: Flame, title: 'Parrilla', color: 'text-red-400' },
  sudados:  { icon: Coffee, title: 'Sudados', color: 'text-amber-400' },
  fritos:   { icon: Flame, title: 'Fritos', color: 'text-yellow-400' },
  neveras:  { icon: Snowflake, title: 'Neveras', color: 'text-sky-400' },
  emplatamiento: { icon: CheckCircle, title: 'Emplatamiento', color: 'text-brand-400' },
}

function fmtWait(seconds: number): { text: string; color: string } {
  const min = Math.floor(seconds / 60)
  const sec = seconds % 60
  let color = 'text-gray-300'
  if (min >= 30) color = 'text-red-500 animate-pulse'
  else if (min >= 20) color = 'text-orange-400'
  else if (min >= 10) color = 'text-yellow-400'
  return { text: `${min}:${sec.toString().padStart(2, '0')}`, color }
}

export default function StationScreen() {
  const loc = useLocation()
  const sk = (loc.pathname.split('/').pop() || 'entradas') as StationKey
  const qc = useQueryClient()
  const meta = STATION_META[sk] || STATION_META.entradas
  const Icon = meta.icon

  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const { data: items = [] } = useQuery<StationItem[]>({
    queryKey: ['station-items', sk, tick],
    queryFn: () => kitchenApi.items(sk).then(r => r.data),
    refetchInterval: 8000,
  })

  useChannelWS(`/ws/station/${sk}`, () => {
    qc.invalidateQueries({ queryKey: ['station-items', sk] })
    qc.invalidateQueries({ queryKey: ['station-totals', sk] })
  })

  const markInPrep = async (id: number) => {
    await kitchenApi.itemInPrep(id)
    qc.invalidateQueries({ queryKey: ['station-items', sk] })
  }
  const markReady = async (id: number) => {
    await kitchenApi.itemReady(id)
    qc.invalidateQueries({ queryKey: ['station-items', sk] })
  }

  const queued = items.filter(i => i.status === 'queued')
  const inPrep = items.filter(i => i.status === 'in_prep')

  return (
    <div className="p-4 md:p-6 space-y-4 min-h-screen bg-dark-900">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Icon size={36} className={meta.color} />
          <div>
            <h1 className="text-3xl font-black text-white">{meta.title}</h1>
            <p className="text-gray-400 text-sm">
              {queued.length} pendientes · {inPrep.length} en preparación
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-500">Hora actual</div>
          <div className="text-2xl font-bold text-brand-400 font-mono">
            {new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
        </div>
      </div>

      {items.length === 0 && (
        <div className="text-center py-20 text-gray-500">
          <CheckCircle size={64} className="mx-auto mb-3 opacity-30" />
          <p className="text-xl">Sin pedidos en cola</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map(item => {
          const wait = fmtWait(item.waiting_seconds)
          const isInPrep = item.status === 'in_prep'
          return (
            <div
              key={item.item_station_id}
              className={`rounded-2xl border-2 p-4 ${
                isInPrep
                  ? 'bg-blue-950/40 border-blue-600'
                  : 'bg-dark-800 border-dark-600'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="font-mono text-xs text-gray-500">#{item.order_number}</div>
                  {item.table_number && (
                    <div className="text-brand-400 font-bold">Mesa {item.table_number}</div>
                  )}
                </div>
                <div className="text-right">
                  <Clock size={14} className="inline mr-1 text-gray-500" />
                  <span className={`font-mono font-bold ${wait.color}`}>{wait.text}</span>
                </div>
              </div>
              <div className="text-white font-bold text-lg leading-tight">
                {item.quantity}× {item.product_name}
              </div>
              <div className="text-sm text-gray-400">{item.variant_name}</div>
              {item.cooking_point !== 'none' && (
                <div className="mt-1 inline-block px-2 py-0.5 bg-red-900/50 border border-red-700 rounded text-red-300 text-xs font-bold">
                  {COOKING_LABEL[item.cooking_point]}
                </div>
              )}
              {item.notes && (
                <div className="mt-2 text-xs italic text-yellow-300 bg-yellow-950/30 p-1.5 rounded">
                  📝 {item.notes}
                </div>
              )}
              <div className="mt-3 flex gap-2">
                {!isInPrep && (
                  <button
                    onClick={() => markInPrep(item.item_station_id)}
                    className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-bold text-sm flex items-center justify-center gap-1"
                  >
                    <PlayCircle size={16} /> En preparación
                  </button>
                )}
                <button
                  onClick={() => markReady(item.item_station_id)}
                  className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-white font-bold text-sm flex items-center justify-center gap-1"
                >
                  <CheckCircle size={16} /> Listo
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
