import { useState, useMemo, Fragment } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ordersApi, productsApi } from '../../services/api'
import { Order, OrderStatus, Product } from '../../types'
import { formatCurrency, formatDateTime, orderTypeLabel, paymentMethodLabel } from '../../utils/format'
import { DollarSign, RefreshCw, ChevronDown, ChevronUp, CreditCard, Lock, Printer, FileText, Receipt, Gift, Plus, X, Split } from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '../../components/ui/Modal'
import Invoice, { InvoiceData } from '../../components/Invoice'
import { useAuthStore } from '../../store/authStore'
import PasswordModal from '../../components/PasswordModal'

const TIP_PCT = 0.10  // Rancho La Kamelia sugiere 10% de propina (textual en menú)

interface SplitLine {
  id: string
  method: string
  amount: string
}

interface PayState {
  order: Order
  withTip: boolean | null
  method: string
  cashAmount: string
  loading: boolean
  splitMode: boolean
  splits: SplitLine[]
}

const ALL_PAYMENT_METHODS: { val: string; label: string }[] = [
  { val: 'cash', label: 'Efectivo' },
  { val: 'card', label: 'Tarjeta' },
  { val: 'transfer', label: 'Transferencia' },
  { val: 'nequi', label: 'Nequi' },
  { val: 'daviplata', label: 'Daviplata' },
]

const uid = () => Math.random().toString(36).slice(2)

interface StatusChangeRequest {
  order: Order
  newStatus: OrderStatus
}

// Construye InvoiceData desde una Order ya pagada
function buildInvoiceData(
  order: Order,
  variantMap: Record<number, { productName: string; variantName: string }>,
  cashierName?: string,
  withTip?: boolean,
): InvoiceData {
  const base = Number(order.total)
  const tip = withTip ? Math.round(base * TIP_PCT) : 0
  return {
    invoiceNumber: order.payment?.invoice_number,
    orderNumber: order.order_number,
    orderType: order.order_type,
    tableNumber: order.table_number || undefined,
    cashierName,
    items: order.items.map(item => {
      const v = variantMap[item.variant_id]
      const extras = item.modifiers
        .filter(m => m.modifier_type === 'extra')
        .reduce((s, m) => s + Number(m.additional_price || 0), 0)
      const optsAdd = item.selected_options
        .reduce((s, o) => s + Number(o.additional_price || 0), 0)
      const basePrice = Math.max(0, Number(item.unit_price) - extras - optsAdd)
      return {
        productName: v?.productName || `Producto #${item.variant_id}`,
        variantName: v?.variantName || '',
        quantity: item.quantity,
        unitPrice: Number(item.unit_price),
        basePrice,
        subtotal: Number(item.subtotal),
        options: item.selected_options.map(o => ({
          name: `Opción #${o.option_id}`,
          additional_price: Number(o.additional_price || 0),
        })),
        modifiers: item.modifiers.map(m => ({
          type: m.modifier_type as 'extra' | 'remove',
          name: m.name,
          additional_price: Number(m.additional_price || 0),
        })),
        notes: item.notes,
      }
    }),
    subtotal: Number(order.subtotal),
    discount: Number(order.discount),
    tip,
    total: base + tip,
    paymentMethod: order.payment?.payment_method || '',
    amountPaid: Number(order.payment?.amount || base),
    change: Number(order.payment?.change_given || 0),
    createdAt: order.created_at,
    // Bloque 2
    isCourtesy: !!order.is_courtesy,
    // Bloque 3
    deliveryMode: order.delivery_mode,
    deliveryFee: Number(order.delivery_fee || 0),
    deliveryAddress: order.delivery_address || undefined,
    // Bloque 4
    splits: order.payment?.splits?.map(s => ({
      payment_method: s.payment_method,
      amount: Number(s.amount),
    })),
    customerType: order.customer_type,
    taxType: order.tax_type || undefined,
    taxId: order.tax_id || undefined,
    customerName: order.customer?.name,
    customerPhone: order.customer?.phone,
  }
}

export default function Caja() {
  const qc = useQueryClient()
  const { user, hasRole } = useAuthStore()
  const isAdmin = hasRole('Administrador')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [payState, setPayState] = useState<PayState | null>(null)
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null)
  const [passwordRequest, setPasswordRequest] = useState<StatusChangeRequest | null>(null)
  const [invoiceTab, setInvoiceTab] = useState<'pending' | 'paid'>('pending')
  const [methodFilter, setMethodFilter] = useState<string>('all')

  // Pedidos pendientes (sin pago)
  const { data: allOrders = [], isFetching } = useQuery<Order[]>({
    queryKey: ['caja-orders'],
    queryFn: () => ordersApi.list().then(r => r.data),
    refetchInterval: 8000,
  })

  // Facturas emitidas (pedidos pagados)
  const { data: invoices = [], isFetching: fetchingInvoices } = useQuery<Order[]>({
    queryKey: ['invoices-list'],
    queryFn: () => ordersApi.invoices().then(r => r.data),
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
        map[v.id] = { productName: p.name, variantName: v.name === 'Única' ? '' : v.name }
      }
    }
    return map
  }, [products])

  const pendingOrders = allOrders.filter(o => !o.payment && o.status !== 'cancelled')

  const openPay = (order: Order) => {
    setPayState({
      order, withTip: null, method: '', cashAmount: '', loading: false,
      splitMode: false, splits: [],
    })
  }

  // Cierre rápido de cortesía: Payment con method='courtesy' y amount=0
  const handleCloseCourtesy = async (order: Order) => {
    if (!confirm(`¿Cerrar pedido CORTESÍA #${order.order_number}? El inventario se descontará.`)) return
    try {
      await ordersApi.pay(order.id, {
        payment_method: 'courtesy',
        amount: 0,
        change_given: 0,
        notes: 'Cortesía — sin cobro',
      })
      invalidateAll()
      setInvoiceTab('paid')
      toast.success(`Cortesía registrada — Pedido #${order.order_number}`)
    } catch {
      toast.error('Error al cerrar la cortesía')
    }
  }

  const computeTotal = (order: Order, withTip: boolean) => {
    const base = Number(order.total)
    return withTip ? Math.round(base * (1 + TIP_PCT)) : base
  }

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['caja-orders'] })
    qc.invalidateQueries({ queryKey: ['invoices-list'] })
    qc.invalidateQueries({ queryKey: ['orders-list'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
    qc.invalidateQueries({ queryKey: ['notifications'] })
    qc.invalidateQueries({ queryKey: ['tables-status'] })
    qc.invalidateQueries({ queryKey: ['kitchen-orders'] })
  }

  const handleConfirmPayment = async () => {
    if (!payState || payState.withTip === null) return
    const finalTotal = computeTotal(payState.order, payState.withTip)

    // Modo split: validar que la suma cuadre con el total
    if (payState.splitMode) {
      const cleanSplits = payState.splits.filter(s => s.method && parseFloat(s.amount) > 0)
      if (cleanSplits.length < 2) {
        toast.error('Un pago dividido requiere al menos 2 métodos.')
        return
      }
      const sum = cleanSplits.reduce((s, x) => s + (parseFloat(x.amount) || 0), 0)
      if (Math.abs(sum - finalTotal) > 1) {
        toast.error(`La suma (${formatCurrency(sum)}) no coincide con el total (${formatCurrency(finalTotal)})`)
        return
      }
      setPayState(p => p ? { ...p, loading: true } : null)
      try {
        const tipAmount = payState.withTip ? Math.round(Number(payState.order.total) * TIP_PCT) : 0
        const res = await ordersApi.pay(payState.order.id, {
          payment_method: 'mixed',
          amount: finalTotal,
          change_given: 0,
          notes: payState.withTip ? `Propina sugerida (+10%): $${tipAmount.toLocaleString()}` : 'Pago dividido',
          tip_amount: tipAmount,
          tip_percent: payState.withTip ? 10 : 0,
          splits: cleanSplits.map(s => ({
            payment_method: s.method,
            amount: parseFloat(s.amount),
          })),
        })
        const paidOrder: Order = res.data
        const invoice = buildInvoiceData(paidOrder, variantMap, user?.name, payState.withTip ?? false)
        setInvoiceData(invoice)
        setPayState(null)
        invalidateAll()
        setInvoiceTab('paid')
        toast.success(`Pago dividido registrado — Factura ${paidOrder.payment?.invoice_number}`)
      } catch {
        toast.error('Error al procesar el pago dividido')
        setPayState(p => p ? { ...p, loading: false } : null)
      }
      return
    }

    if (!payState.method) {
      toast.error('Debes seleccionar una modalidad de pago')
      return
    }
    const paid = payState.method === 'cash' ? parseFloat(payState.cashAmount) || finalTotal : finalTotal

    if (payState.method === 'cash' && paid < finalTotal) {
      toast.error('El monto recibido es insuficiente')
      return
    }

    setPayState(p => p ? { ...p, loading: true } : null)
    try {
      const tipAmount = payState.withTip ? Math.round(Number(payState.order.total) * TIP_PCT) : 0
      const res = await ordersApi.pay(payState.order.id, {
        payment_method: payState.method,
        amount: paid,
        change_given: payState.method === 'cash' ? Math.max(0, paid - finalTotal) : 0,
        notes: payState.withTip ? `Propina sugerida (+10%): $${tipAmount.toLocaleString()}` : undefined,
        tip_amount: tipAmount,
        tip_percent: payState.withTip ? 10 : 0,
      })
      const paidOrder: Order = res.data

      const invoice = buildInvoiceData(
        { ...paidOrder, payment: { ...paidOrder.payment!, amount: paid, change_given: payState.method === 'cash' ? Math.max(0, paid - finalTotal) : 0 } },
        variantMap,
        user?.name,
        payState.withTip ?? false,
      )

      setInvoiceData(invoice)
      setPayState(null)
      invalidateAll()
      setInvoiceTab('paid')
      toast.success(`Pago registrado — Factura ${paidOrder.payment?.invoice_number || paidOrder.order_number}`)
    } catch {
      toast.error('Error al procesar el pago')
      setPayState(p => p ? { ...p, loading: false } : null)
    }
  }

  const requestStatusChange = (order: Order, newStatus: OrderStatus) => {
    // Solo cancelar un pedido pagado requiere contraseña
    if (order.payment && newStatus === 'cancelled') {
      setPasswordRequest({ order, newStatus })
    } else {
      executeStatusChange(order.id, newStatus, undefined, false)
    }
  }

  const executeStatusChange = async (
    orderId: number,
    newStatus: OrderStatus,
    password: string | undefined,
    hasPaid: boolean,
  ) => {
    try {
      await ordersApi.updateStatus(orderId, {
        status: newStatus,
        notes: hasPaid ? 'Modificación post-facturación autorizada' : undefined,
        password,
      })
      invalidateAll()
      toast.success('Estado actualizado')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg || 'Error al actualizar el estado')
    }
  }

  const printInvoice = (order: Order) => {
    const inv = buildInvoiceData(order, variantMap, user?.name, false)
    setInvoiceData(inv)
  }

  return (
    <div className="p-6 space-y-6">
      {invoiceData && (
        <Invoice data={invoiceData} onClose={() => setInvoiceData(null)} />
      )}

      {passwordRequest && (
        <PasswordModal
          title="Modificar pedido facturado"
          description={`El pedido #${passwordRequest.order.order_number} ya tiene factura. Ingresa tu contraseña para autorizar.`}
          onClose={() => setPasswordRequest(null)}
          onConfirmWithPassword={(pwd: string) => {
            const req = passwordRequest
            setPasswordRequest(null)
            executeStatusChange(req.order.id, req.newStatus, pwd, true)
          }}
        />
      )}

      {/* Título y tabs */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <DollarSign size={24} className="text-brand-400" />
            Caja
          </h1>
          <p className="text-gray-500 text-sm">
            {pendingOrders.length} pedido(s) sin cobrar · {invoices.length} factura(s) emitida(s)
          </p>
        </div>
        <button
          onClick={() => { qc.invalidateQueries({ queryKey: ['caja-orders'] }); qc.invalidateQueries({ queryKey: ['invoices-list'] }) }}
          className="flex items-center gap-2 btn-secondary text-sm"
        >
          <RefreshCw size={14} className={(isFetching || fetchingInvoices) ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-dark-600 pb-0">
        <button
          onClick={() => setInvoiceTab('pending')}
          className={`px-5 py-2.5 font-semibold text-sm rounded-t-lg transition-colors flex items-center gap-2 ${
            invoiceTab === 'pending'
              ? 'bg-brand-600 text-white'
              : 'bg-dark-700 text-gray-400 hover:text-white'
          }`}
        >
          <CreditCard size={15} />
          Cobrar ({pendingOrders.length})
        </button>
        <button
          onClick={() => setInvoiceTab('paid')}
          className={`px-5 py-2.5 font-semibold text-sm rounded-t-lg transition-colors flex items-center gap-2 ${
            invoiceTab === 'paid'
              ? 'bg-brand-600 text-white'
              : 'bg-dark-700 text-gray-400 hover:text-white'
          }`}
        >
          <FileText size={15} />
          Facturas ({invoices.length})
        </button>
      </div>

      {/* TAB: Pedidos pendientes de cobro */}
      {invoiceTab === 'pending' && (
        <>
          {pendingOrders.length === 0 ? (
            <div className="card text-center py-16">
              <DollarSign size={48} className="text-gray-700 mx-auto mb-3" />
              <p className="text-gray-400 font-semibold">No hay pedidos pendientes de cobro</p>
              <p className="text-gray-600 text-sm mt-1">Los pedidos aparecen aquí cuando se crean desde el POS</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingOrders.map(order => (
                <Fragment key={order.id}>
                  <div className="card p-0 overflow-hidden">
                    <div
                      className="flex items-center gap-4 p-4 cursor-pointer hover:bg-dark-700 transition-colors"
                      onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-white font-bold text-lg">#{order.order_number}</span>
                          {order.table_number && (
                            <span className="bg-brand-900/40 text-brand-400 border border-brand-700 text-xs px-2 py-0.5 rounded-full">
                              Mesa {order.table_number}
                            </span>
                          )}
                          <span className="text-gray-500 text-xs">{formatDateTime(order.created_at)}</span>
                          <span className="text-gray-400 text-xs">{orderTypeLabel[order.order_type] || order.order_type}</span>
                        </div>
                        <p className="text-gray-500 text-sm mt-0.5">
                          {order.items.length} producto(s)
                          {order.items.map(item => {
                            const v = variantMap[item.variant_id]
                            return v ? ` · ${item.quantity}x ${v.productName}` : ''
                          }).join('')}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          {order.is_courtesy ? (
                            <>
                              <p className="text-pink-400 font-bold text-xl flex items-center gap-1 justify-end">
                                <Gift size={16} /> $0
                              </p>
                              <p className="text-pink-500 text-xs">Cortesía · ref {formatCurrency(Number(order.subtotal))}</p>
                            </>
                          ) : (
                            <>
                              <p className="text-brand-400 font-bold text-xl">{formatCurrency(Number(order.total))}</p>
                              <p className="text-gray-500 text-xs">+8% = {formatCurrency(Math.round(Number(order.total) * 1.08))}</p>
                            </>
                          )}
                          {order.delivery_mode && order.delivery_mode !== 'none' && (
                            <p className="text-orange-400 text-[10px]">
                              🛵 {order.delivery_mode === 'managed' ? `Envío $${Number(order.delivery_fee || 0).toLocaleString()}` : 'Repartidor externo'}
                            </p>
                          )}
                        </div>
                        {order.is_courtesy ? (
                          isAdmin ? (
                            <button
                              onClick={e => { e.stopPropagation(); handleCloseCourtesy(order) }}
                              className="flex items-center gap-2 bg-pink-700 hover:bg-pink-600 text-white font-semibold px-4 py-2 rounded-lg transition-colors text-sm whitespace-nowrap"
                            >
                              <Gift size={15} />
                              Cerrar cortesía
                            </button>
                          ) : (
                            <span
                              title="Solo el Administrador puede cerrar pedidos de cortesía"
                              className="flex items-center gap-2 bg-pink-900/30 text-pink-400 border border-pink-800 font-semibold px-4 py-2 rounded-lg text-xs whitespace-nowrap cursor-not-allowed opacity-70"
                            >
                              <Lock size={13} />
                              Solo admin
                            </span>
                          )
                        ) : (
                          <button
                            onClick={e => { e.stopPropagation(); openPay(order) }}
                            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold px-4 py-2 rounded-lg transition-colors text-sm whitespace-nowrap"
                          >
                            <CreditCard size={15} />
                            Cobrar
                          </button>
                        )}
                        <span className="text-gray-600">
                          {expandedId === order.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </span>
                      </div>
                    </div>

                    {expandedId === order.id && (
                      <div className="border-t border-dark-600 bg-dark-900 px-6 py-4">
                        <p className="text-gray-400 text-xs font-semibold uppercase mb-3">Detalle</p>
                        <div className="space-y-2">
                          {order.items.map(item => {
                            const v = variantMap[item.variant_id]
                            const label = v
                              ? (v.variantName ? `${v.productName} (${v.variantName})` : v.productName)
                              : `Variante #${item.variant_id}`
                            return (
                              <div key={item.id} className="flex justify-between text-sm">
                                <span className="text-white">{item.quantity}x {label}
                                  {item.modifiers.map((m, i) => (
                                    <span key={i} className={`ml-2 text-xs ${m.modifier_type === 'extra' ? 'text-green-400' : 'text-red-400'}`}>
                                      {m.modifier_type === 'extra' ? '+' : '-'}{m.name}
                                    </span>
                                  ))}
                                  {item.notes && <span className="ml-2 text-yellow-400 text-xs">({item.notes})</span>}
                                </span>
                                <span className="text-brand-400 font-medium">{formatCurrency(Number(item.subtotal))}</span>
                              </div>
                            )
                          })}
                        </div>
                        <div className="mt-3 pt-3 border-t border-dark-700 space-y-1 text-sm">
                          <div className="flex justify-between text-gray-400"><span>Subtotal</span><span>{formatCurrency(Number(order.subtotal))}</span></div>
                          {Number(order.discount) > 0 && (
                            <div className="flex justify-between text-red-400"><span>Descuento</span><span>-{formatCurrency(Number(order.discount))}</span></div>
                          )}
                          <div className="flex justify-between text-white font-bold text-base"><span>Total</span><span>{formatCurrency(Number(order.total))}</span></div>
                          <div className="flex justify-between text-brand-300 text-xs"><span>Con servicio (+8%)</span><span>{formatCurrency(Math.round(Number(order.total) * 1.08))}</span></div>
                        </div>

                        <div className="mt-3 pt-3 border-t border-dark-700">
                          <p className="text-gray-400 text-xs mb-2 flex items-center gap-1">
                            Cambiar estado
                            {order.payment && <Lock size={10} className="text-yellow-500" />}
                            {order.payment && <span className="text-yellow-600">(cancelar requiere contraseña)</span>}
                          </p>
                          <div className="flex gap-2 flex-wrap">
                            {(['pending', 'in_preparation', 'ready', 'delivered', 'cancelled'] as OrderStatus[]).map(s => (
                              <button
                                key={s}
                                disabled={order.status === s}
                                onClick={() => requestStatusChange(order, s)}
                                className={`text-xs px-2 py-1 rounded-lg transition-colors ${
                                  order.status === s ? 'bg-brand-600 text-white' : 'bg-dark-700 text-gray-400 hover:text-white hover:bg-dark-600'
                                }`}
                              >
                                {s === 'pending' ? 'Pendiente' : s === 'in_preparation' ? 'En prep.' : s === 'ready' ? 'Listo' : s === 'delivered' ? 'Entregado' : 'Cancelado'}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </Fragment>
              ))}
            </div>
          )}
        </>
      )}

      {/* TAB: Facturas emitidas */}
      {invoiceTab === 'paid' && (
        <>
          {invoices.length === 0 ? (
            <div className="card text-center py-16">
              <Receipt size={48} className="text-gray-700 mx-auto mb-3" />
              <p className="text-gray-400 font-semibold">No hay facturas emitidas aún</p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Filtro por método de pago */}
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="text-gray-500">Filtrar por método:</span>
                {['all', 'cash', 'card', 'transfer', 'nequi', 'daviplata', 'mixed', 'courtesy'].map(m => {
                  const count = m === 'all' ? invoices.length : invoices.filter(o => o.payment?.payment_method === m).length
                  return (
                    <button
                      key={m}
                      onClick={() => setMethodFilter(m)}
                      className={`px-2 py-1 rounded-md font-semibold transition-colors ${
                        methodFilter === m ? 'bg-brand-600 text-white' : 'bg-dark-700 text-gray-400 hover:text-white'
                      } ${count === 0 && m !== 'all' ? 'opacity-40' : ''}`}
                    >
                      {m === 'all' ? `Todas (${count})` : `${paymentMethodLabel[m]} (${count})`}
                    </button>
                  )
                })}
              </div>
              <p className="text-gray-500 text-xs px-1">Haz clic en <strong className="text-white">Imprimir</strong> en cualquier factura para imprimirla.</p>
              {invoices
                .filter(o => methodFilter === 'all' || o.payment?.payment_method === methodFilter)
                .map(order => (
                <div key={order.id} className="card p-0 overflow-hidden">
                  <div className="flex items-center gap-4 p-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        {order.payment?.invoice_number && (
                          <span className="bg-green-900/40 text-green-400 border border-green-700 text-sm font-bold px-3 py-0.5 rounded-full">
                            {order.payment.invoice_number}
                          </span>
                        )}
                        <span className="text-gray-400 text-sm">Pedido #{order.order_number}</span>
                        {order.table_number && (
                          <span className="bg-brand-900/40 text-brand-400 border border-brand-700 text-xs px-2 py-0.5 rounded-full">
                            Mesa {order.table_number}
                          </span>
                        )}
                        <span className="text-gray-500 text-xs">{formatDateTime(order.created_at)}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {order.is_courtesy && (
                          <span className="bg-pink-900/40 text-pink-300 border border-pink-700 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                            ★ CORTESÍA
                          </span>
                        )}
                        {order.delivery_mode && order.delivery_mode !== 'none' && (
                          <span className="bg-orange-900/40 text-orange-300 border border-orange-700 text-[10px] px-1.5 py-0.5 rounded-full">
                            🛵 {order.delivery_mode === 'managed' ? `Envío $${Number(order.delivery_fee).toLocaleString()}` : 'Externo'}
                          </span>
                        )}
                        {order.payment?.is_split && (
                          <span className="bg-purple-900/40 text-purple-300 border border-purple-700 text-[10px] px-1.5 py-0.5 rounded-full">
                            ⊟ Dividido ({order.payment.splits?.length || 0})
                          </span>
                        )}
                        {order.tax_id && (
                          <span className="bg-blue-900/40 text-blue-300 border border-blue-700 text-[10px] px-1.5 py-0.5 rounded-full">
                            NIT {order.tax_id}
                          </span>
                        )}
                      </div>
                      <p className="text-gray-500 text-xs mt-1">
                        {order.items.length} producto(s)
                        {order.items.slice(0, 3).map(item => {
                          const v = variantMap[item.variant_id]
                          return v ? ` · ${item.quantity}x ${v.productName}` : ''
                        }).join('')}
                        {order.items.length > 3 ? ' ...' : ''}
                        {' '}— {order.payment?.payment_method ? paymentMethodLabel[order.payment.payment_method] || order.payment.payment_method : ''}
                      </p>
                      {/* Desglose del split, si aplica */}
                      {order.payment?.is_split && order.payment.splits && order.payment.splits.length > 0 && (
                        <p className="text-purple-300 text-[10px] mt-0.5 font-mono">
                          {order.payment.splits.map((s, i) =>
                            `${paymentMethodLabel[s.payment_method] || s.payment_method} ${formatCurrency(Number(s.amount))}`
                          ).join(' + ')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-brand-400 font-bold text-lg">{formatCurrency(Number(order.total))}</span>
                      <button
                        onClick={() => printInvoice(order)}
                        className="flex items-center gap-2 bg-dark-600 hover:bg-dark-500 text-gray-300 hover:text-white font-semibold px-4 py-2 rounded-lg transition-colors text-sm border border-dark-500"
                      >
                        <Printer size={15} />
                        Imprimir
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Modal de cobro */}
      {payState && (
        <Modal title={`Cobrar pedido #${payState.order.order_number}`} onClose={() => setPayState(null)}>
          <div className="space-y-5">
            {payState.order.table_number && (
              <div className="bg-brand-900/20 border border-brand-700 rounded-lg px-4 py-2 text-center">
                <p className="text-brand-400 font-bold text-lg">Mesa {payState.order.table_number}</p>
              </div>
            )}
            <div>
              <p className="label mb-2">¿Incluir servicio? (+8%)</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setPayState(p => p ? { ...p, withTip: false } : null)}
                  className={`p-4 rounded-xl border-2 transition-all text-center ${payState.withTip === false ? 'border-brand-500 bg-brand-900/30' : 'border-dark-500 bg-dark-700 hover:border-dark-400'}`}
                >
                  <p className="font-bold text-white text-lg">{formatCurrency(Number(payState.order.total))}</p>
                  <p className="text-gray-400 text-sm mt-1">Sin servicio</p>
                </button>
                <button
                  onClick={() => setPayState(p => p ? { ...p, withTip: true } : null)}
                  className={`p-4 rounded-xl border-2 transition-all text-center ${payState.withTip === true ? 'border-green-500 bg-green-900/20' : 'border-dark-500 bg-dark-700 hover:border-dark-400'}`}
                >
                  <p className="font-bold text-white text-lg">{formatCurrency(computeTotal(payState.order, true))}</p>
                  <p className="text-green-400 text-sm mt-1">Con servicio (+8%)</p>
                  <p className="text-gray-500 text-xs">+{formatCurrency(Math.round(Number(payState.order.total) * TIP_PCT))}</p>
                </button>
              </div>
            </div>

            {payState.withTip !== null && (
              <>
                {/* Switch: pago simple vs pago dividido */}
                <div className="flex gap-1 bg-dark-900 rounded-lg p-1">
                  <button
                    onClick={() => setPayState(p => p ? { ...p, splitMode: false, splits: [] } : null)}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${!payState.splitMode ? 'bg-brand-600 text-white' : 'text-gray-500'}`}
                  >
                    <CreditCard size={12} className="inline mr-1" /> Un solo método
                  </button>
                  <button
                    onClick={() => setPayState(p => p ? { ...p, splitMode: true, method: '', cashAmount: '', splits: [{ id: uid(), method: 'cash', amount: '' }, { id: uid(), method: 'transfer', amount: '' }] } : null)}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${payState.splitMode ? 'bg-brand-600 text-white' : 'text-gray-500'}`}
                  >
                    <Split size={12} className="inline mr-1" /> Pago dividido
                  </button>
                </div>

                {!payState.splitMode && (
                  <>
                    <div>
                      <p className="label mb-2">Modalidad de pago <span className="text-red-400">*</span></p>
                      {!payState.method && (
                        <p className="text-yellow-400 text-xs mb-2">Selecciona una modalidad antes de continuar</p>
                      )}
                      {/* Métodos principales: Efectivo / Tarjeta / Transferencia */}
                      <div className="grid grid-cols-3 gap-2">
                        {([
                          { val: 'cash',     label: 'Efectivo',      icon: '💵' },
                          { val: 'card',     label: 'Tarjeta',       icon: '💳' },
                          { val: 'transfer', label: 'Transferencia', icon: '🏦' },
                        ] as const).map(({ val, label, icon }) => {
                          const active = payState.method === val
                            || (val === 'transfer' && (payState.method === 'nequi' || payState.method === 'daviplata'))
                          return (
                            <button
                              key={val}
                              onClick={() => setPayState(p => p ? { ...p, method: val, cashAmount: '' } : null)}
                              className={`py-3 rounded-lg font-semibold text-sm transition-colors border-2 ${
                                active
                                  ? 'bg-brand-600 border-brand-500 text-white shadow-md'
                                  : 'bg-dark-700 border-dark-600 text-gray-400 hover:border-brand-700 hover:text-white'
                              }`}
                            >
                              <span className="text-base">{icon}</span> <span className="ml-1">{label}</span>
                            </button>
                          )
                        })}
                      </div>

                      {/* Sub-opciones de Transferencia (Nequi / Daviplata) */}
                      {(payState.method === 'transfer' || payState.method === 'nequi' || payState.method === 'daviplata') && (
                        <div className="mt-3 bg-dark-900/60 border border-brand-700/40 rounded-xl p-3">
                          <p className="text-brand-300 text-[11px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1">
                            🏦 Tipo de transferencia
                          </p>
                          <div className="grid grid-cols-3 gap-2">
                            {([
                              { val: 'transfer',  label: 'Otra',      desc: 'Banco / otra app' },
                              { val: 'nequi',     label: 'Nequi',     desc: 'Bancolombia' },
                              { val: 'daviplata', label: 'Daviplata', desc: 'Davivienda' },
                            ] as const).map(({ val, label, desc }) => (
                              <button
                                key={val}
                                onClick={() => setPayState(p => p ? { ...p, method: val } : null)}
                                className={`py-2 rounded-lg text-xs font-bold transition-colors border-2 flex flex-col ${
                                  payState.method === val
                                    ? 'bg-brand-700 border-brand-400 text-white'
                                    : 'bg-dark-700 border-dark-500 text-gray-300 hover:border-brand-700'
                                }`}
                              >
                                <span>{label}</span>
                                <span className="text-[9px] font-normal opacity-70">{desc}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {payState.method === 'cash' && (
                      <div>
                        <p className="label">Dinero recibido</p>
                        <input
                          type="number"
                          className="input text-xl font-bold text-center"
                          value={payState.cashAmount}
                          onChange={e => setPayState(p => p ? { ...p, cashAmount: e.target.value } : null)}
                          placeholder={String(computeTotal(payState.order, payState.withTip!))}
                          autoFocus
                        />
                        {payState.cashAmount && parseFloat(payState.cashAmount) >= computeTotal(payState.order, payState.withTip!) && (
                          <p className="text-green-400 text-sm mt-1 text-center font-semibold">
                            Cambio: {formatCurrency(parseFloat(payState.cashAmount) - computeTotal(payState.order, payState.withTip!))}
                          </p>
                        )}
                        {payState.cashAmount && parseFloat(payState.cashAmount) < computeTotal(payState.order, payState.withTip!) && (
                          <p className="text-red-400 text-sm mt-1 text-center">
                            Falta: {formatCurrency(computeTotal(payState.order, payState.withTip!) - parseFloat(payState.cashAmount))}
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* Modo split: lista de pagos */}
                {payState.splitMode && (
                  <div className="space-y-2">
                    <p className="label">Divide el cobro entre métodos</p>
                    {payState.splits.map((s, idx) => (
                      <div key={s.id} className="flex gap-2 items-center bg-dark-700 rounded-lg p-2">
                        <select
                          className="input text-sm py-1.5 h-9 flex-1"
                          value={s.method}
                          onChange={e => setPayState(p => p ? {
                            ...p,
                            splits: p.splits.map(x => x.id === s.id ? { ...x, method: e.target.value } : x)
                          } : null)}
                        >
                          {ALL_PAYMENT_METHODS.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
                        </select>
                        <input
                          type="number"
                          className="input text-right text-sm py-1.5 h-9 w-32"
                          placeholder="$0"
                          value={s.amount}
                          onChange={e => setPayState(p => p ? {
                            ...p,
                            splits: p.splits.map(x => x.id === s.id ? { ...x, amount: e.target.value } : x)
                          } : null)}
                        />
                        {payState.splits.length > 2 && (
                          <button
                            onClick={() => setPayState(p => p ? { ...p, splits: p.splits.filter(x => x.id !== s.id) } : null)}
                            className="text-gray-500 hover:text-red-400 p-1"
                          >
                            <X size={14} />
                          </button>
                        )}
                        {idx === payState.splits.length - 1 && payState.splits.length < 5 && (
                          <button
                            onClick={() => setPayState(p => p ? { ...p, splits: [...p.splits, { id: uid(), method: 'cash', amount: '' }] } : null)}
                            className="text-brand-400 hover:text-brand-300 p-1"
                          >
                            <Plus size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                    {(() => {
                      const sum = payState.splits.reduce((s, x) => s + (parseFloat(x.amount) || 0), 0)
                      const total = computeTotal(payState.order, payState.withTip!)
                      const diff = total - sum
                      return (
                        <div className={`rounded-lg p-2 text-center text-sm font-bold ${
                          Math.abs(diff) < 1 ? 'bg-green-900/30 text-green-400' :
                          diff > 0 ? 'bg-yellow-900/30 text-yellow-400' : 'bg-red-900/30 text-red-400'
                        }`}>
                          Suma: {formatCurrency(sum)} / {formatCurrency(total)}
                          {Math.abs(diff) >= 1 && (
                            <span className="block text-xs font-normal">
                              {diff > 0 ? `Falta ${formatCurrency(diff)}` : `Sobra ${formatCurrency(-diff)}`}
                            </span>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                )}

                <button
                  onClick={handleConfirmPayment}
                  disabled={
                    payState.loading ||
                    (!payState.splitMode && !payState.method) ||
                    (!payState.splitMode && payState.method === 'cash' && !!payState.cashAmount && parseFloat(payState.cashAmount) < computeTotal(payState.order, payState.withTip!))
                  }
                  className="btn-primary w-full py-3 text-base disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {payState.loading ? 'Procesando...' : `Confirmar pago · ${formatCurrency(computeTotal(payState.order, payState.withTip!))}`}
                </button>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
