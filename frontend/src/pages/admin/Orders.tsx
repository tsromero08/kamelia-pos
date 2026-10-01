import { useState, Fragment, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ordersApi, productsApi } from '../../services/api'
import { Order, OrderStatus, Product } from '../../types'
import Badge from '../../components/ui/Badge'
import { formatCurrency, formatDateTime, orderTypeLabel, paymentMethodLabel } from '../../utils/format'
import { ShoppingCart, ChevronDown, ChevronUp, RefreshCw, Edit3 } from 'lucide-react'
import toast from 'react-hot-toast'
import PasswordModal from '../../components/PasswordModal'
import Modal from '../../components/ui/Modal'

const STATUS_FILTERS: { label: string; value: OrderStatus | '' }[] = [
  { label: 'Todos', value: '' },
  { label: 'Pendientes', value: 'pending' },
  { label: 'En preparación', value: 'in_preparation' },
  { label: 'Listos', value: 'ready' },
  { label: 'Entregados', value: 'delivered' },
  { label: 'Cancelados', value: 'cancelled' },
]

export default function Orders() {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [pendingAction, setPendingAction] = useState<{ orderId: number; status: OrderStatus } | null>(null)
  const [editing, setEditing] = useState<Order | null>(null)
  const [editForm, setEditForm] = useState({ table_number: '', notes: '', discount: '' })
  const [savingEdit, setSavingEdit] = useState(false)

  const { data: orders = [], isLoading, isFetching } = useQuery<Order[]>({
    queryKey: ['orders-list', statusFilter],
    queryFn: () => ordersApi.list(statusFilter || undefined).then(r => r.data),
    refetchInterval: 15000,
  })

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: () => productsApi.list().then(r => r.data),
    staleTime: 60000,
  })

  const variantMap = useMemo(() => {
    const map: Record<number, { productName: string; variantName: string }> = {}
    for (const p of products) {
      for (const v of p.variants) {
        map[v.id] = { productName: p.name, variantName: v.name }
      }
    }
    return map
  }, [products])

  const handleStatusChange = async (orderId: number, status: OrderStatus) => {
    // Cancellation always requires password
    if (status === 'cancelled') {
      setPendingAction({ orderId, status })
      return
    }
    await doStatusChange(orderId, status)
  }

  const doStatusChange = async (orderId: number, status: OrderStatus) => {
    try {
      await ordersApi.updateStatus(orderId, { status })
      qc.invalidateQueries({ queryKey: ['orders-list'] })
      toast.success('Estado actualizado')
    } catch {
      toast.error('Error al actualizar estado')
    }
  }

  const openEditOrder = (o: Order) => {
    setEditing(o)
    setEditForm({
      table_number: o.table_number || '',
      notes: o.notes || '',
      discount: String(o.discount || '0'),
    })
  }

  const saveOrderEdit = async () => {
    if (!editing) return
    setSavingEdit(true)
    try {
      await ordersApi.edit(editing.id, {
        table_number: editForm.table_number.trim() || null,
        notes: editForm.notes.trim() || null,
        discount: parseFloat(editForm.discount) || 0,
      })
      qc.invalidateQueries({ queryKey: ['orders-list'] })
      qc.invalidateQueries({ queryKey: ['kitchen-orders'] })
      qc.invalidateQueries({ queryKey: ['tables-status'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setEditing(null)
      toast.success('Pedido actualizado')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg || 'Error al editar el pedido')
    } finally {
      setSavingEdit(false)
    }
  }

  const todayOrders = orders.filter(o => {
    const d = new Date(o.created_at)
    const now = new Date()
    return d.toDateString() === now.toDateString()
  })

  const totalSales = todayOrders
    .filter(o => o.status !== 'cancelled')
    .reduce((s, o) => s + Number(o.total), 0)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Pedidos del Día</h1>
          <p className="text-gray-500 text-sm">
            {todayOrders.filter(o => o.status !== 'cancelled').length} pedidos — {formatCurrency(totalSales)} en ventas hoy
          </p>
        </div>
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ['orders-list'] })}
          className="flex items-center gap-2 btn-secondary text-sm"
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        {STATUS_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value as OrderStatus | '')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === f.value
                ? 'bg-brand-600 text-white'
                : 'bg-dark-700 text-gray-400 hover:text-white'
            }`}
          >
            {f.label}
            {f.value === '' && <span className="ml-1 text-xs">({orders.length})</span>}
            {f.value !== '' && (
              <span className="ml-1 text-xs">
                ({orders.filter(o => o.status === f.value).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Orders table */}
      {isLoading ? (
        <div className="text-gray-400 py-8 text-center">Cargando pedidos...</div>
      ) : orders.length === 0 ? (
        <div className="card text-center py-12">
          <ShoppingCart size={40} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500">No hay pedidos</p>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-dark-600">
              <tr className="text-gray-400 text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-3">Pedido</th>
                <th className="text-left px-4 py-3">Hora</th>
                <th className="text-left px-4 py-3">Tipo</th>
                <th className="text-left px-4 py-3">Estado</th>
                <th className="text-right px-4 py-3">Total</th>
                <th className="text-left px-4 py-3">Pago</th>
                <th className="text-center px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-700">
              {orders.map(order => (
                <Fragment key={order.id}>
                  <tr
                    className="hover:bg-dark-700 cursor-pointer transition-colors"
                    onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}
                  >
                    <td className="px-4 py-3">
                      <span className="text-white font-bold">#{order.order_number}</span>
                      {order.table_number && (
                        <span className="ml-2 text-brand-400 text-xs">Mesa {order.table_number}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-400">{formatDateTime(order.created_at)}</td>
                    <td className="px-4 py-3 text-gray-300">{orderTypeLabel[order.order_type] || order.order_type}</td>
                    <td className="px-4 py-3"><Badge status={order.status} /></td>
                    <td className="px-4 py-3 text-right text-brand-400 font-semibold">{formatCurrency(Number(order.total))}</td>
                    <td className="px-4 py-3 text-gray-400">
                      {order.payment ? paymentMethodLabel[order.payment.payment_method] || order.payment.payment_method : '—'}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-500">
                      {expandedId === order.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </td>
                  </tr>

                  {expandedId === order.id && (
                    <tr>
                      <td colSpan={7} className="bg-dark-900 px-6 py-4">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          {/* Items */}
                          <div>
                            <p className="text-gray-400 text-xs font-semibold uppercase mb-2">Productos</p>
                            <div className="space-y-1">
                              {order.items.map(item => {
                                const v = variantMap[item.variant_id]
                                const label = v
                                  ? (v.variantName && !['Única', 'Sola'].includes(v.variantName)
                                      ? `${v.productName} (${v.variantName})`
                                      : v.productName)
                                  : `Variante #${item.variant_id}`
                                return (
                                <div key={item.id} className="text-sm">
                                  <span className="text-white">{item.quantity}x {label}</span>
                                  <span className="text-gray-500 ml-2">{formatCurrency(Number(item.subtotal))}</span>
                                  {item.modifiers.map((m, i) => (
                                    <span key={i} className={`ml-2 text-xs ${m.modifier_type === 'extra' ? 'text-green-400' : 'text-red-400'}`}>
                                      {m.modifier_type === 'extra' ? '+' : '-'}{m.name}
                                    </span>
                                  ))}
                                  {item.notes && <span className="ml-2 text-yellow-400 text-xs">({item.notes})</span>}
                                </div>
                                )
                              })}
                            </div>
                          </div>

                          {/* Order details + actions */}
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="bg-dark-800 rounded p-2">
                                <p className="text-gray-500">Subtotal</p>
                                <p className="text-white font-medium">{formatCurrency(Number(order.subtotal))}</p>
                              </div>
                              {Number(order.discount) > 0 && (
                                <div className="bg-dark-800 rounded p-2">
                                  <p className="text-gray-500">Descuento</p>
                                  <p className="text-red-400 font-medium">-{formatCurrency(Number(order.discount))}</p>
                                </div>
                              )}
                              {order.payment && (
                                <div className="bg-dark-800 rounded p-2">
                                  <p className="text-gray-500">Pagado</p>
                                  <p className="text-white font-medium">{formatCurrency(Number(order.payment.amount))}</p>
                                </div>
                              )}
                              {order.payment && Number(order.payment.change_given) > 0 && (
                                <div className="bg-dark-800 rounded p-2">
                                  <p className="text-gray-500">Cambio</p>
                                  <p className="text-white font-medium">{formatCurrency(Number(order.payment.change_given))}</p>
                                </div>
                              )}
                            </div>

                            {/* Edit pedido (solo admin, solo si no está pagado) */}
                            {!order.payment && order.status !== 'cancelled' && (
                              <div>
                                <button
                                  onClick={(e) => { e.stopPropagation(); openEditOrder(order) }}
                                  className="text-xs px-3 py-1.5 bg-brand-700 hover:bg-brand-600 text-white rounded-lg flex items-center gap-1.5"
                                >
                                  <Edit3 size={12} /> Editar pedido
                                </button>
                              </div>
                            )}

                            {/* Status change actions */}
                            {order.status !== 'delivered' && order.status !== 'cancelled' && (
                              <div className="flex gap-2 flex-wrap">
                                {order.status === 'pending' && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleStatusChange(order.id, 'in_preparation') }}
                                    className="text-xs px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded-lg"
                                  >
                                    Iniciar preparación
                                  </button>
                                )}
                                {order.status === 'in_preparation' && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleStatusChange(order.id, 'ready') }}
                                    className="text-xs px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white rounded-lg"
                                  >
                                    Marcar listo
                                  </button>
                                )}
                                {order.status === 'ready' && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleStatusChange(order.id, 'delivered') }}
                                    className="text-xs px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white rounded-lg"
                                  >
                                    Marcar entregado
                                  </button>
                                )}
                                {/* Cancelar solo si NO está pagado y requiere contraseña */}
                                {!order.payment && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleStatusChange(order.id, 'cancelled') }}
                                    className="text-xs px-3 py-1.5 bg-red-900 hover:bg-red-800 text-red-400 rounded-lg"
                                  >
                                    🔒 Cancelar
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pendingAction && (
        <PasswordModal
          title="Cancelar pedido"
          description={`Vas a cancelar el pedido. Esta acción no se puede deshacer y requiere contraseña de autorización.`}
          onConfirm={() => doStatusChange(pendingAction.orderId, pendingAction.status)}
          onClose={() => setPendingAction(null)}
        />
      )}

      {/* Modal: Editar pedido (admin) */}
      {editing && (
        <Modal title={`Editar pedido #${editing.order_number}`} onClose={() => setEditing(null)} size="sm">
          <div className="space-y-3">
            <div className="bg-brand-900/20 border border-brand-700 rounded-lg px-3 py-2 text-xs text-brand-300 flex items-center gap-2">
              <Edit3 size={13} /> Edición administrativa — solo Admin
            </div>
            <div>
              <label className="label">Mesa</label>
              <input className="input" value={editForm.table_number} onChange={e => setEditForm({...editForm, table_number: e.target.value})} placeholder="N° mesa o vacío" />
            </div>
            <div>
              <label className="label">Notas del pedido</label>
              <textarea className="input" rows={2} value={editForm.notes} onChange={e => setEditForm({...editForm, notes: e.target.value})} />
            </div>
            <div>
              <label className="label">Descuento</label>
              <input type="number" min={0} step="100" className="input" value={editForm.discount} onChange={e => setEditForm({...editForm, discount: e.target.value})} />
              <p className="text-gray-500 text-xs mt-1">Subtotal actual: {formatCurrency(Number(editing.subtotal))}</p>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setEditing(null)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={saveOrderEdit} disabled={savingEdit} className="btn-primary flex-1">
                {savingEdit ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
