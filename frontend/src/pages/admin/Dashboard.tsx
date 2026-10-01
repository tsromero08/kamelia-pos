import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { reportsApi } from '../../services/api'
import StatCard from '../../components/ui/StatCard'
import {
  DollarSign, ShoppingCart, TrendingUp, TrendingDown, Package,
  AlertTriangle, Star, Award, ChevronRight, Wifi, WifiOff, Gift, Truck
} from 'lucide-react'
import { formatCurrency } from '../../utils/format'
import { DashboardMetrics, MonthlyComparison } from '../../types'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend
} from 'recharts'

function useSystemWebSocket() {
  const qc = useQueryClient()
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    const connect = () => {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${proto}://${window.location.host}/ws/system`)
      wsRef.current = ws

      ws.onopen = () => setConnected(true)

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data)
          if (['order_created', 'order_paid', 'order_status_changed'].includes(msg.type)) {
            qc.invalidateQueries({ queryKey: ['dashboard'] })
            qc.invalidateQueries({ queryKey: ['caja-orders'] })
            qc.invalidateQueries({ queryKey: ['orders-list'] })
            qc.invalidateQueries({ queryKey: ['notifications'] })
          }
          if (msg.type === 'order_paid') {
            qc.invalidateQueries({ queryKey: ['inventory'] })
          }
        } catch { /* non-JSON ping */ }
      }

      ws.onclose = () => {
        setConnected(false)
        reconnectRef.current = setTimeout(connect, 5000)
      }

      ws.onerror = () => ws.close()
    }

    connect()

    return () => {
      clearTimeout(reconnectRef.current)
      wsRef.current?.close()
    }
  }, [qc])

  return connected
}

export default function Dashboard() {
  const wsConnected = useSystemWebSocket()

  const { data: metrics, isLoading } = useQuery<DashboardMetrics>({
    queryKey: ['dashboard'],
    queryFn: () => reportsApi.dashboard().then(r => r.data),
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  })

  const { data: monthly = [] } = useQuery<MonthlyComparison[]>({
    queryKey: ['monthly-comparison'],
    queryFn: () => reportsApi.monthlyComparison(6).then(r => r.data),
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
  })

  const { data: scheduler } = useQuery<{
    running: boolean
    next_run: string | null
    today_closed: boolean
    pending_days: string[]
    last_closure: { date: string; total_sales: number; net_profit: number } | null
  }>({
    queryKey: ['scheduler-status'],
    queryFn: () => reportsApi.schedulerStatus().then(r => r.data),
    refetchInterval: 60000,
  })

  if (isLoading || !metrics) {
    return <div className="p-6 text-gray-400">Cargando métricas...</div>
  }

  const n = (v: unknown) => Number(v) || 0
  const isProfitable = n(metrics.month_net_profit) >= 0

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-500 text-sm flex items-center gap-2 flex-wrap">
            Resumen operativo y financiero
            <span className={`flex items-center gap-1 text-xs ${wsConnected ? 'text-green-400' : 'text-gray-600'}`}>
              {wsConnected ? <Wifi size={11} /> : <WifiOff size={11} />}
              {wsConnected ? 'Tiempo real' : 'Sin conexión WS'}
            </span>
            {/* Bloque 5: badge scheduler */}
            {scheduler && (
              <span
                className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${
                  scheduler.running
                    ? (scheduler.pending_days.length > 0
                        ? 'text-yellow-400 border-yellow-700 bg-yellow-900/20'
                        : 'text-green-400 border-green-700 bg-green-900/20')
                    : 'text-red-400 border-red-700 bg-red-900/20'
                }`}
                title={
                  scheduler.next_run
                    ? `Próximo cierre: ${new Date(scheduler.next_run).toLocaleString('es-CO')}`
                    : 'Scheduler desactivado'
                }
              >
                ⏰ {scheduler.running ? 'Cierre auto 23:59' : 'Scheduler off'}
                {scheduler.pending_days.length > 0 && (
                  <span className="font-bold">· {scheduler.pending_days.length} día(s) pendiente(s)</span>
                )}
              </span>
            )}
          </p>
        </div>
        <div className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm ${isProfitable ? 'bg-green-900/30 text-green-400 border border-green-800' : 'bg-red-900/30 text-red-400 border border-red-800'}`}>
          {isProfitable ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
          {isProfitable ? 'Operando con utilidad' : 'Operando con pérdida'}
        </div>
      </div>

      {/* Today metrics */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Hoy</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Ventas hoy" value={formatCurrency(n(metrics.today_sales))} icon={DollarSign} color="orange" />
          <StatCard title="Pedidos hoy" value={n(metrics.today_orders)} icon={ShoppingCart} />
          <StatCard title="Ticket promedio" value={n(metrics.today_orders) > 0 ? formatCurrency(n(metrics.today_sales) / n(metrics.today_orders)) : '-'} icon={Star} />
          <StatCard title="Insumos críticos" value={n(metrics.low_stock_items)} icon={AlertTriangle} color={n(metrics.low_stock_items) > 0 ? 'red' : 'green'} />
        </div>
        {/* Bloques 2 y 3: cortesías + domicilios gestionados */}
        <div className="grid grid-cols-2 gap-4 mt-3">
          <div className="card flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${n(metrics.today_courtesies) > 0 ? 'bg-pink-900/30 text-pink-400' : 'bg-dark-700 text-gray-500'}`}>
              <Gift size={18} />
            </div>
            <div>
              <p className="text-xs text-gray-400">Cortesías hoy</p>
              <p className="text-white font-bold text-lg">{n(metrics.today_courtesies)}</p>
            </div>
          </div>
          <div className="card flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${n(metrics.month_delivery_cost) > 0 ? 'bg-orange-900/30 text-orange-400' : 'bg-dark-700 text-gray-500'}`}>
              <Truck size={18} />
            </div>
            <div>
              <p className="text-xs text-gray-400">Pagado a repartidores (mes)</p>
              <p className="text-white font-bold text-lg">{formatCurrency(n(metrics.month_delivery_cost))}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Month metrics */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Este mes</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Ventas del mes" value={formatCurrency(n(metrics.month_sales))} icon={DollarSign} color="orange" trend={n(metrics.sales_growth_pct)} subtitle="vs mes anterior" />
          <StatCard title="Compras" value={formatCurrency(n(metrics.month_purchases))} icon={Package} />
          <StatCard title="Gastos operativos" value={formatCurrency(n(metrics.month_expenses))} icon={TrendingDown} color="red" />
          <StatCard title="Utilidad neta estimada" value={formatCurrency(n(metrics.month_net_profit))} icon={TrendingUp} color={isProfitable ? 'green' : 'red'} trend={n(metrics.profit_growth_pct)} subtitle="vs mes anterior" />
        </div>
      </div>

      {/* Financial breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card">
          <h3 className="font-semibold text-white mb-3">Estado Financiero del Mes</h3>
          <div className="space-y-3">
            {[
              { label: 'Ingresos brutos', value: n(metrics.month_sales), color: 'text-green-400' },
              { label: 'Costo estimado ventas', value: -n(metrics.month_estimated_cogs), color: 'text-red-400' },
              { label: 'Utilidad bruta', value: n(metrics.month_gross_profit), color: n(metrics.month_gross_profit) >= 0 ? 'text-green-400' : 'text-red-400' },
              { label: 'Gastos operativos', value: -n(metrics.month_expenses), color: 'text-red-400' },
              { label: 'Utilidad neta estimada', value: n(metrics.month_net_profit), color: n(metrics.month_net_profit) >= 0 ? 'text-green-400 font-bold' : 'text-red-400 font-bold' },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between text-sm border-b border-dark-600 pb-2 last:border-0">
                <span className="text-gray-400">{row.label}</span>
                <span className={row.color}>{formatCurrency(Math.abs(row.value))}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="bg-dark-700 rounded-lg p-2 text-center">
              <div className="text-gray-400">Margen bruto</div>
              <div className="text-white font-bold">{n(metrics.month_gross_margin_pct).toFixed(1)}%</div>
            </div>
            <div className="bg-dark-700 rounded-lg p-2 text-center">
              <div className="text-gray-400">Margen neto</div>
              <div className={n(metrics.month_net_margin_pct) >= 0 ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                {n(metrics.month_net_margin_pct).toFixed(1)}%
              </div>
            </div>
          </div>
        </div>

        {/* Top product */}
        <div className="card">
          <h3 className="font-semibold text-white mb-3">Highlights del Mes</h3>
          <div className="space-y-4">
            {metrics.top_product && (
              <div className="flex items-center gap-3 bg-brand-900/20 border border-brand-800 rounded-lg p-3">
                <Award className="text-brand-400 flex-shrink-0" size={20} />
                <div>
                  <p className="text-xs text-gray-400">Producto más vendido</p>
                  <p className="text-white font-semibold">{metrics.top_product}</p>
                  <p className="text-brand-400 text-sm">{metrics.top_product_qty} unidades</p>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 text-center text-sm">
              <div className="bg-dark-700 rounded-lg p-3">
                <div className="text-gray-400 text-xs">Pedidos mes</div>
                <div className="text-white font-bold text-lg">{n(metrics.month_orders)}</div>
              </div>
              <div className="bg-dark-700 rounded-lg p-3">
                <div className="text-gray-400 text-xs">Ticket promedio</div>
                <div className="text-white font-bold">{n(metrics.month_orders) > 0 ? formatCurrency(n(metrics.month_sales) / n(metrics.month_orders)) : '-'}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick access */}
        <div className="card">
          <h3 className="font-semibold text-white mb-3">Accesos rápidos</h3>
          <div className="space-y-2">
            {[
              { label: 'Nueva venta (POS)', path: '/admin/pos', color: 'bg-brand-600/20 text-brand-400 border-brand-700' },
              { label: 'Pantalla de cocina', path: '/admin/kitchen', color: 'bg-blue-900/20 text-blue-400 border-blue-700' },
              { label: 'Registrar compra', path: '/admin/purchases', color: 'bg-green-900/20 text-green-400 border-green-700' },
              { label: 'Ver reportes', path: '/admin/reports', color: 'bg-purple-900/20 text-purple-400 border-purple-700' },
            ].map(item => (
              <a key={item.path} href={item.path} className={`flex items-center justify-between px-3 py-2 rounded-lg border text-sm font-medium transition-opacity hover:opacity-80 ${item.color}`}>
                {item.label}
                <ChevronRight size={14} />
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Charts */}
      {monthly.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <h3 className="font-semibold text-white mb-4">Ventas últimos {monthly.length} meses</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2e2e2e" />
                <XAxis dataKey="month_name" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: '#1a1a1a', border: '1px solid #3a3a3a', borderRadius: 8 }} />
                <Bar dataKey="total_sales" name="Ventas" fill="#f97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <h3 className="font-semibold text-white mb-4">Evolución financiera</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2e2e2e" />
                <XAxis dataKey="month_name" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: '#1a1a1a', border: '1px solid #3a3a3a', borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="total_sales" name="Ventas" stroke="#f97316" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="total_expenses" name="Gastos" stroke="#ef4444" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="net_profit" name="Utilidad neta" stroke="#22c55e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}
