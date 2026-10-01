import React, { useState, Fragment } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { reportsApi, downloadBlob } from '../../services/api'
import { formatCurrency, formatDate } from '../../utils/format'
import { CalendarCheck, TrendingUp, TrendingDown, DollarSign, ShoppingCart, Lock, ChevronDown, ChevronUp, AlertCircle, Banknote, CreditCard, ArrowRightLeft, FileDown, FileSpreadsheet } from 'lucide-react'
import toast from 'react-hot-toast'
import SpecialCodeModal from '../../components/SpecialCodeModal'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend
} from 'recharts'

const n = (v: unknown) => Number(v) || 0

interface DaySummary {
  id: number
  summary_date: string
  total_sales: number
  total_orders: number
  avg_ticket: number
  estimated_cogs: number
  total_purchases: number
  total_expenses: number
  total_losses: number
  gross_profit: number
  net_profit: number
  gross_margin_pct: number
  net_margin_pct: number
  notes?: string
  payment_methods?: Record<string, number> | null
  products_sold?: { name: string; qty: number; total: number }[] | null
  closed_at: string
}

function MetricBox({ label, value, sub, color = 'text-white' }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="card">
      <p className="text-gray-400 text-xs mb-1">{label}</p>
      <p className={`font-bold text-xl ${color}`}>{value}</p>
      {sub && <p className="text-gray-500 text-xs mt-0.5">{sub}</p>}
    </div>
  )
}

export default function DailyClosure() {
  const qc = useQueryClient()
  const [notes, setNotes] = useState('')
  const [closing, setClosing] = useState(false)
  const [expandedRow, setExpandedRow] = useState<number | null>(null)
  const [pendingCriticalAction, setPendingCriticalAction] = useState<null | { action: string; run: () => Promise<void> | void }>(null)

  const today = new Date().toISOString().slice(0, 10)

  const { data: preview, isLoading: loadingPreview } = useQuery({
    queryKey: ['daily-preview'],
    queryFn: () => reportsApi.dailyPreview().then(r => r.data),
    refetchInterval: 30000,
  })

  const { data: history = [] } = useQuery<DaySummary[]>({
    queryKey: ['daily-history'],
    queryFn: () => reportsApi.dailyHistory(90).then(r => r.data),
  })

  const alreadyClosed = history.some(d => d.summary_date === today)

  const handleClose = () => {
    const now = new Date()
    if (now.getHours() < 23) {
      const horaActual = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
      toast.error(`No es posible cerrar antes de las 11:00 PM. Hora actual: ${horaActual}`, { duration: 5000 })
      return
    }
    setPendingCriticalAction({ action: 'close_day_manual', run: () => doClose() })
  }

  const doClose = async () => {
    setClosing(true)
    try {
      await reportsApi.closeDay({ notes })
      toast.success('Cierre del día guardado correctamente')
      setNotes('')
      qc.invalidateQueries({ queryKey: ['daily-history'] })
      qc.invalidateQueries({ queryKey: ['daily-preview'] })
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: { message?: string } } } })?.response?.data?.detail
      toast.error(detail?.message || 'Error al cerrar el día', { duration: 5000 })
    } finally {
      setClosing(false)
    }
  }

  // Chart data: last 30 closed days (reversed so newest is on right)
  const chartData = [...history].reverse().slice(-30).map(d => ({
    date: d.summary_date.slice(5), // MM-DD
    ventas: n(d.total_sales),
    gastos: n(d.total_expenses),
    utilidad: n(d.net_profit),
    cogs: n(d.estimated_cogs),
  }))

  return (
    <div className="p-6 space-y-6">
      {pendingCriticalAction && (
        <SpecialCodeModal
          title="Autorización requerida — Cierre contable"
          description="Cerrar el día consolida ventas, gastos y utilidad como registro permanente. Ingresa el Código de Acceso Especial."
          actionContext={pendingCriticalAction.action}
          onClose={() => setPendingCriticalAction(null)}
          onConfirm={() => {
            const run = pendingCriticalAction.run
            setPendingCriticalAction(null)
            void run()
          }}
        />
      )}

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Cierre Diario</h1>
          <p className="text-gray-500 text-sm">Contabilidad día a día — historial permanente</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              try {
                const r = await reportsApi.exportDaily('pdf')
                downloadBlob(r.data, `cierre_${today}.pdf`)
                toast.success('PDF descargado')
              } catch { toast.error('Error al generar PDF') }
            }}
            className="flex items-center gap-2 bg-red-700 hover:bg-red-600 text-white font-semibold px-3 py-2 rounded-lg text-sm"
          >
            <FileDown size={15} /> PDF
          </button>
          <button
            onClick={async () => {
              try {
                const r = await reportsApi.exportDaily('xlsx')
                downloadBlob(r.data, `cierre_${today}.xlsx`)
                toast.success('Excel descargado')
              } catch { toast.error('Error al generar Excel') }
            }}
            className="flex items-center gap-2 bg-green-700 hover:bg-green-600 text-white font-semibold px-3 py-2 rounded-lg text-sm"
          >
            <FileSpreadsheet size={15} /> Excel
          </button>
        </div>
      </div>

      {/* Today's live preview */}
      <div className="card border-brand-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CalendarCheck size={20} className="text-brand-400" />
            <h2 className="font-semibold text-white">Hoy — {formatDate(today + 'T12:00:00')}</h2>
            {alreadyClosed && (
              <span className="flex items-center gap-1 bg-green-900/40 text-green-400 border border-green-700 text-xs px-2 py-0.5 rounded-full">
                <Lock size={10} /> Cerrado
              </span>
            )}
          </div>
          <span className="text-gray-500 text-xs">Actualiza cada 30 seg</span>
        </div>

        {loadingPreview ? (
          <p className="text-gray-400 text-sm">Calculando...</p>
        ) : preview && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <MetricBox label="Ventas del día" value={formatCurrency(n(preview.total_sales))} color="text-brand-400" />
              <MetricBox label="Pedidos" value={String(n(preview.total_orders))} sub={`Ticket prom: ${formatCurrency(n(preview.avg_ticket))}`} />
              <MetricBox
                label="Utilidad neta estimada"
                value={formatCurrency(n(preview.net_profit))}
                color={n(preview.net_profit) >= 0 ? 'text-green-400' : 'text-red-400'}
                sub={`Margen: ${n(preview.net_margin_pct).toFixed(1)}%`}
              />
              <MetricBox label="Gastos del día" value={formatCurrency(n(preview.total_expenses))} color="text-red-400" />
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4 text-xs">
              {[
                { label: 'Costo est. ventas (COGS)', value: n(preview.estimated_cogs), color: 'text-orange-400' },
                { label: 'Compras inventario', value: n(preview.total_purchases), color: 'text-blue-400' },
                { label: 'Pérdidas / merma', value: n(preview.total_losses), color: 'text-red-400' },
                { label: 'Utilidad bruta', value: n(preview.gross_profit), color: n(preview.gross_profit) >= 0 ? 'text-green-400' : 'text-red-400' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-dark-700 rounded-lg p-3">
                  <p className="text-gray-400 mb-1">{label}</p>
                  <p className={`font-semibold ${color}`}>{formatCurrency(value)}</p>
                </div>
              ))}
            </div>

            {/* Payment method breakdown */}
            {preview.payment_breakdown && preview.payment_breakdown.length > 0 && (
              <div className="border-t border-dark-600 pt-4 mb-4">
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">Ventas por modalidad de pago</p>
                <div className="grid grid-cols-3 gap-3">
                  {['cash', 'card', 'transfer'].map(method => {
                    const row = preview.payment_breakdown.find((r: { method: string; count: number; total: number }) => r.method === method)
                    const icons: Record<string, React.ReactNode> = {
                      cash: <Banknote size={16} className="text-green-400" />,
                      card: <CreditCard size={16} className="text-blue-400" />,
                      transfer: <ArrowRightLeft size={16} className="text-purple-400" />,
                    }
                    const labels: Record<string, string> = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia' }
                    const colors: Record<string, string> = { cash: 'text-green-400', card: 'text-blue-400', transfer: 'text-purple-400' }
                    return (
                      <div key={method} className="bg-dark-700 rounded-lg p-3 flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          {icons[method]}
                          <span className="text-gray-400 text-xs">{labels[method]}</span>
                        </div>
                        <p className={`font-bold text-base ${colors[method]}`}>
                          {formatCurrency(row?.total ?? 0)}
                        </p>
                        <p className="text-gray-600 text-xs">{row?.count ?? 0} pedido(s)</p>
                      </div>
                    )
                  })}
                </div>
                <div className="mt-2 bg-dark-700 rounded-lg p-3 flex items-center justify-between">
                  <span className="text-gray-400 text-sm font-semibold">Total cobrado</span>
                  <span className="text-brand-400 font-bold text-lg">
                    {formatCurrency(preview.payment_breakdown.reduce((s: number, r: { total: number }) => s + r.total, 0))}
                  </span>
                </div>
              </div>
            )}

            {/* Close day form */}
            <div className="border-t border-dark-600 pt-4 flex items-end gap-3 flex-wrap">
              <div className="flex-1 min-w-48">
                <label className="label text-xs">Nota del cierre (opcional)</label>
                <input
                  type="text"
                  className="input text-sm"
                  placeholder="Ej: Día festivo, evento especial..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </div>
              <button
                onClick={handleClose}
                disabled={closing}
                className="btn-primary flex items-center gap-2 whitespace-nowrap"
              >
                <Lock size={16} />
                {alreadyClosed ? 'Re-cerrar (actualizar)' : 'Cerrar el día'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Charts */}
      {chartData.length > 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <h3 className="font-semibold text-white mb-4">Ventas y utilidad neta (últimos {chartData.length} días)</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2e2e2e" />
                <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: '#1a1a1a', border: '1px solid #3a3a3a', borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="ventas" name="Ventas" stroke="#f97316" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="utilidad" name="Utilidad neta" stroke="#22c55e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <h3 className="font-semibold text-white mb-4">Ventas vs Gastos vs COGS</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2e2e2e" />
                <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: '#1a1a1a', border: '1px solid #3a3a3a', borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="ventas" name="Ventas" fill="#f97316" radius={[2, 2, 0, 0]} />
                <Bar dataKey="gastos" name="Gastos" fill="#ef4444" radius={[2, 2, 0, 0]} />
                <Bar dataKey="cogs" name="COGS" fill="#f59e0b" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* History table */}
      <div className="card">
        <h3 className="font-semibold text-white mb-4">Historial de cierres ({history.length} días guardados)</h3>
        {history.length === 0 ? (
          <p className="text-gray-500 text-sm">Aún no hay cierres guardados. Cierra el primer día para empezar el historial.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-dark-600">
                <tr className="text-gray-400 text-xs uppercase tracking-wider">
                  <th className="text-left px-3 py-2">Fecha</th>
                  <th className="text-right px-3 py-2">Ventas</th>
                  <th className="text-right px-3 py-2">Pedidos</th>
                  <th className="text-right px-3 py-2">Gastos</th>
                  <th className="text-right px-3 py-2">COGS</th>
                  <th className="text-right px-3 py-2">Utilidad neta</th>
                  <th className="text-right px-3 py-2">Margen</th>
                  <th className="text-center px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-700">
                {history.map(day => (
                  <Fragment key={day.id}>
                    <tr
                      className="hover:bg-dark-700 cursor-pointer transition-colors"
                      onClick={() => setExpandedRow(expandedRow === day.id ? null : day.id)}
                    >
                      <td className="px-3 py-2">
                        <p className="text-white font-medium">{formatDate(day.summary_date + 'T12:00:00')}</p>
                        {day.notes && <p className="text-gray-500 text-xs">{day.notes}</p>}
                      </td>
                      <td className="px-3 py-2 text-right text-brand-400 font-semibold">{formatCurrency(n(day.total_sales))}</td>
                      <td className="px-3 py-2 text-right text-white">{n(day.total_orders)}</td>
                      <td className="px-3 py-2 text-right text-red-400">{formatCurrency(n(day.total_expenses))}</td>
                      <td className="px-3 py-2 text-right text-orange-400">{formatCurrency(n(day.estimated_cogs))}</td>
                      <td className="px-3 py-2 text-right">
                        <span className={`font-semibold ${n(day.net_profit) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {formatCurrency(n(day.net_profit))}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className={`text-xs font-bold ${n(day.net_margin_pct) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {n(day.net_margin_pct).toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center text-gray-500">
                        {expandedRow === day.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </td>
                    </tr>
                    {expandedRow === day.id && (
                      <tr className="bg-dark-900">
                        <td colSpan={8} className="px-6 py-3 space-y-4">
                          <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
                            {[
                              { label: 'Ticket promedio', value: formatCurrency(n(day.avg_ticket)) },
                              { label: 'Compras inventario', value: formatCurrency(n(day.total_purchases)) },
                              { label: 'Pérdidas / merma', value: formatCurrency(n(day.total_losses)) },
                              { label: 'Utilidad bruta', value: formatCurrency(n(day.gross_profit)) },
                              { label: 'Margen bruto', value: `${n(day.gross_margin_pct).toFixed(1)}%` },
                              { label: 'Cerrado', value: new Date(day.closed_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) },
                            ].map(({ label, value }) => (
                              <div key={label} className="bg-dark-800 rounded p-2">
                                <p className="text-gray-500">{label}</p>
                                <p className="text-white font-medium">{value}</p>
                              </div>
                            ))}
                          </div>

                          {day.payment_methods && Object.keys(day.payment_methods).length > 0 && (
                            <div className="bg-dark-800 rounded-lg p-3">
                              <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Métodos de pago</p>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                                {Object.entries(day.payment_methods).map(([method, amount]) => (
                                  <div key={method} className="flex justify-between bg-dark-700 rounded px-2 py-1.5">
                                    <span className="text-gray-300 capitalize">{method}</span>
                                    <span className="text-brand-400 font-bold">{formatCurrency(n(amount))}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {day.products_sold && day.products_sold.length > 0 && (
                            <div className="bg-dark-800 rounded-lg p-3">
                              <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">
                                Productos vendidos ({day.products_sold.length})
                              </p>
                              <div className="max-h-60 overflow-y-auto">
                                <table className="w-full text-xs">
                                  <thead className="text-gray-500 text-[10px] uppercase border-b border-dark-600">
                                    <tr>
                                      <th className="text-left py-1">Producto</th>
                                      <th className="text-right py-1">Cant.</th>
                                      <th className="text-right py-1">Total</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {day.products_sold.map((p, i) => (
                                      <tr key={i} className="border-b border-dark-700">
                                        <td className="py-1.5 text-white">{p.name}</td>
                                        <td className="py-1.5 text-right text-gray-300">{p.qty}</td>
                                        <td className="py-1.5 text-right text-brand-400 font-bold">{formatCurrency(n(p.total))}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
              {history.length > 1 && (
                <tfoot className="border-t-2 border-dark-500">
                  <tr className="text-white font-bold text-sm">
                    <td className="px-3 py-3 text-gray-400">TOTAL ({history.length} días)</td>
                    <td className="px-3 py-3 text-right text-brand-400">{formatCurrency(history.reduce((s, d) => s + n(d.total_sales), 0))}</td>
                    <td className="px-3 py-3 text-right">{history.reduce((s, d) => s + n(d.total_orders), 0)}</td>
                    <td className="px-3 py-3 text-right text-red-400">{formatCurrency(history.reduce((s, d) => s + n(d.total_expenses), 0))}</td>
                    <td className="px-3 py-3 text-right text-orange-400">{formatCurrency(history.reduce((s, d) => s + n(d.estimated_cogs), 0))}</td>
                    <td className="px-3 py-3 text-right">
                      <span className={history.reduce((s, d) => s + n(d.net_profit), 0) >= 0 ? 'text-green-400' : 'text-red-400'}>
                        {formatCurrency(history.reduce((s, d) => s + n(d.net_profit), 0))}
                      </span>
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
