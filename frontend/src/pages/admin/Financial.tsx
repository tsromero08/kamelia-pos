import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { reportsApi, downloadBlob } from '../../services/api'
import { FinancialSummary, MonthlyComparison, ProductProfitability } from '../../types'
import { formatCurrency } from '../../utils/format'
import { TrendingUp, TrendingDown, CheckCircle, AlertTriangle, FileDown, FileSpreadsheet } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, PieChart, Pie, Cell
} from 'recharts'

const COLORS = ['#f97316', '#3b82f6', '#22c55e', '#a855f7', '#f43f5e', '#eab308']

export default function Financial() {
  const today = new Date()
  const [startDate, setStartDate] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)
  )
  const [endDate, setEndDate] = useState(today.toISOString().slice(0, 10))
  const [months, setMonths] = useState(6)

  const { data: summary } = useQuery<FinancialSummary>({
    queryKey: ['financial-summary', startDate, endDate],
    queryFn: () => reportsApi.financialSummary({ start_date: startDate, end_date: endDate + 'T23:59:59' }).then(r => r.data),
  })

  const { data: monthly = [] } = useQuery<MonthlyComparison[]>({
    queryKey: ['monthly-comparison', months],
    queryFn: () => reportsApi.monthlyComparison(months).then(r => r.data),
  })

  const { data: profitability = [] } = useQuery<ProductProfitability[]>({
    queryKey: ['profitability'],
    queryFn: () => reportsApi.profitability().then(r => r.data),
  })

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Análisis Financiero</h1>
          <p className="text-gray-500 text-sm">Control gerencial del negocio</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              try {
                const r = await reportsApi.exportFinancial('pdf', { start_date: startDate, end_date: endDate + 'T23:59:59' })
                downloadBlob(r.data, `financiero_${startDate}_${endDate}.pdf`)
                toast.success('PDF descargado')
              } catch { toast.error('Error al descargar') }
            }}
            className="flex items-center gap-2 bg-red-700 hover:bg-red-600 text-white font-semibold px-3 py-2 rounded-lg text-sm"
          >
            <FileDown size={15} /> PDF
          </button>
          <button
            onClick={async () => {
              try {
                const r = await reportsApi.exportFinancial('xlsx', { start_date: startDate, end_date: endDate + 'T23:59:59' })
                downloadBlob(r.data, `financiero_${startDate}_${endDate}.xlsx`)
                toast.success('Excel descargado')
              } catch { toast.error('Error al descargar') }
            }}
            className="flex items-center gap-2 bg-green-700 hover:bg-green-600 text-white font-semibold px-3 py-2 rounded-lg text-sm"
          >
            <FileSpreadsheet size={15} /> Excel
          </button>
        </div>
      </div>

      {/* Date filter */}
      <div className="card flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-gray-400 text-sm">Desde</label>
          <input type="date" className="input text-sm py-1.5" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-gray-400 text-sm">Hasta</label>
          <input type="date" className="input text-sm py-1.5" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <label className="text-gray-400 text-sm">Meses histórico</label>
          <select className="input text-sm py-1.5 w-24" value={months} onChange={e => setMonths(parseInt(e.target.value))}>
            {[3,6,12].map(m => <option key={m} value={m}>{m} meses</option>)}
          </select>
        </div>
      </div>

      {summary && (
        <>
          {/* Status banner */}
          <div className={`flex items-center gap-3 px-5 py-4 rounded-xl border ${summary.is_profitable ? 'bg-green-900/20 border-green-700' : 'bg-red-900/20 border-red-700'}`}>
            {summary.is_profitable ? <CheckCircle size={24} className="text-green-400" /> : <AlertTriangle size={24} className="text-red-400" />}
            <div>
              <p className={`font-bold text-lg ${summary.is_profitable ? 'text-green-400' : 'text-red-400'}`}>
                {summary.is_profitable ? '✅ Operando con utilidad estimada' : '⚠️ Operando con pérdida estimada'}
              </p>
              <p className="text-gray-400 text-sm">
                Utilidad neta estimada: <span className={`font-bold ${summary.is_profitable ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(summary.net_profit)}</span>
              </p>
            </div>
          </div>

          {/* Summary grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Ingresos brutos', value: summary.total_sales, color: 'text-white' },
              { label: 'Costo est. ventas', value: summary.estimated_cogs, color: 'text-orange-400' },
              { label: 'Gastos operativos', value: summary.total_expenses, color: 'text-red-400' },
              { label: 'Compras inventario', value: summary.total_purchases, color: 'text-blue-400' },
              { label: 'Utilidad bruta est.', value: summary.gross_profit, color: summary.gross_profit >= 0 ? 'text-green-400' : 'text-red-400' },
              { label: 'Utilidad neta est.', value: summary.net_profit, color: summary.net_profit >= 0 ? 'text-green-400' : 'text-red-400' },
              { label: 'Pedidos', value: summary.total_orders, color: 'text-white', isMoney: false },
              { label: 'Ticket promedio', value: summary.avg_ticket, color: 'text-brand-400' },
            ].map(({ label, value, color, isMoney = true }) => (
              <div key={label} className="card">
                <p className="text-gray-400 text-xs mb-1">{label}</p>
                <p className={`font-bold text-lg ${color}`}>{isMoney ? formatCurrency(Number(value)) : value}</p>
              </div>
            ))}
          </div>

          {/* Margins */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Margen bruto', value: summary.gross_margin_pct, desc: 'Ventas - Costo de ventas' },
              { label: 'Margen neto', value: summary.net_margin_pct, desc: 'Ventas - COGS - Gastos' },
              { label: 'Part. costos', value: summary.cost_participation_pct, desc: 'Costos / Ventas' },
              { label: 'Part. gastos', value: summary.expense_participation_pct, desc: 'Gastos / Ventas' },
            ].map(({ label, value, desc }) => (
              <div key={label} className="card text-center">
                <p className="text-gray-400 text-xs mb-1">{label}</p>
                <p className={`font-bold text-2xl ${Number(value) >= 0 ? 'text-green-400' : 'text-red-400'}`}>{Number(value).toFixed(1)}%</p>
                <p className="text-gray-600 text-xs mt-1">{desc}</p>
              </div>
            ))}
          </div>

          {/* Bloques 2 y 3: cortesías + delivery cost del período */}
          <div className="grid grid-cols-2 gap-4">
            <div className="card flex items-center gap-3 border-pink-700/40">
              <div className="w-12 h-12 rounded-lg bg-pink-900/30 text-pink-400 flex items-center justify-center font-bold text-xl">★</div>
              <div>
                <p className="text-gray-400 text-xs">Cortesías en el período</p>
                <p className="text-pink-400 font-bold text-2xl">{summary.total_courtesies ?? 0}</p>
                <p className="text-gray-500 text-xs">Pedidos sin cobro — inventario sí descontado</p>
              </div>
            </div>
            <div className="card flex items-center gap-3 border-orange-700/40">
              <div className="w-12 h-12 rounded-lg bg-orange-900/30 text-orange-400 flex items-center justify-center font-bold text-xl">🛵</div>
              <div>
                <p className="text-gray-400 text-xs">Pagado a repartidores</p>
                <p className="text-orange-400 font-bold text-2xl">{formatCurrency(Number(summary.total_delivery_cost ?? 0))}</p>
                <p className="text-gray-500 text-xs">Auto-generado por domicilios gestionados</p>
              </div>
            </div>
          </div>

          {/* Analysis */}
          {summary.analysis_text.length > 0 && (
            <div className="card">
              <h3 className="font-semibold text-white mb-3">💡 Análisis automático</h3>
              <div className="space-y-2">
                {summary.analysis_text.map((text, i) => (
                  <div key={i} className="flex items-start gap-2 bg-dark-700 rounded-lg px-3 py-2">
                    <span className="text-brand-400 mt-0.5">→</span>
                    <p className="text-gray-300 text-sm">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Monthly evolution */}
      {monthly.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <h3 className="font-semibold text-white mb-4">Evolución de ventas y utilidad</h3>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2e2e2e" />
                <XAxis dataKey="month_name" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: '#1a1a1a', border: '1px solid #3a3a3a', borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="total_sales" name="Ventas" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="gross_profit" name="Utilidad bruta" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="net_profit" name="Utilidad neta" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="5 5" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <h3 className="font-semibold text-white mb-4">Ventas vs Gastos vs Compras</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2e2e2e" />
                <XAxis dataKey="month_name" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: '#1a1a1a', border: '1px solid #3a3a3a', borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="total_sales" name="Ventas" fill="#f97316" radius={[4, 4, 0, 0]} />
                <Bar dataKey="total_expenses" name="Gastos" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Bar dataKey="total_purchases" name="Compras" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Product profitability */}
      {profitability.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-white mb-4">Rentabilidad por producto</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-dark-600">
                <tr className="text-gray-400 text-xs uppercase tracking-wider">
                  <th className="text-left px-3 py-2">Producto</th>
                  <th className="text-right px-3 py-2">Precio</th>
                  <th className="text-right px-3 py-2">Costo est.</th>
                  <th className="text-right px-3 py-2">Margen</th>
                  <th className="text-right px-3 py-2">Margen %</th>
                  <th className="text-right px-3 py-2">Uds vendidas</th>
                  <th className="text-right px-3 py-2">Utilidad total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-600">
                {profitability.slice(0, 20).map((p, i) => (
                  <tr key={p.variant_id} className="hover:bg-dark-700 transition-colors">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center ${i < 3 ? 'bg-brand-600 text-white' : 'bg-dark-600 text-gray-400'}`}>{i + 1}</span>
                        <div>
                          <p className="text-white font-medium">{p.product_name}</p>
                          <p className="text-gray-500 text-xs">{p.variant_name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right text-white">{formatCurrency(p.price)}</td>
                    <td className="px-3 py-2 text-right text-gray-400">{formatCurrency(p.estimated_cost)}</td>
                    <td className="px-3 py-2 text-right text-green-400">{formatCurrency(p.estimated_margin)}</td>
                    <td className="px-3 py-2 text-right">
                      <span className={`font-semibold ${p.margin_pct >= 40 ? 'text-green-400' : p.margin_pct >= 20 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {Number(p.margin_pct).toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-white">{p.units_sold}</td>
                    <td className="px-3 py-2 text-right">
                      <span className={p.total_profit >= 0 ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold'}>
                        {formatCurrency(p.total_profit)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
