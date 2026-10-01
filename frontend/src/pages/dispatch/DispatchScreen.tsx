/**
 * Pantalla de DESPACHO — universal para principal/entradas/sopas/bebidas.
 * El despachador ve su pedido asignado (lock automático).
 * Al marcar "Enviado", el sistema le asigna el siguiente FIFO de la cola.
 */
import { useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { dispatchApi } from '../../services/api'
import { DispatchAssignment, COOKING_LABEL } from '../../types/kitchen'
import { useChannelWS } from '../../hooks/useChannelWS'
import { Truck, CheckCircle, Clock, AlertTriangle, Package } from 'lucide-react'
import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'

const QUEUE_META: Record<string, { title: string; color: string }> = {
  principal: { title: 'Despacho · Principales', color: 'text-brand-400' },
  entradas:  { title: 'Despacho · Entradas',    color: 'text-lime-400' },
  sopas:     { title: 'Despacho · Sopas',       color: 'text-purple-400' },
  bebidas:   { title: 'Despacho · Bebidas',     color: 'text-cyan-400' },
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

export default function DispatchScreen() {
  const loc = useLocation()
  const qt = loc.pathname.split('/').pop() || 'principal'
  const meta = QUEUE_META[qt] || QUEUE_META.principal
  const qc = useQueryClient()

  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const { data: assignment } = useQuery<DispatchAssignment>({
    queryKey: ['dispatch-mine', qt],
    queryFn: () => dispatchApi.myAssignment(qt).then(r => r.data),
    refetchInterval: 6000,
  })

  const { data: queue = [] } = useQuery<Array<{ queue_id: number; order_number: string; table_number?: string; status: string; waiting_seconds: number }>>({
    queryKey: ['dispatch-queue', qt, tick],
    queryFn: () => dispatchApi.list(qt).then(r => r.data),
    refetchInterval: 5000,
  })

  useChannelWS(`/ws/dispatch/${qt}`, () => {
    qc.invalidateQueries({ queryKey: ['dispatch-mine', qt] })
    qc.invalidateQueries({ queryKey: ['dispatch-queue', qt] })
  })

  const send = async () => {
    if (!assignment?.queue_id) return
    if (!confirm(`¿Marcar pedido #${assignment.order_number} como ENVIADO?`)) return
    try {
      await dispatchApi.send(assignment.queue_id)
      toast.success(`Pedido #${assignment.order_number} enviado`)
      qc.invalidateQueries({ queryKey: ['dispatch-mine', qt] })
      qc.invalidateQueries({ queryKey: ['dispatch-queue', qt] })
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Error al enviar')
    }
  }

  const hasAssignment = assignment && assignment.queue_id
  const myWait = assignment?.waiting_seconds || 0
  const wait = fmtWait(myWait)

  // Posición en cola
  const myPos = queue.findIndex(q => q.queue_id === assignment?.queue_id) + 1
  const totalInQueue = queue.length

  return (
    <div className="p-4 md:p-6 space-y-4 min-h-screen bg-dark-900">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Truck size={48} className={meta.color} />
          <div>
            <h1 className="text-4xl font-black text-white">{meta.title}</h1>
            <p className="text-gray-400">
              Total en cola: <span className="text-white font-bold">{totalInQueue}</span>
              {hasAssignment && <span> · vas en el <span className="text-brand-400 font-bold">#{myPos}</span></span>}
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-brand-400 font-mono">
            {new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
        </div>
      </div>

      {!hasAssignment && (
        <div className="text-center py-20 text-gray-500">
          <CheckCircle size={80} className="mx-auto mb-3 opacity-30" />
          <p className="text-2xl">Cola vacía. Esperando pedidos…</p>
        </div>
      )}

      {hasAssignment && (
        <div className="rounded-3xl border-4 border-brand-500 bg-gradient-to-br from-brand-950/50 to-dark-800 p-6 shadow-2xl shadow-brand-900/40">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="inline-block px-3 py-1 bg-brand-600 text-white text-sm font-bold rounded-full mb-2">
                TU PEDIDO ASIGNADO
              </div>
              <div className="text-gray-400 font-mono text-sm">#{assignment.order_number}</div>
              {assignment.table_number && (
                <div className="text-5xl font-black text-brand-300">Mesa {assignment.table_number}</div>
              )}
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-400">Esperando entrega</div>
              <div className="flex items-center gap-2 justify-end">
                <Clock size={20} className="text-gray-400" />
                <span className={`font-mono font-black text-3xl ${wait.color}`}>{wait.text}</span>
              </div>
            </div>
          </div>

          <div className="space-y-2 mb-5">
            {assignment.items?.map(it => (
              <div key={it.order_item_id} className="flex items-center gap-3 bg-dark-900/50 rounded-xl p-3">
                <Package size={20} className="text-brand-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-white font-bold text-lg">
                    {it.quantity}× {it.product_name}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {it.variant_name && it.variant_name !== 'Plato' && (
                      <span className="text-gray-400 text-sm">{it.variant_name}</span>
                    )}
                    {it.cooking_point !== 'none' && (
                      <span className="px-2 py-0.5 bg-red-900/50 border border-red-700 rounded text-red-300 text-xs font-bold">
                        {COOKING_LABEL[it.cooking_point]}
                      </span>
                    )}
                    <span className="px-2 py-0.5 bg-dark-700 rounded text-xs font-bold text-gray-300 uppercase">
                      {it.kitchen_section}
                    </span>
                  </div>
                  {it.notes && (
                    <div className="mt-1 text-yellow-300 text-xs italic">📝 {it.notes}</div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={send}
            className="w-full py-4 bg-green-600 hover:bg-green-700 rounded-2xl text-white font-black text-2xl flex items-center justify-center gap-3 shadow-lg shadow-green-900/40"
          >
            <CheckCircle size={28} /> ENVIADO A MESA
          </button>
        </div>
      )}

      {totalInQueue > 1 && (
        <div className="bg-dark-800 rounded-2xl p-4">
          <h3 className="text-gray-400 text-sm uppercase tracking-wider mb-3">Cola completa</h3>
          <div className="space-y-1.5">
            {queue.map((q, i) => (
              <div
                key={q.queue_id}
                className={`flex items-center gap-3 p-2 rounded-lg ${
                  q.queue_id === assignment?.queue_id
                    ? 'bg-brand-900/40 border border-brand-700'
                    : 'bg-dark-900'
                }`}
              >
                <span className="text-gray-500 font-mono text-sm w-8">#{i + 1}</span>
                <span className="text-gray-400 font-mono text-sm flex-1">{q.order_number}</span>
                {q.table_number && (
                  <span className="text-white font-bold">Mesa {q.table_number}</span>
                )}
                <span className={`font-mono text-sm ${fmtWait(q.waiting_seconds).color}`}>
                  {fmtWait(q.waiting_seconds).text}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded font-bold uppercase ${
                  q.status === 'assigned' ? 'bg-blue-900 text-blue-300' : 'bg-gray-800 text-gray-400'
                }`}>{q.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
