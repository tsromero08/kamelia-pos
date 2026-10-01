import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ordersApi, productsApi } from '../../services/api'
import { Order, OrderStatus } from '../../types'
import { formatDateTime, parseServerDate } from '../../utils/format'
import toast from 'react-hot-toast'
import { Clock, ChefHat, CheckCircle, Printer, AlertTriangle, Flame, X, PackageCheck, Volume2, VolumeX } from 'lucide-react'
import { BRANDING } from '../../config/branding'

// Beep simple con Web Audio API (no requiere archivos externos)
function playBeep(freq = 880, durationMs = 250, volume = 0.25) {
  try {
    const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.value = volume
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    setTimeout(() => { osc.stop(); ctx.close() }, durationMs)
  } catch {
    /* silencio si el navegador bloquea audio antes de interacción */
  }
}

// ─── Impresión ticket de cocina ────────────────────────────────────────────
function printKitchenTicket(
  order: Order,
  variants: Record<number, { productName: string; variantName: string }>,
  options: Record<number, { name: string }>
) {
  const now = new Date().toLocaleString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
  const lines: string[] = [
    '================================',
    `     ${BRANDING.kitchenBannerText}     `,
    '================================',
    `Pedido : ${order.order_number}`,
    `Fecha  : ${now}`,
    order.table_number ? `Mesa   : ${order.table_number}` : 'Para llevar / Domicilio',
    order.notes ? `Nota   : ${order.notes}` : '',
    '--------------------------------',
    'PRODUCTOS:',
  ]
  for (const item of order.items) {
    const v = variants[item.variant_id]
    const name = v ? (v.variantName ? `${v.productName} (${v.variantName})` : v.productName) : `Producto #${item.variant_id}`
    lines.push(`  ${item.quantity}x  ${name}`)
    for (const opt of item.selected_options) {
      const o = options[opt.option_id]
      if (o) lines.push(`       -> ${o.name}`)
    }
    for (const mod of item.modifiers) {
      lines.push(`       ${mod.modifier_type === 'extra' ? '+ Extra:' : '- Sin:'} ${mod.name}`)
    }
    if (item.notes) lines.push(`       * ${item.notes}`)
  }
  lines.push('================================')

  const win = window.open('', '_blank', 'width=340,height=700')
  if (!win) return
  win.document.write(`<html><head><title>Cocina #${order.order_number}</title>
  <style>body{font-family:monospace;font-size:14px;white-space:pre;margin:8px;line-height:1.6}@media print{@page{margin:4mm}}</style>
  </head><body>${lines.filter(l => l !== '').join('\n')}</body></html>`)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); win.close() }, 300)
}

// ─── Constantes ────────────────────────────────────────────────────────────
// Tiempo estimado de entrega: 30 minutos. Después se marca el pedido como RETRASADO.
const LIMIT_SECONDS = 30 * 60  // = 1800s = 30 minutos
const LIMIT_MIN = 30           // texto visible

// ─── Utilidad: color y estado según tiempo restante ───────────────────────
function getTimerState(remaining: number) {
  if (remaining <= 0)        return { color: '#ef4444', track: '#450a0a', label: 'TIEMPO EXCEDIDO', urgent: true }
  if (remaining <= 5 * 60)   return { color: '#ef4444', track: '#450a0a', label: 'CRÍTICO',         urgent: true }
  if (remaining <= 10 * 60)  return { color: '#f97316', track: '#431407', label: 'URGENTE',         urgent: false }
  if (remaining <= 15 * 60)  return { color: '#eab308', track: '#422006', label: 'ATENCION',        urgent: false }
  return                            { color: '#22c55e', track: '#052e16', label: 'A TIEMPO',         urgent: false }
}

// ─── Anillo SVG de cuenta regresiva ───────────────────────────────────────
function CountdownRing({
  remaining,
  size = 88,
  strokeWidth = 7,
  showReady = false,
  elapsedForReady = 0,
}: {
  remaining: number
  size?: number
  strokeWidth?: number
  showReady?: boolean
  elapsedForReady?: number
}) {
  const r = (size - strokeWidth) / 2
  const circ = 2 * Math.PI * r
  const cx = size / 2

  if (showReady) {
    // Pedido entregado: anillo completo verde con check.
    // Cap visual a 99:59 para que no se vea "300:00" en pedidos viejos.
    const cap = Math.min(elapsedForReady, 99 * 60 + 59)
    const m = Math.floor(cap / 60)
    const s = cap % 60
    const wasLate = elapsedForReady > LIMIT_SECONDS
    const ringColor = wasLate ? '#f97316' : '#22c55e'
    const trackColor = wasLate ? '#431407' : '#052e16'
    const textColor = wasLate ? 'text-orange-300' : 'text-green-300'
    return (
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={cx} cy={cx} r={r} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
          <circle cx={cx} cy={cx} r={r} fill="none" stroke={ringColor} strokeWidth={strokeWidth}
            strokeDasharray={circ} strokeDashoffset={0} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <CheckCircle size={size * 0.28} className={wasLate ? 'text-orange-400' : 'text-green-400'} />
          <span className={`${textColor} font-black font-mono text-xs leading-none mt-0.5`}>
            {m}:{s.toString().padStart(2, '0')}
          </span>
        </div>
      </div>
    )
  }

  const clamped = Math.max(0, remaining)
  const progress = Math.min(1, clamped / LIMIT_SECONDS)   // 1 → 0, NUNCA >1
  const offset = circ * (1 - progress)
  const state = getTimerState(remaining)

  const overTime = remaining < 0
  // Cap a 99:59 para que el reloj nunca muestre cifras absurdas tipo "300:00"
  const capped = Math.min(99 * 60 + 59, Math.max(0, remaining))
  const m = Math.floor(capped / 60)
  const s = Math.floor(capped % 60)
  const displayStr = `${m}:${s.toString().padStart(2, '0')}`

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={state.track} strokeWidth={strokeWidth} />
        <circle
          cx={cx} cy={cx} r={r} fill="none"
          stroke={state.color} strokeWidth={strokeWidth}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0">
        {overTime ? (
          <>
            <AlertTriangle
              size={size * 0.28}
              style={{ color: state.color, animation: 'pulse 1s infinite' }}
            />
            <span className="font-black leading-none text-center" style={{ color: state.color, fontSize: size * 0.11 }}>
              RETRASADO
            </span>
          </>
        ) : (
          <>
            <span
              className="font-black font-mono leading-none"
              style={{ color: state.color, fontSize: size * 0.195 }}
            >
              {displayStr}
            </span>
            <span className="text-gray-500 leading-none" style={{ fontSize: size * 0.095 }}>
              restante
            </span>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Hook de temporizador ──────────────────────────────────────────────────
function useCountdown(order: Order) {
  const [elapsed, setElapsed] = useState(0)

  const startRef =
    order.status === 'in_preparation' && order.preparation_started_at
      ? order.preparation_started_at
      : order.created_at

  useEffect(() => {
    // CRÍTICO: parseServerDate respeta UTC. Sin esto, un servidor con
    // datetimes naive UTC se interpreta como local y se desfasa 5h en Colombia,
    // mostrando "300 min" en el contador. Ver utils/format.ts.
    const startMs = parseServerDate(startRef).getTime()
    const calc = () => setElapsed(Math.max(0, Math.floor((Date.now() - startMs) / 1000)))
    calc()
    const t = setInterval(calc, 1000)
    return () => clearInterval(t)
  }, [startRef])

  const remaining = LIMIT_SECONDS - elapsed
  const elapsedForReady = elapsed  // used when order is ready to show total time

  return {
    remaining,
    elapsed,
    elapsedForReady,
    isOvertime: remaining <= 0,
    state: getTimerState(remaining),
  }
}

// ─── Estilos por estado ────────────────────────────────────────────────────
const STATUS_STYLE: Record<string, {
  label: string; color: string; border: string; dot: string; bg: string; btnColor: string
}> = {
  pending:        { label: 'RECIBIDO',   color: 'text-yellow-300', border: 'border-yellow-500', dot: 'bg-yellow-400', bg: 'bg-yellow-900/20',  btnColor: 'bg-blue-600 hover:bg-blue-500' },
  in_preparation: { label: 'PREPARANDO', color: 'text-blue-300',   border: 'border-blue-500',   dot: 'bg-blue-400',   bg: 'bg-blue-900/20',    btnColor: 'bg-green-600 hover:bg-green-500' },
  ready:          { label: 'ENTREGADO',  color: 'text-green-300',  border: 'border-green-500',  dot: 'bg-green-400',  bg: 'bg-green-900/20',   btnColor: '' },
}

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  pending: 'in_preparation',
  in_preparation: 'ready',
}

interface VariantInfo { productName: string; variantName: string }
interface OptionInfo  { name: string }

// ─── Modal de detalle ──────────────────────────────────────────────────────
function OrderDetailModal({ order, variants, options, onClose, onStatusChange, onPrint }: {
  order: Order
  variants: Record<number, VariantInfo>
  options: Record<number, OptionInfo>
  onClose: () => void
  onStatusChange: (id: number, status: OrderStatus) => void
  onPrint: (order: Order) => void
}) {
  const { remaining, elapsed, isOvertime, state } = useCountdown(order)
  const isReady = order.status === 'ready'
  const style = STATUS_STYLE[order.status] ?? STATUS_STYLE.pending
  const next = NEXT_STATUS[order.status]

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className={`bg-dark-800 rounded-2xl border-4 ${isOvertime && !isReady ? 'border-red-500' : style.border} w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`p-6 border-b-2 border-dark-600 ${isOvertime && !isReady ? 'bg-red-900/20' : style.bg}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-gray-400 text-sm uppercase tracking-widest mb-1">Pedido</p>
              <p className="text-white font-black text-5xl tracking-wide">{order.order_number}</p>
              {order.table_number && (
                <p className="text-brand-400 font-black text-3xl mt-1">Mesa {order.table_number}</p>
              )}
              <p className={`text-xl font-black mt-2 ${style.color}`}>{style.label}</p>
              {order.notes && (
                <p className="text-yellow-300 text-lg mt-2 font-bold">★ {order.notes}</p>
              )}
              {isOvertime && !isReady && (
                <div className="flex items-center gap-2 mt-3 bg-red-900/40 border border-red-600 rounded-xl px-4 py-2 animate-pulse">
                  <AlertTriangle size={20} className="text-red-400 flex-shrink-0" />
                  <p className="text-red-300 font-black text-lg">¡PEDIDO RETRASADO! · Más de {LIMIT_MIN} min</p>
                </div>
              )}
            </div>

            <div className="flex flex-col items-end gap-3 flex-shrink-0">
              <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={24} /></button>
              <CountdownRing
                remaining={remaining}
                size={120}
                strokeWidth={10}
                showReady={isReady}
                elapsedForReady={elapsed}
              />
              <p className="text-xs text-gray-500 text-right">
                {isReady ? 'Tiempo de preparación' : 'Tiempo restante'}
              </p>
            </div>
          </div>
        </div>

        {/* Productos */}
        <div className="p-6 space-y-4">
          <p className="text-gray-400 text-xs uppercase tracking-widest font-bold">Productos</p>
          {order.items.map(item => {
            const v = variants[item.variant_id]
            return (
              <div key={item.id} className="bg-dark-700 rounded-xl p-4 border border-dark-500">
                <div className="flex items-start gap-4">
                  <div className="bg-brand-600 text-white font-black text-3xl w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0">
                    {item.quantity}
                  </div>
                  <div className="flex-1">
                    <p className="text-white font-black text-2xl leading-tight">
                      {v?.productName ?? `Producto #${item.variant_id}`}
                    </p>
                    {v?.variantName && <p className="text-brand-400 font-bold text-lg">{v.variantName}</p>}
                    {item.selected_options.map(opt => (
                      <p key={opt.id} className="text-purple-300 text-base font-semibold mt-1">
                        → {options[opt.option_id]?.name ?? `Opción #${opt.option_id}`}
                      </p>
                    ))}
                    {item.modifiers.map((m, i) => (
                      <p key={i} className={`text-lg font-bold mt-1 ${m.modifier_type === 'extra' ? 'text-green-400' : 'text-red-400'}`}>
                        {m.modifier_type === 'extra' ? '+ Extra:' : '- Sin:'} {m.name}
                      </p>
                    ))}
                    {item.notes && (
                      <p className="text-yellow-300 text-lg font-bold mt-2 bg-yellow-900/20 rounded-lg px-3 py-1.5">
                        ★ {item.notes}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Acciones */}
        <div className="p-6 pt-0 flex gap-3">
          <button
            onClick={() => { onPrint(order); onClose() }}
            className="flex items-center gap-2 px-5 py-3 rounded-xl bg-dark-600 hover:bg-dark-500 text-gray-300 hover:text-white font-semibold transition-colors border border-dark-500"
          >
            <Printer size={18} /> Imprimir
          </button>
          {next && (
            <button
              onClick={() => { onStatusChange(order.id, next); onClose() }}
              className={`flex-1 py-4 rounded-xl font-black text-xl flex items-center justify-center gap-2 transition-colors active:scale-95 ${style.btnColor} text-white`}
            >
              {next === 'in_preparation'
                ? <><ChefHat size={24} /> Iniciar preparación</>
                : <><PackageCheck size={24} /> Marcar como entregado</>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Tarjeta de pedido ─────────────────────────────────────────────────────
function OrderCard({ order, variants, options, onStatusChange, onPrint, onExpand }: {
  order: Order
  variants: Record<number, VariantInfo>
  options: Record<number, OptionInfo>
  onStatusChange: (id: number, status: OrderStatus) => void
  onPrint: (order: Order) => void
  onExpand: (order: Order) => void
}) {
  const { remaining, elapsed, isOvertime, state } = useCountdown(order)
  const isReady = order.status === 'ready'
  const style = STATUS_STYLE[order.status] ?? STATUS_STYLE.pending
  const next = NEXT_STATUS[order.status]

  const borderColor = isReady ? 'border-green-500' : isOvertime ? 'border-red-500' : style.border
  const headerBg   = isReady ? 'bg-green-900/20'  : isOvertime ? 'bg-red-900/30'   : style.bg

  return (
    <div className={`bg-dark-800 border-4 ${borderColor} rounded-2xl flex flex-col overflow-hidden shadow-xl`}>

      {/* Header */}
      <div className={`px-4 py-3 flex items-start justify-between gap-3 ${headerBg}`}>
        {/* Info pedido */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${style.dot} ${!isReady ? 'animate-pulse' : ''}`} />
            <span className={`text-xs uppercase tracking-widest font-black ${style.color}`}>{style.label}</span>
            {isOvertime && !isReady && (
              <span className="flex items-center gap-0.5 text-red-400 text-xs font-black animate-bounce ml-1 bg-red-900/40 border border-red-700 rounded px-1.5 py-0.5">
                <AlertTriangle size={11} /> RETRASADO
              </span>
            )}
          </div>
          <p className="text-white font-black text-2xl leading-none">{order.order_number}</p>
          {order.table_number && (
            <p className="text-brand-400 font-black text-xl mt-0.5">Mesa {order.table_number}</p>
          )}
          <p className="text-gray-600 text-xs mt-1">{formatDateTime(order.created_at)}</p>
        </div>

        {/* Anillo cronómetro */}
        <CountdownRing
          remaining={remaining}
          size={80}
          strokeWidth={7}
          showReady={isReady}
          elapsedForReady={elapsed}
        />
      </div>

      {/* Estado del tiempo — barra de progreso lineal */}
      {!isReady && (
        <div className="px-4 pt-1 pb-0">
          <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: state.track }}>
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{
                width: `${Math.max(0, Math.min(100, (Math.max(0, remaining) / LIMIT_SECONDS) * 100))}%`,
                backgroundColor: state.color,
              }}
            />
          </div>
        </div>
      )}

      {/* Nota general */}
      {order.notes && (
        <div className="px-4 py-2 bg-yellow-900/20 border-y border-yellow-800">
          <p className="text-yellow-300 font-bold text-sm">★ {order.notes}</p>
        </div>
      )}

      {/* Items */}
      <div className="flex-1 px-4 py-3 space-y-2.5">
        {order.items.map(item => {
          const v = variants[item.variant_id]
          return (
            <div key={item.id} className="flex items-start gap-3">
              <div className="bg-brand-700 text-white font-black text-xl w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0">
                {item.quantity}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-black text-lg leading-tight">
                  {v?.productName ?? `Producto #${item.variant_id}`}
                </p>
                {v?.variantName && (
                  <p className="text-brand-300 font-semibold text-sm">{v.variantName}</p>
                )}
                {item.selected_options.map(opt => (
                  <p key={opt.id} className="text-purple-300 text-xs font-semibold">
                    → {options[opt.option_id]?.name ?? `Opción #${opt.option_id}`}
                  </p>
                ))}
                {item.modifiers.map((m, i) => (
                  <p key={i} className={`text-sm font-bold ${m.modifier_type === 'extra' ? 'text-green-400' : 'text-red-400'}`}>
                    {m.modifier_type === 'extra' ? '+ Extra:' : '- Sin:'} {m.name}
                  </p>
                ))}
                {item.notes && (
                  <p className="text-yellow-300 text-sm font-bold mt-1 bg-yellow-900/20 rounded px-2 py-0.5">
                    ★ {item.notes}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Botones */}
      <div className="px-4 pb-4 pt-2 border-t border-dark-600 space-y-2">
        <div className="flex gap-2">
          <button
            onClick={() => onExpand(order)}
            className="flex-1 py-2.5 rounded-xl bg-dark-600 hover:bg-dark-500 text-gray-300 hover:text-white font-semibold text-sm transition-colors border border-dark-500 flex items-center justify-center gap-1.5"
          >
            <Flame size={14} /> Ver detalle
          </button>
          <button
            onClick={() => onPrint(order)}
            className="px-3 py-2.5 rounded-xl bg-dark-600 hover:bg-dark-500 text-gray-400 hover:text-white transition-colors border border-dark-500"
            title="Imprimir ticket"
          >
            <Printer size={15} />
          </button>
        </div>

        {next && (
          <button
            onClick={() => onStatusChange(order.id, next)}
            className={`w-full py-4 rounded-xl font-black text-lg flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg ${style.btnColor} text-white`}
          >
            {next === 'in_preparation'
              ? <><ChefHat size={20} /> Iniciar preparación</>
              : <><PackageCheck size={20} /> Marcar entregado</>}
          </button>
        )}

        {isReady && (
          <div className="flex items-center justify-center gap-2 py-2 text-green-400 font-bold text-sm">
            <CheckCircle size={16} />
            Entregado en {Math.floor(elapsed / 60)}:{(elapsed % 60).toString().padStart(2, '0')}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Componente principal ──────────────────────────────────────────────────
type KitchenTab = 'active' | 'delivered'

export default function Kitchen() {
  const queryClient = useQueryClient()
  const [variantMap, setVariantMap] = useState<Record<number, VariantInfo>>({})
  const [optionMap,  setOptionMap]  = useState<Record<number, OptionInfo>>({})
  const [expandedOrder, setExpandedOrder] = useState<Order | null>(null)
  const [activeTab, setActiveTab] = useState<KitchenTab>('active')
  const knownOrderIds = useRef<Set<number>>(new Set())
  const alertedIds    = useRef<Set<number>>(new Set())
  const warnedIds     = useRef<Set<number>>(new Set())  // amarillo (15 min)
  const urgentIds     = useRef<Set<number>>(new Set())  // naranja (10 min)
  const wsRef = useRef<WebSocket | null>(null)
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('kitchenSound') !== 'off')

  const toggleSound = () => {
    setSoundOn(v => {
      const nv = !v
      localStorage.setItem('kitchenSound', nv ? 'on' : 'off')
      if (nv) playBeep(700, 120, 0.3)
      return nv
    })
  }

  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ['kitchen-orders'],
    queryFn: () => ordersApi.kitchen().then(r => r.data),
    refetchInterval: 2000,        // poll cada 2s (respaldo si falla WS)
    refetchOnWindowFocus: true,
    retry: 3,
    retryDelay: 1000,
  })

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => productsApi.list().then(r => r.data),
    staleTime: 60000,
  })

  // Construir mapas de variantes y opciones
  useEffect(() => {
    const vMap: Record<number, VariantInfo> = {}
    const oMap: Record<number, OptionInfo>  = {}
    products.forEach((p: { name: string; variants: { id: number; name: string }[]; option_groups: { options: { id: number; name: string }[] }[] }) => {
      p.variants.forEach(v => { vMap[v.id] = { productName: p.name, variantName: v.name === 'Única' ? '' : v.name } })
      p.option_groups.forEach(g => { g.options.forEach(o => { oMap[o.id] = { name: o.name } }) })
    })
    setVariantMap(vMap)
    setOptionMap(oMap)
  }, [products])

  // Notificación de pedidos nuevos + auto-impresión + beep
  useEffect(() => {
    if (!orders.length || !Object.keys(variantMap).length) return
    const newOrders = orders.filter(o => !knownOrderIds.current.has(o.id))
    if (newOrders.length > 0 && knownOrderIds.current.size > 0) {
      newOrders.forEach(o => {
        toast.success(
          `Nuevo pedido: ${o.order_number}${o.table_number ? ` — Mesa ${o.table_number}` : ''}`,
          { duration: 6000, icon: '🔔' }
        )
        if (soundOn) playBeep(880, 220, 0.3)
        printKitchenTicket(o, variantMap, optionMap)
      })
    }
    orders.forEach(o => knownOrderIds.current.add(o.id))
  }, [orders, variantMap, optionMap, soundOn])

  // Alertas escalonadas: amarillo (15min restante), naranja (10min), rojo (0 - retrasado)
  useEffect(() => {
    if (!orders.length) return
    const interval = setInterval(() => {
      orders.forEach(o => {
        if (o.status === 'ready') return
        const startRef = o.status === 'in_preparation' && o.preparation_started_at
          ? o.preparation_started_at : o.created_at
        const elapsedSec = Math.max(0, Math.floor((Date.now() - parseServerDate(startRef).getTime()) / 1000))
        const remaining  = LIMIT_SECONDS - elapsedSec

        // Aviso amarillo (≤15 min restantes)
        if (remaining <= 15 * 60 && remaining > 10 * 60 && !warnedIds.current.has(o.id)) {
          warnedIds.current.add(o.id)
          toast(
            `⏳ ${o.order_number}${o.table_number ? ` (Mesa ${o.table_number})` : ''} — quedan ${Math.ceil(remaining/60)} min`,
            { duration: 6000, icon: '🟡' }
          )
          if (soundOn) playBeep(660, 150, 0.25)
        }
        // Aviso naranja (≤10 min restantes)
        if (remaining <= 10 * 60 && remaining > 0 && !urgentIds.current.has(o.id)) {
          urgentIds.current.add(o.id)
          toast(
            `🟠 URGENTE: ${o.order_number}${o.table_number ? ` (Mesa ${o.table_number})` : ''} — ${Math.ceil(remaining/60)} min`,
            { duration: 10000, icon: '🟠' }
          )
          if (soundOn) { playBeep(540, 180, 0.3); setTimeout(() => playBeep(540, 180, 0.3), 250) }
        }
        // Alerta de RETRASADO: cuando el cronómetro de 30 min llega a 0
        if (remaining <= 0 && remaining > -30 && !alertedIds.current.has(o.id)) {
          alertedIds.current.add(o.id)
          toast.error(
            `⚠ PEDIDO RETRASADO: ${o.order_number}${o.table_number ? ` (Mesa ${o.table_number})` : ''} — superó los ${LIMIT_MIN} minutos`,
            { duration: 20000, icon: '🚨' }
          )
          if (soundOn) {
            playBeep(400, 250, 0.4)
            setTimeout(() => playBeep(400, 250, 0.4), 350)
            setTimeout(() => playBeep(400, 250, 0.4), 700)
          }
        }
      })
    }, 5000)
    return () => clearInterval(interval)
  }, [orders, soundOn])

  // WebSocket en tiempo real: cocina se actualiza inmediatamente al crear/cambiar pedidos
  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout>
    let heartbeat: ReturnType<typeof setInterval>

    const connect = () => {
      try {
        const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
        const ws = new WebSocket(`${proto}://${window.location.host}/ws/kitchen`)
        wsRef.current = ws

        ws.onopen = () => {
          // Heartbeat cada 25s para mantener viva la conexión
          heartbeat = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) ws.send('ping')
          }, 25000)
        }

        ws.onmessage = () => {
          // Cualquier evento del backend invalida y refresca la cocina al instante
          queryClient.invalidateQueries({ queryKey: ['kitchen-orders'] })
          queryClient.invalidateQueries({ queryKey: ['tables-status'] })
        }

        ws.onclose = () => {
          if (heartbeat) clearInterval(heartbeat)
          reconnectTimer = setTimeout(connect, 2000)
        }

        ws.onerror = () => ws.close()
      } catch {
        reconnectTimer = setTimeout(connect, 3000)
      }
    }
    connect()
    return () => {
      clearTimeout(reconnectTimer)
      if (heartbeat) clearInterval(heartbeat)
      wsRef.current?.close()
    }
  }, [queryClient])

  const handleStatusChange = useCallback(async (orderId: number, status: OrderStatus) => {
    try {
      await ordersApi.updateStatus(orderId, { status })
      queryClient.invalidateQueries({ queryKey: ['kitchen-orders'] })
      queryClient.invalidateQueries({ queryKey: ['caja-orders'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      if (status === 'in_preparation') toast.success('Preparando pedido...', { icon: '🔥' })
      else if (status === 'ready')      toast.success('Pedido entregado!',    { icon: '✅' })
    } catch {
      toast.error('Error al actualizar estado — verifica tu conexión')
    }
  }, [queryClient])

  const handlePrint = useCallback((order: Order) => {
    printKitchenTicket(order, variantMap, optionMap)
  }, [variantMap, optionMap])

  const pending = orders.filter(o => o.status === 'pending')
  const inPrep  = orders.filter(o => o.status === 'in_preparation')
  const ready   = orders.filter(o => o.status === 'ready')

  return (
    <div className="min-h-screen bg-dark-900">
      {/* Header fijo */}
      <div className="sticky top-0 z-40 bg-dark-900/95 backdrop-blur border-b border-dark-700 px-4 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <ChefHat size={28} className="text-brand-400" />
            <h1 className="text-2xl font-black text-white">Cocina</h1>
          </div>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <button
              onClick={toggleSound}
              title={soundOn ? 'Silenciar alertas' : 'Activar alertas sonoras'}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-sm font-bold border-2 transition-all ${
                soundOn
                  ? 'bg-brand-700/40 text-brand-200 border-brand-500'
                  : 'bg-dark-700 text-gray-500 border-dark-500 hover:text-white'
              }`}
            >
              {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
              <span className="hidden sm:inline">{soundOn ? 'Sonido ON' : 'Sonido OFF'}</span>
            </button>
            <span className="bg-yellow-900/50 text-yellow-300 border-2 border-yellow-600 px-3 py-1.5 rounded-xl text-base font-black">
              📥 {pending.length} recibido{pending.length !== 1 ? 's' : ''}
            </span>
            <span className="bg-blue-900/50 text-blue-300 border-2 border-blue-600 px-3 py-1.5 rounded-xl text-base font-black">
              🔥 {inPrep.length} preparando
            </span>
            <span className="bg-green-900/50 text-green-300 border-2 border-green-600 px-3 py-1.5 rounded-xl text-base font-black">
              ✅ {ready.length} entregado{ready.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Tabs: Activos vs Entregados */}
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => setActiveTab('active')}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-sm font-black uppercase tracking-wide transition-all ${
              activeTab === 'active'
                ? 'bg-brand-600 text-white shadow-lg shadow-brand-900/40'
                : 'bg-dark-800 text-gray-400 hover:text-white border border-dark-600'
            }`}
          >
            🍳 Activos ({pending.length + inPrep.length})
          </button>
          <button
            onClick={() => setActiveTab('delivered')}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-sm font-black uppercase tracking-wide transition-all ${
              activeTab === 'delivered'
                ? 'bg-green-700 text-white shadow-lg shadow-green-900/40'
                : 'bg-dark-800 text-gray-400 hover:text-white border border-dark-600'
            }`}
          >
            ✅ Entregados ({ready.length})
          </button>
        </div>
      </div>

      {/* Contenido */}
      <div className="p-4">
        {isLoading && (
          <div className="text-center py-20 text-gray-400 text-xl">Cargando pedidos...</div>
        )}

        {/* ── Tab ACTIVOS: solo muestra Recibidos + En preparación ──── */}
        {activeTab === 'active' && (
          <>
            {!isLoading && pending.length === 0 && inPrep.length === 0 && (
              <div className="text-center py-32">
                <ChefHat size={72} className="text-gray-700 mx-auto mb-4" />
                <p className="text-gray-400 text-3xl font-bold">Sin pedidos activos</p>
                <p className="text-gray-600 text-lg mt-2">Los pedidos aparecerán aquí en tiempo real</p>
              </div>
            )}

            {/* Recibidos */}
            {pending.length > 0 && (
              <div className="mb-8">
                <h2 className="text-yellow-300 font-black text-lg mb-3 flex items-center gap-2">
                  <Clock size={18} /> Recibidos — esperando inicio ({pending.length})
                </h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                  {pending.map(order => (
                    <OrderCard key={order.id} order={order} variants={variantMap} options={optionMap}
                      onStatusChange={handleStatusChange} onPrint={handlePrint} onExpand={setExpandedOrder} />
                  ))}
                </div>
              </div>
            )}

            {/* En preparación */}
            {inPrep.length > 0 && (
              <div className="mb-8">
                <h2 className="text-blue-300 font-black text-lg mb-3 flex items-center gap-2">
                  <Flame size={18} /> En preparación ({inPrep.length})
                </h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                  {inPrep.map(order => (
                    <OrderCard key={order.id} order={order} variants={variantMap} options={optionMap}
                      onStatusChange={handleStatusChange} onPrint={handlePrint} onExpand={setExpandedOrder} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Tab ENTREGADOS: pantalla separada ─────────────────────── */}
        {activeTab === 'delivered' && (
          <>
            {!isLoading && ready.length === 0 && (
              <div className="text-center py-32">
                <PackageCheck size={72} className="text-gray-700 mx-auto mb-4" />
                <p className="text-gray-400 text-3xl font-bold">Sin pedidos entregados</p>
                <p className="text-gray-600 text-lg mt-2">Aún no has entregado pedidos en este turno</p>
              </div>
            )}
            {ready.length > 0 && (
              <div className="mb-8">
                <h2 className="text-green-300 font-black text-lg mb-3 flex items-center gap-2">
                  <CheckCircle size={18} /> Entregados ({ready.length})
                </h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                  {ready.map(order => (
                    <OrderCard key={order.id} order={order} variants={variantMap} options={optionMap}
                      onStatusChange={handleStatusChange} onPrint={handlePrint} onExpand={setExpandedOrder} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal de detalle */}
      {expandedOrder && (
        <OrderDetailModal
          order={expandedOrder}
          variants={variantMap}
          options={optionMap}
          onClose={() => setExpandedOrder(null)}
          onStatusChange={handleStatusChange}
          onPrint={handlePrint}
        />
      )}
    </div>
  )
}
