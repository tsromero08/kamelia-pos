/**
 * Pantalla de TOTALES — usada por parrilla, sudados, fritos y emplatamiento.
 * Muestra producto / variante / punto de cocción / cantidad pendiente,
 * con tiempos estimados de salida y alertas de retraso.
 */
import { useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { kitchenApi } from '../../services/api'
import { StationTotals, COOKING_LABEL } from '../../types/kitchen'
import { useChannelWS } from '../../hooks/useChannelWS'
import { Flame, Clock, AlertTriangle, ChefHat, Coffee } from 'lucide-react'
import { useState, useEffect } from 'react'

const META: Record<string, { icon: React.ElementType; title: string; color: string }> = {
  parrilla: { icon: Flame, title: 'PARRILLA', color: 'text-red-400' },
  sudados:  { icon: Coffee, title: 'SUDADOS', color: 'text-amber-400' },
  fritos:   { icon: Flame, title: 'FRITOS', color: 'text-yellow-400' },
  emplatamiento: { icon: ChefHat, title: 'EMPLATAMIENTO', color: 'text-brand-400' },
}

function dueColor(dueAt?: string): string {
  if (!dueAt) return 'text-gray-400'
  const due = new Date(dueAt).getTime()
  const now = Date.now()
  const diffMin = (due - now) / 60000
  if (diffMin < 0) return 'text-red-500 animate-pulse font-black'
  if (diffMin < 5) return 'text-orange-400 font-bold'
  if (diffMin < 10) return 'text-yellow-400 font-bold'
  return 'text-green-400'
}

function fmtDue(dueAt?: string): string {
  if (!dueAt) return '—'
  return new Date(dueAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}

export default function TotalsScreen() {
  const loc = useLocation()
  const sk = loc.pathname.split('/').pop() || 'parrilla'
  const meta = META[sk] || META.parrilla
  const Icon = meta.icon
  const qc = useQueryClient()
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 2000)
    return () => clearInterval(t)
  }, [])

  const { data: totals } = useQuery<StationTotals>({
    queryKey: ['station-totals', sk, tick],
    queryFn: () => kitchenApi.totals(sk).then(r => r.data),
    refetchInterval: 4000,
  })

  useChannelWS(`/ws/station/${sk}`, () => {
    qc.invalidateQueries({ queryKey: ['station-totals', sk] })
  })

  const rows = totals?.rows || []
  // Ordenar: primero los más urgentes
  const sorted = [...rows].sort((a, b) => {
    const da = a.earliest_due_at ? new Date(a.earliest_due_at).getTime() : Infinity
    const db = b.earliest_due_at ? new Date(b.earliest_due_at).getTime() : Infinity
    return da - db
  })

  return (
    <div className="p-4 md:p-6 space-y-4 min-h-screen bg-dark-900">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Icon size={48} className={meta.color} />
          <div>
            <h1 className="text-4xl font-black text-white tracking-wider">{meta.title}</h1>
            <p className="text-gray-400">
              {totals?.orders_in_queue || 0} pedidos en cola · {totals?.orders_in_prep || 0} en preparación
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-brand-400 font-mono">
            {new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
        </div>
      </div>

      {sorted.length === 0 && (
        <div className="text-center py-20 text-gray-500">
          <ChefHat size={80} className="mx-auto mb-3 opacity-30" />
          <p className="text-2xl">Sin nada por sacar</p>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-dark-700">
        <table className="w-full">
          <thead className="bg-dark-800 text-gray-400 text-sm uppercase tracking-wider">
            <tr>
              <th className="text-left p-3">Producto</th>
              <th className="text-center p-3">Punto</th>
              <th className="text-center p-3">Pendiente</th>
              <th className="text-center p-3">En prep</th>
              <th className="text-center p-3 text-lg">TOTAL</th>
              <th className="text-center p-3">Salida</th>
              {sk === 'emplatamiento' && <th className="text-center p-3">Estación</th>}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={i} className="border-t border-dark-700 hover:bg-dark-800/50">
                <td className="p-3">
                  <div className="text-white font-bold text-lg">{r.product_name}</div>
                  {r.variant_name && r.variant_name !== 'Plato' && (
                    <div className="text-gray-400 text-sm">{r.variant_name}</div>
                  )}
                </td>
                <td className="text-center p-3">
                  {r.cooking_point !== 'none' ? (
                    <span className="inline-block px-2 py-1 bg-red-900/50 border border-red-700 rounded text-red-300 font-bold">
                      {COOKING_LABEL[r.cooking_point]}
                    </span>
                  ) : (
                    <span className="text-gray-600">—</span>
                  )}
                </td>
                <td className="text-center p-3 text-yellow-400 font-bold text-xl">{r.pending_qty}</td>
                <td className="text-center p-3 text-blue-400 font-bold text-xl">{r.in_prep_qty}</td>
                <td className="text-center p-3 text-white font-black text-3xl">{r.total_qty}</td>
                <td className={`text-center p-3 font-mono ${dueColor(r.earliest_due_at)}`}>
                  {fmtDue(r.earliest_due_at)}
                  {r.longest_wait_seconds > 300 && (
                    <AlertTriangle size={14} className="inline ml-1 text-red-500" />
                  )}
                </td>
                {sk === 'emplatamiento' && (
                  <td className="text-center p-3">
                    <span className="px-2 py-1 bg-dark-700 rounded text-xs font-bold text-gray-300 uppercase">
                      {r.source_station}
                    </span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
