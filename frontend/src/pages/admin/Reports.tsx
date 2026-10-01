import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { reportsApi, downloadBlob } from '../../services/api'
import { formatCurrency } from '../../utils/format'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { FileDown, FileSpreadsheet } from 'lucide-react'
import toast from 'react-hot-toast'

const COLORS = ['#f97316', '#3b82f6', '#22c55e', '#a855f7', '#f43f5e', '#eab308', '#06b6d4']

export default function Reports() {
  const today = new Date()
  const [startDate, setStartDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState(today.toISOString().slice(0, 10))

  const params = { start_date: startDate, end_date: endDate + 'T23:59:59' }

  const { data: salesByProduct = [] } = useQuery({
    queryKey: ['sales-by-product', startDate, endDate],
    queryFn: () => reportsApi.salesByProduct(params).then(r => r.data),
  })

  const { data: salesByPayment = [] } = useQuery({
    queryKey: ['sales-by-payment', startDate, endDate],
    queryFn: () => reportsApi.salesByPayment(params).then(r => r.data),
  })

  const totalRevenue = salesByProduct.reduce((s: number, p: { revenue: number }) => s + p.revenue, 0)

  const paymentLabels: Record<string, string> = {
    cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia',
    digital_wallet: 'Billetera', other: 'Otro'
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Reportes Operativos</h1>
        <p className="text-gray-500 text-sm">Ventas, productos y métodos de pago</p>
      </div>

      {/* Filters */}
      <div className="card flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-gray-400 text-sm">Desde</label>
          <input type="date" className="input text-sm py-1.5" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-gray-400 text-sm">Hasta</label>
          <input type="date" className="input text-sm py-1.5" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
        <div className="ml-auto flex items-center gap-3 flex-wrap">
          <p className="text-gray-400 text-sm">Total: <span className="text-brand-400 font-bold">{formatCurrency(totalRevenue)}</span></p>
          {/* Botones de exportación */}
          {([
            ['Productos PDF', 'red',   () => reportsApi.exportSalesByProduct('pdf',  params), `ventas_producto_${startDate}.pdf`],
            ['Productos XLS', 'green', () => reportsApi.exportSalesByProduct('xlsx', params), `ventas_producto_${startDate}.xlsx`],
            ['Pagos PDF',     'red',   () => reportsApi.exportSalesByPayment('pdf',  params), `ventas_pagos_${startDate}.pdf`],
            ['Pagos XLS',     'green', () => reportsApi.exportSalesByPayment('xlsx', params), `ventas_pagos_${startDate}.xlsx`],
          ] as const).map(([label, color, fn, filename]) => (
            <button
              key={label}
              onClick={async () => {
                try { const r = await (fn as () => Promise<{ data: Blob }>)(); downloadBlob(r.data, filename as string); toast.success(`${label} descargado`) }
                catch { toast.error('Error al descargar') }
              }}
              className={`flex items-center gap-1 ${color === 'red' ? 'bg-red-700 hover:bg-red-600' : 'bg-green-700 hover:bg-green-600'} text-white text-xs font-bold px-2 py-1.5 rounded-lg`}
            >
              {color === 'red' ? <FileDown size={13} /> : <FileSpreadsheet size={13} />}
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales by product */}
        <div className="card">
          <h3 className="font-semibold text-white mb-4">Ventas por producto</h3>
          {salesByProduct.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={salesByProduct.slice(0, 10)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#2e2e2e" />
                <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="product" width={100} tick={{ fill: '#9ca3af', fontSize: 10 }} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: '#1a1a1a', border: '1px solid #3a3a3a', borderRadius: 8 }} />
                <Bar dataKey="revenue" name="Ingresos" fill="#f97316" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-gray-500 text-center py-12">Sin datos en el período</p>}
        </div>

        {/* Payment methods */}
        <div className="card">
          <h3 className="font-semibold text-white mb-4">Por método de pago</h3>
          {salesByPayment.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={salesByPayment.map((p: { method: string; total: number; count: number }) => ({ ...p, name: paymentLabels[p.method] || p.method }))}
                  dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={100}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}>
                  {salesByPayment.map((_: unknown, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: '#1a1a1a', border: '1px solid #3a3a3a', borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => paymentLabels[v] || v} />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-gray-500 text-center py-12">Sin datos en el período</p>}
        </div>
      </div>

      {/* Products table */}
      {salesByProduct.length > 0 && (
        <div className="card overflow-hidden p-0">
          <div className="px-4 py-3 border-b border-dark-600">
            <h3 className="font-semibold text-white">Detalle por producto</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="border-b border-dark-600">
              <tr className="text-gray-400 text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-3">#</th>
                <th className="text-left px-4 py-3">Producto</th>
                <th className="text-left px-4 py-3">Variante</th>
                <th className="text-right px-4 py-3">Cantidad</th>
                <th className="text-right px-4 py-3">Ingresos</th>
                <th className="text-right px-4 py-3">% del total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-600">
              {salesByProduct.map((p: { product: string; variant: string; qty: number; revenue: number }, i: number) => (
                <tr key={i} className="hover:bg-dark-700 transition-colors">
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{i + 1}</td>
                  <td className="px-4 py-2.5 text-white font-medium">{p.product}</td>
                  <td className="px-4 py-2.5 text-gray-400">{p.variant}</td>
                  <td className="px-4 py-2.5 text-right text-white">{p.qty}</td>
                  <td className="px-4 py-2.5 text-right text-brand-400 font-semibold">{formatCurrency(p.revenue)}</td>
                  <td className="px-4 py-2.5 text-right text-gray-400">
                    {totalRevenue > 0 ? ((p.revenue / totalRevenue) * 100).toFixed(1) + '%' : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
