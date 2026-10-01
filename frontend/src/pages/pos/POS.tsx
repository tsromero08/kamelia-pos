import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../store/authStore'
import { productsApi, ordersApi, customersApi } from '../../services/api'
import { useCartStore } from '../../store/cartStore'
import { Product, ProductVariant, Customer, CartItem, Addon, DeliveryMode, CustomerType } from '../../types'
import { formatCurrency } from '../../utils/format'
import { ShoppingCart, X, Plus, Minus, Trash2, Search, User, SendHorizonal, ChevronRight, Gift, Truck, FileText } from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '../../components/ui/Modal'

function ProductImage({ product }: { product: Product }) {
  const [err, setErr] = useState(false)
  const src = product.image_url || '/images/hamburguesa-1.jpg'
  if (err) {
    return (
      <div className="w-full aspect-square rounded-xl mb-2 bg-gradient-to-br from-brand-900/50 to-dark-700 flex items-center justify-center">
        <span className="text-brand-400 text-4xl font-black">{product.name[0]}</span>
      </div>
    )
  }
  return (
    <div className="w-full aspect-square rounded-xl overflow-hidden mb-2 bg-dark-700">
      <img src={src} alt={product.name} className="w-full h-full object-cover" onError={() => setErr(true)} />
    </div>
  )
}

export default function POS() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { hasRole } = useAuthStore()
  const isMesero = hasRole('Mesero') && !hasRole('Administrador')
  const isAdmin = hasRole('Administrador')
  const { items, addItem, removeItem, updateQuantity, clearCart, setDiscount, discount, total, subtotal } = useCartStore()
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [showProductModal, setShowProductModal] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [pendingVariant, setPendingVariant] = useState<ProductVariant | null>(null)
  const [itemNotes, setItemNotes] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [orderType, setOrderType] = useState('dine_in')
  const [tableNumber, setTableNumber] = useState(() => searchParams.get('mesa') || '')
  const [placingOrder, setPlacingOrder] = useState(false)
  const [lastOrderNumber, setLastOrderNumber] = useState<string | null>(null)
  const [showCart, setShowCart] = useState(false)
  // Bloque 2: adiciones por item + cortesía
  const [selectedAddons, setSelectedAddons] = useState<Addon[]>([])
  const [showAddonsPanel, setShowAddonsPanel] = useState(false)
  const [customAddons, setCustomAddons] = useState<{ name: string; additional_price: number }[]>([])
  const [customAddonName, setCustomAddonName] = useState('')
  const [customAddonPrice, setCustomAddonPrice] = useState('')
  const [isCourtesy, setIsCourtesy] = useState(false)
  // Bloque 3: domicilios
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('none')
  const [deliveryFee, setDeliveryFee] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  // Bloque 4: datos fiscales del pedido
  const [showFiscalModal, setShowFiscalModal] = useState(false)
  const [customerType, setCustomerType] = useState<CustomerType>('natural')
  const [taxType, setTaxType] = useState('')
  const [taxId, setTaxId] = useState('')
  // Punto de cocción (cortes que lo requieren)
  const [cookingPoint, setCookingPoint] = useState<'none' | 'roja' | 'medio_roja' | 'medio' | 'tres_cuartos' | 'bien_hecha'>('none')

  const { data: addons = [] } = useQuery<Addon[]>({
    queryKey: ['addons'],
    queryFn: () => productsApi.addons().then(r => r.data),
    staleTime: 60000,
  })

  const toggleAddon = (a: Addon) => {
    setSelectedAddons(prev => prev.some(x => x.id === a.id)
      ? prev.filter(x => x.id !== a.id)
      : [...prev, a])
  }

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: () => productsApi.list().then(r => r.data),
  })

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => productsApi.categories().then(r => r.data),
  })

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ['customers', customerSearch],
    queryFn: () => customersApi.list(customerSearch).then(r => r.data),
    enabled: customerSearch.length > 1,
  })

  // Estado vivo de mesas (ocupadas, pendientes de pago) — refrescado cada 5s
  const { data: tablesStatus = {} } = useQuery<Record<string, { table_state: string; order_number: string }>>({
    queryKey: ['tables-status'],
    queryFn: () => ordersApi.tablesStatus().then(r => r.data),
    refetchInterval: 5000,
  })

  // Sincroniza la mesa cuando cambia el query param (?mesa=)
  useEffect(() => {
    const m = searchParams.get('mesa')
    if (m && m !== tableNumber) setTableNumber(m)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Detecta si la mesa actual tiene un pedido abierto → modo "agregar más"
  const existingOrderForTable = tableNumber ? (tablesStatus[tableNumber.trim()] as any) : null
  const isAppendMode = !!(existingOrderForTable && existingOrderForTable.order_id && existingOrderForTable.table_state !== 'pending_payment')

  const filtered = products.filter(p => {
    const matchCat = selectedCategory ? p.category_id === selectedCategory : true
    const matchSearch = search ? p.name.toLowerCase().includes(search.toLowerCase()) : true
    return matchCat && matchSearch && p.is_active
  })

  // Si tiene una sola variante activa y sin grupos de opciones → agregar directo
  const canQuickAdd = (product: Product) => {
    const activeVariants = product.variants.filter(v => v.is_active)
    return activeVariants.length === 1 && product.option_groups.length === 0
  }

  const openProductModal = (product: Product, variant?: ProductVariant) => {
    setSelectedProduct(product)
    setPendingVariant(variant || null)
    setItemNotes('')
    setSelectedAddons([])
    setShowAddonsPanel(false)
    setCustomAddons([])
    setCustomAddonName('')
    setCustomAddonPrice('')
    setShowProductModal(true)
  }

  const handleProductTap = (product: Product) => {
    if (canQuickAdd(product)) {
      // Abre el modal con la variante ya seleccionada para agregar observaciones
      openProductModal(product, product.variants.filter(v => v.is_active)[0])
    } else {
      openProductModal(product)
    }
  }

  const handleAddToCart = (product: Product, variant: ProductVariant, notes: string) => {
    // Convertir adiciones seleccionadas en modifiers tipo "extra"
    const addonModifiers = selectedAddons.map(a => ({
      inventory_item_id: a.inventory_item_id,
      modifier_type: 'extra' as const,
      name: `${a.icon ? a.icon + ' ' : ''}${a.name.replace(/^[^\w]*\s/, '')}`,
      quantity: Number(a.inventory_quantity || 0),
      additional_price: Number(a.additional_price || 0),
    }))
    // Custom "Otros" — adiciones escritas a mano por el mesero
    const customMods = customAddons.map(c => ({
      inventory_item_id: undefined,
      modifier_type: 'extra' as const,
      name: c.name,
      quantity: 0,
      additional_price: c.additional_price,
    }))
    const allMods = [...addonModifiers, ...customMods]
    // Punto de cocción obligatorio para cortes
    if (product.requires_cooking_point && cookingPoint === 'none') {
      toast.error('Selecciona el punto de cocción')
      return
    }
    addItem(product, variant, [], allMods, notes.trim() || undefined, cookingPoint)
    setShowProductModal(false)
    setPendingVariant(null)
    setItemNotes('')
    setSelectedAddons([])
    setCustomAddons([])
    setCustomAddonName('')
    setCustomAddonPrice('')
    setShowAddonsPanel(false)
    setCookingPoint('none')
    setShowCart(true)
    const extras = allMods.length > 0 ? ` (+${allMods.length} adición)` : ''
    toast.success(`${product.name}${extras} agregado`, { duration: 1200, position: 'bottom-center' })
  }

  const addCustomAddon = () => {
    const name = customAddonName.trim()
    if (!name) {
      toast.error('Escribe el nombre de la adición')
      return
    }
    const price = parseFloat(customAddonPrice) || 0
    setCustomAddons(prev => [...prev, { name, additional_price: price }])
    setCustomAddonName('')
    setCustomAddonPrice('')
  }

  const handlePlaceOrder = async () => {
    if (items.length === 0) { toast.error('El carrito está vacío'); return }
    if (orderType !== 'delivery' && !tableNumber.trim()) {
      toast.error('Ingresa el número de mesa')
      return
    }
    // Bloque 3: validar consistencia delivery
    if (orderType === 'delivery') {
      if (deliveryMode === 'none') {
        toast.error('Selecciona el modo de domicilio (Externo o Gestionado)')
        return
      }
      if (deliveryMode === 'managed' && (!deliveryFee || parseFloat(deliveryFee) <= 0)) {
        toast.error('Si el local cobra el envío, debes ingresar el valor del domicilio')
        return
      }
    }
    setPlacingOrder(true)
    try {
      // ── Mesa abierta — si ya hay pedido activo, agrego items a ese pedido ──
      if (isAppendMode && existingOrderForTable?.order_id) {
        const appendRes = await ordersApi.appendItems(existingOrderForTable.order_id, items.map(i => ({
          variant_id: i.variant.id,
          quantity: i.quantity,
          notes: i.notes,
          cooking_point: i.cooking_point || 'none',
          modifiers: i.modifiers.map(m => ({
            inventory_item_id: m.inventory_item_id || null,
            modifier_type: m.modifier_type,
            name: m.name,
            quantity: m.quantity,
            additional_price: m.additional_price,
          })),
          selected_options: i.selected_options.map(o => ({ option_id: o.option_id })),
        })))
        setLastOrderNumber(appendRes.data.order_number)
        setShowConfirmModal(false)
        setShowCart(false)
        clearCart()
        setTableNumber('')
        qc.invalidateQueries({ queryKey: ['tables-status'] })
        qc.invalidateQueries({ queryKey: ['caja-orders'] })
        toast.success(`✓ Items agregados a Mesa ${existingOrderForTable.table_number || ''}`, { duration: 3000 })
        if (isMesero) setTimeout(() => navigate('/admin/mesas'), 1200)
        return
      }
      const res = await ordersApi.create({
        customer_id: selectedCustomer?.id || null,
        order_type: orderType,
        table_number: tableNumber || null,
        discount,
        notes: null,
        // Bloque 2: cortesía
        is_courtesy: isCourtesy,
        // Bloque 3: domicilios
        delivery_mode: orderType === 'delivery' ? deliveryMode : 'none',
        delivery_fee: orderType === 'delivery' && deliveryMode === 'managed'
          ? parseFloat(deliveryFee) || 0 : 0,
        delivery_address: orderType === 'delivery' ? (deliveryAddress || null) : null,
        // Bloque 4: datos fiscales
        customer_type: customerType,
        tax_type: taxType || null,
        tax_id: taxId || null,
        items: items.map(i => ({
          variant_id: i.variant.id,
          quantity: i.quantity,
          notes: i.notes,
          cooking_point: i.cooking_point || 'none',
          modifiers: i.modifiers.map(m => ({
            inventory_item_id: m.inventory_item_id || null,
            modifier_type: m.modifier_type,
            name: m.name,
            quantity: m.quantity,
            additional_price: m.additional_price,
          })),
          selected_options: i.selected_options.map(o => ({ option_id: o.option_id })),
        })),
      })
      setLastOrderNumber(res.data.order_number)
      setShowConfirmModal(false)
      setShowCart(false)
      clearCart()
      setSelectedCustomer(null)
      setCustomerSearch('')
      setTableNumber('')
      setIsCourtesy(false)
      setDeliveryMode('none')
      setDeliveryFee('')
      setDeliveryAddress('')
      setCustomerType('natural')
      setTaxType('')
      setTaxId('')
      qc.invalidateQueries({ queryKey: ['caja-orders'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['tables-status'] })
      const tag = isCourtesy ? ' (CORTESÍA)' : ''
      toast.success(`✓ Pedido #${res.data.order_number}${tag} enviado a cocina`, { duration: 4000, position: 'bottom-center' })
      // Mesero: vuelve a la pantalla de mesas para tomar el siguiente pedido
      if (isMesero) setTimeout(() => navigate('/admin/mesas'), 1500)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg || 'Error al crear el pedido')
    } finally {
      setPlacingOrder(false)
    }
  }

  const cartCount = items.reduce((s, i) => s + i.quantity, 0)
  const needsTable = orderType !== 'delivery'

  return (
    <div className="flex h-full overflow-hidden relative">

      {/* ── Panel de productos ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Buscador + categorías */}
        <div className="p-3 md:p-4 border-b border-dark-600 bg-dark-800 space-y-2">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              className="input pl-9 text-sm h-10"
              placeholder="Buscar producto..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-3 py-1.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all flex-shrink-0 min-h-[34px] ${
                !selectedCategory ? 'bg-brand-600 text-white shadow-md' : 'bg-dark-700 text-gray-400 hover:text-white'
              }`}
            >
              Todos
            </button>
            {categories.map((cat: { id: number; name: string }) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all flex-shrink-0 min-h-[34px] ${
                  selectedCategory === cat.id ? 'bg-brand-600 text-white shadow-md' : 'bg-dark-700 text-gray-400 hover:text-white'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Grid de productos */}
        <div className="flex-1 overflow-y-auto p-3 md:p-4">
          {lastOrderNumber && (
            <div className="mb-3 bg-green-900/30 border border-green-700 rounded-xl p-3 flex items-center justify-between">
              <span className="text-green-400 font-semibold text-sm">✓ Pedido #{lastOrderNumber} enviado a cocina</span>
              <button onClick={() => setLastOrderNumber(null)} className="text-gray-500 hover:text-white p-1">
                <X size={14} />
              </button>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-2 md:gap-3">
            {filtered.map(product => {
              const quick = canQuickAdd(product)
              return (
                <button
                  key={product.id}
                  onClick={() => handleProductTap(product)}
                  className="bg-dark-800 border-2 border-dark-600 rounded-xl p-3 text-left hover:border-brand-500 hover:bg-dark-700 active:scale-95 transition-all group relative"
                >
                  <ProductImage product={product} />
                  <p className="font-bold text-white text-sm leading-tight group-hover:text-brand-400 transition-colors line-clamp-2">
                    {product.name}
                  </p>
                  <div className="mt-1.5 flex flex-col gap-0.5">
                    {product.variants.filter(v => v.is_active).map(v => (
                      <span key={v.id} className="text-xs text-gray-400">
                        {v.name !== 'Única' && v.name !== 'Sola' ? `${v.name}: ` : ''}
                        <span className="text-brand-400 font-bold">{formatCurrency(v.price)}</span>
                      </span>
                    ))}
                  </div>
                  {/* Indicador de "toca para agregar" */}
                  {quick && (
                    <div className="absolute top-2 right-2 w-6 h-6 bg-brand-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Plus size={12} className="text-white" />
                    </div>
                  )}
                  {!quick && (
                    <div className="absolute top-2 right-2 w-6 h-6 bg-dark-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <ChevronRight size={12} className="text-gray-400" />
                    </div>
                  )}
                </button>
              )
            })}
          </div>
          {filtered.length === 0 && (
            <div className="text-center py-12 text-gray-500">No se encontraron productos</div>
          )}
        </div>
      </div>

      {/* ── Botón flotante de carrito — solo móvil ────────────────── */}
      {cartCount > 0 && !showCart && (
        <button
          onClick={() => setShowCart(true)}
          className="md:hidden fixed bottom-20 right-4 z-30 bg-brand-600 text-white rounded-full w-16 h-16 flex items-center justify-center shadow-2xl shadow-brand-900/60 active:scale-95 transition-transform"
        >
          <div className="relative">
            <ShoppingCart size={24} />
            <span className="absolute -top-2 -right-2 bg-white text-brand-700 text-xs font-black rounded-full w-5 h-5 flex items-center justify-center">
              {cartCount}
            </span>
          </div>
        </button>
      )}

      {/* ── Panel del carrito — sidebar en desktop, overlay en móvil ── */}
      {/* Overlay móvil */}
      {showCart && (
        <div
          className="md:hidden fixed inset-0 bg-black/60 z-30"
          onClick={() => setShowCart(false)}
        />
      )}

      <div className={`
        fixed md:relative right-0 top-0 bottom-0 z-40
        w-80 md:w-80 bg-dark-800 border-l border-dark-600 flex flex-col
        transition-transform duration-300 ease-in-out
        ${showCart ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}
      `}>
        {/* Sección scrollable: configuración + items (todo junto para que el botón siempre quede visible) */}
        <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
        {/* Header carrito */}
        <div className="p-4 border-b border-dark-600 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ShoppingCart size={18} className="text-brand-400" />
              <span className="font-bold text-white">Pedido</span>
              {items.length > 0 && (
                <span className="bg-brand-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                  {cartCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {items.length > 0 && (
                <button onClick={clearCart} className="text-gray-500 hover:text-red-400 transition-colors text-xs">
                  Limpiar
                </button>
              )}
              <button onClick={() => setShowCart(false)} className="md:hidden text-gray-500 hover:text-white p-1">
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Cliente */}
          <div className="relative mb-2">
            <User size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              className="input pl-8 text-sm py-1.5 h-9"
              placeholder="Cliente (opcional)"
              value={customerSearch}
              onChange={e => setCustomerSearch(e.target.value)}
            />
          </div>
          {customers.length > 0 && customerSearch && !selectedCustomer && (
            <div className="mb-2 bg-dark-700 border border-dark-500 rounded-xl overflow-hidden">
              {customers.slice(0, 3).map((c: Customer) => (
                <button key={c.id}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-dark-600 transition-colors"
                  onClick={() => {
                    setSelectedCustomer(c)
                    setCustomerSearch(c.name)
                    // Bloque 4: autocompletar datos fiscales si el cliente los tiene
                    if (c.tax_id) setTaxId(c.tax_id)
                    if (c.tax_type) setTaxType(c.tax_type)
                    if (c.customer_type) setCustomerType(c.customer_type)
                    if (c.tax_id || c.tax_type) {
                      toast.success(`Datos fiscales de ${c.name} cargados`, { duration: 1500, position: 'bottom-center' })
                    }
                  }}>
                  <span className="text-white">{c.name}</span>
                  {c.phone && <span className="text-gray-500 text-xs ml-2">{c.phone}</span>}
                  {c.tax_id && <span className="text-blue-400 text-[10px] ml-2 font-mono">NIT {c.tax_id}</span>}
                </button>
              ))}
            </div>
          )}
          {selectedCustomer && (
            <div className="mb-2 flex items-center justify-between bg-brand-900/20 border border-brand-800 rounded-xl px-3 py-1.5">
              <span className="text-brand-400 text-xs font-medium">{selectedCustomer.name}</span>
              <button onClick={() => { setSelectedCustomer(null); setCustomerSearch('') }}>
                <X size={12} className="text-gray-500" />
              </button>
            </div>
          )}

          {/* Tipo de pedido */}
          <div className="flex gap-1 mb-2">
            {[
              { val: 'dine_in',  label: 'Mesa' },
              { val: 'takeaway', label: 'Llevar' },
              { val: 'delivery', label: 'Domicilio' },
            ].map(({ val, label }) => (
              <button key={val}
                onClick={() => {
                  setOrderType(val); setTableNumber('')
                  if (val !== 'delivery') { setDeliveryMode('none'); setDeliveryFee(''); setDeliveryAddress('') }
                }}
                className={`flex-1 text-xs py-2 rounded-xl font-semibold transition-all ${
                  orderType === val ? 'bg-brand-600 text-white' : 'bg-dark-700 text-gray-400 hover:text-white'
                }`}>
                {label}
              </button>
            ))}
          </div>

          {/* Bloque 3: Modo de domicilio (solo si orderType=delivery) */}
          {orderType === 'delivery' && (
            <div className="mb-2 bg-dark-900/60 rounded-xl p-2 border border-dark-600 space-y-2">
              <p className="text-gray-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                <Truck size={11} /> Modo del envío
              </p>
              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() => setDeliveryMode('external')}
                  className={`text-[11px] py-1.5 px-2 rounded-lg font-semibold transition-all ${
                    deliveryMode === 'external' ? 'bg-blue-600 text-white' : 'bg-dark-700 text-gray-400'
                  }`}
                >
                  Externo
                  <span className="block text-[9px] font-normal opacity-80">Cliente paga al repartidor</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDeliveryMode('managed')}
                  className={`text-[11px] py-1.5 px-2 rounded-lg font-semibold transition-all ${
                    deliveryMode === 'managed' ? 'bg-orange-600 text-white' : 'bg-dark-700 text-gray-400'
                  }`}
                >
                  Gestionado
                  <span className="block text-[9px] font-normal opacity-80">Local cobra envío</span>
                </button>
              </div>
              {deliveryMode === 'managed' && (
                <div>
                  <input
                    type="number"
                    className="input text-sm h-8 py-1"
                    placeholder="Valor del envío ($)"
                    value={deliveryFee}
                    onChange={e => setDeliveryFee(e.target.value)}
                  />
                  <p className="text-orange-400 text-[10px] mt-1">
                    ⚠ Se creará automáticamente un gasto "Domicilio" por {formatCurrency(parseFloat(deliveryFee) || 0)} al cobrar.
                  </p>
                </div>
              )}
              <input
                className="input text-sm h-8 py-1"
                placeholder="Dirección de entrega"
                value={deliveryAddress}
                onChange={e => setDeliveryAddress(e.target.value)}
              />
            </div>
          )}

          {/* Warning de cortesía + delivery managed */}
          {isCourtesy && orderType === 'delivery' && deliveryMode === 'managed' && parseFloat(deliveryFee) > 0 && (
            <div className="mb-2 bg-yellow-900/30 border border-yellow-700 rounded-lg p-2 text-yellow-300 text-[11px]">
              <strong>⚠ Cortesía con envío gestionado:</strong> el cliente no paga,
              pero el local pagará {formatCurrency(parseFloat(deliveryFee))} al repartidor.
              Esta acción queda registrada en el log de auditoría.
            </div>
          )}

          {/* Bloque 2: Cortesía (SOLO Admin) + Bloque 4: Datos fiscales */}
          <div className="flex items-center gap-2 mb-2">
            {isAdmin && (
              <button
                type="button"
                onClick={() => setIsCourtesy(v => !v)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all ${
                  isCourtesy
                    ? 'bg-pink-700/40 text-pink-300 border-2 border-pink-600'
                    : 'bg-dark-700 text-gray-400 border-2 border-dark-600 hover:text-white'
                }`}
              >
                <Gift size={12} />
                {isCourtesy ? 'Cortesía ✓' : 'Cortesía'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowFiscalModal(true)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all ${
                taxId || taxType
                  ? 'bg-blue-700/40 text-blue-300 border-2 border-blue-600'
                  : 'bg-dark-700 text-gray-400 border-2 border-dark-600 hover:text-white'
              }`}
            >
              <FileText size={12} />
              {taxId ? 'Datos fiscales ✓' : 'Datos fiscales'}
            </button>
          </div>

          {/* Mesa — badge compacto si ya hay mesa, selector solo si falta */}
          {needsTable && (
            <>
              {tableNumber.trim() ? (
                <div className={`flex items-center justify-between border-2 rounded-xl px-3 py-2 ${
                  isAppendMode
                    ? 'bg-orange-900/40 border-orange-500 animate-pulse'
                    : 'bg-brand-900/30 border-brand-600'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-9 h-9 rounded-lg flex items-center justify-center text-white font-black text-lg ${
                      isAppendMode ? 'bg-orange-600' : 'bg-brand-600'
                    }`}>
                      {tableNumber}
                    </span>
                    <div>
                      <p className="text-gray-400 text-[10px] font-bold uppercase">
                        {isAppendMode ? '⚠️ Mesa abierta — agregando' : 'Mesa'}
                      </p>
                      <p className="text-white text-sm font-bold leading-none">
                        N° {tableNumber}
                        {isAppendMode && existingOrderForTable?.order_number && (
                          <span className="text-orange-300 ml-2 text-xs font-mono">→ #{existingOrderForTable.order_number}</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTableNumber('')}
                    className="text-gray-500 hover:text-white text-xs underline"
                  >
                    Cambiar
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <span className="text-gray-400 text-[11px] font-bold uppercase tracking-wider block">
                    Selecciona mesa
                  </span>
                  <div className="grid grid-cols-5 gap-1.5">
                    {Array.from({ length: 10 }, (_, i) => String(i + 1)).map(n => {
                      const st = tablesStatus[n]?.table_state
                      const occupied = st === 'occupied' || st === 'pending_payment'
                      return (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setTableNumber(n)}
                          disabled={occupied}
                          title={
                            occupied
                              ? `Mesa ocupada · pedido ${tablesStatus[n]?.order_number || ''}`
                              : `Mesa ${n} disponible`
                          }
                          className={`h-10 rounded-lg text-sm font-black transition-all active:scale-95 ${
                            occupied
                              ? 'bg-red-900/30 text-red-400 border border-red-800 cursor-not-allowed'
                              : 'bg-dark-700 text-white border border-dark-500 hover:border-brand-500 hover:bg-dark-600'
                          }`}
                        >
                          {n}
                        </button>
                      )
                    })}
                  </div>
                  <input
                    className="input text-sm py-1.5 h-9 border-yellow-700 focus:border-yellow-500"
                    placeholder="O escribe otro número de mesa"
                    value={tableNumber}
                    onChange={e => setTableNumber(e.target.value)}
                  />
                  <p className="text-yellow-500 text-xs flex items-center gap-1">
                    ⚠ Número de mesa requerido para enviar
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Items del carrito (ya dentro del scroller padre) */}
        <div className="p-3 space-y-2">
          {items.length === 0 && (
            <div className="text-center py-12">
              <ShoppingCart size={36} className="text-gray-700 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">Toca un producto para agregarlo</p>
            </div>
          )}
          {items.map((item: CartItem) => (
            <div key={item.id} className="bg-dark-700 rounded-xl p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-semibold truncate">{item.product.name}</p>
                  {item.variant.name !== 'Única' && item.variant.name !== 'Sola' && (
                    <p className="text-gray-400 text-xs">{item.variant.name}</p>
                  )}
                  {item.modifiers.map((m, i) => (
                    <p key={i} className={`text-xs ${m.modifier_type === 'extra' ? 'text-green-400' : 'text-red-400'}`}>
                      {m.modifier_type === 'extra' ? '+' : '-'} {m.name}
                    </p>
                  ))}
                  {item.notes && (
                    <p className="text-yellow-400 text-xs mt-0.5 flex items-start gap-1">
                      <span className="flex-shrink-0">★</span>
                      <span>{item.notes}</span>
                    </p>
                  )}
                </div>
                <button onClick={() => removeItem(item.id)} className="text-gray-600 hover:text-red-400 transition-colors p-1">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => updateQuantity(item.id, item.quantity - 1)}
                    className="w-8 h-8 rounded-full bg-dark-600 hover:bg-dark-500 flex items-center justify-center transition-colors active:scale-90"
                  >
                    <Minus size={13} />
                  </button>
                  <span className="text-white text-sm w-6 text-center font-bold">{item.quantity}</span>
                  <button
                    onClick={() => updateQuantity(item.id, item.quantity + 1)}
                    className="w-8 h-8 rounded-full bg-dark-600 hover:bg-dark-500 flex items-center justify-center transition-colors active:scale-90"
                  >
                    <Plus size={13} />
                  </button>
                </div>
                <span className="text-brand-400 font-bold text-sm">{formatCurrency(item.unit_price * item.quantity)}</span>
              </div>
            </div>
          ))}
        </div>
        </div>{/* /scroller flex-1 */}

        {/* Totales y botón enviar — FIJOS abajo, siempre visibles */}
        {items.length > 0 && (
          <div className="p-4 border-t border-dark-600 space-y-2 flex-shrink-0 bg-dark-800">
            <div className="flex justify-between text-sm text-gray-400">
              <span>Subtotal</span><span>{formatCurrency(subtotal())}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400 flex-1">Descuento</span>
              <input
                type="number"
                className="input text-right text-sm py-1 h-8 w-24"
                value={discount || ''}
                onChange={e => setDiscount(parseFloat(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
            {orderType === 'delivery' && deliveryMode === 'managed' && parseFloat(deliveryFee) > 0 && (
              <div className="flex justify-between text-sm text-orange-400">
                <span>Envío (gestionado)</span>
                <span>+ {formatCurrency(parseFloat(deliveryFee) || 0)}</span>
              </div>
            )}
            {isCourtesy ? (
              <div className="flex justify-between text-white font-bold text-xl border-t border-pink-700 pt-2">
                <span className="flex items-center gap-1"><Gift size={18} /> CORTESÍA</span>
                <span className="text-pink-400">$0</span>
              </div>
            ) : (
              <div className="flex justify-between text-white font-bold text-xl border-t border-dark-600 pt-2">
                <span>TOTAL</span>
                <span className="text-brand-400">
                  {formatCurrency(
                    total() + (orderType === 'delivery' && deliveryMode === 'managed'
                      ? (parseFloat(deliveryFee) || 0) : 0)
                  )}
                </span>
              </div>
            )}
            <button
              onClick={() => setShowConfirmModal(true)}
              disabled={needsTable && !tableNumber.trim()}
              className="btn-primary w-full py-4 text-base flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl active:scale-95 transition-transform"
            >
              <SendHorizonal size={18} />
              Enviar a cocina
            </button>
          </div>
        )}
      </div>

      {/* Modal de selección de variante + observaciones */}
      {showProductModal && selectedProduct && (
        <Modal title={selectedProduct.name} onClose={() => { setShowProductModal(false); setPendingVariant(null); setItemNotes('') }}>
          {selectedProduct.image_url && (
            <div className="w-full h-36 rounded-xl overflow-hidden mb-4">
              <img src={selectedProduct.image_url} alt={selectedProduct.name} className="w-full h-full object-cover"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            </div>
          )}
          {selectedProduct.description && (
            <p className="text-gray-400 text-sm mb-4">{selectedProduct.description}</p>
          )}

          {/* Si no tiene variante preseleccionada, mostrar selector */}
          {!pendingVariant && (
            <div className="space-y-2 mb-4">
              <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">Selecciona</p>
              {selectedProduct.variants.filter(v => v.is_active).map(v => (
                <button
                  key={v.id}
                  onClick={() => setPendingVariant(v)}
                  className="w-full flex items-center justify-between bg-dark-700 hover:bg-dark-600 border-2 border-dark-500 hover:border-brand-500 rounded-xl p-4 transition-all active:scale-[0.98]"
                >
                  <span className="text-white font-bold text-base">
                    {v.name === 'Única' ? selectedProduct.name : v.name}
                  </span>
                  <span className="text-brand-400 font-black text-xl">{formatCurrency(v.price)}</span>
                </button>
              ))}
            </div>
          )}

          {/* Si ya tiene variante (única o preseleccionada) */}
          {pendingVariant && selectedProduct.variants.filter(v => v.is_active).length > 1 && (
            <div className="mb-4">
              <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">Seleccionado</p>
              <div className="flex items-center justify-between bg-brand-900/30 border-2 border-brand-600 rounded-xl p-3">
                <span className="text-white font-bold">{pendingVariant.name === 'Única' ? selectedProduct.name : pendingVariant.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-brand-400 font-black text-lg">{formatCurrency(pendingVariant.price)}</span>
                  <button onClick={() => setPendingVariant(null)} className="text-gray-500 hover:text-white p-1">
                    <X size={14} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Punto de cocción (cortes Rancho La Kamelia) */}
          {pendingVariant && selectedProduct.requires_cooking_point && (
            <div className="mb-4">
              <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">Punto de cocción *</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { v: 'roja', l: 'Roja' },
                  { v: 'medio_roja', l: 'Medio Roja' },
                  { v: 'medio', l: 'Medio' },
                  { v: 'tres_cuartos', l: 'Tres Cuartos' },
                  { v: 'bien_hecha', l: 'Bien Hecha' },
                ].map(p => (
                  <button
                    key={p.v}
                    onClick={() => setCookingPoint(p.v as any)}
                    className={`px-3 py-2 rounded-lg font-bold text-sm border-2 transition ${
                      cookingPoint === p.v
                        ? 'bg-red-700 border-red-500 text-white'
                        : 'bg-dark-700 border-dark-600 text-gray-300 hover:border-red-700'
                    }`}
                  >
                    {p.l}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Indicador AGOTADO */}
          {selectedProduct.is_sold_out && (
            <div className="mb-4 p-3 rounded-xl bg-red-950/40 border-2 border-red-700 text-red-300 text-center font-bold">
              ⚠️ Este producto está marcado como AGOTADO
            </div>
          )}

          {/* Adiciones — Bloque 2 (solo bajo demanda con botón) */}
          {pendingVariant && (
            <div className="mb-4">
              {!showAddonsPanel ? (
                <button
                  type="button"
                  onClick={() => setShowAddonsPanel(true)}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-brand-700 bg-brand-900/10 text-brand-300 hover:bg-brand-900/30 hover:border-brand-500 transition-all font-bold text-sm"
                >
                  <Plus size={16} /> Agregar adiciones
                  {(selectedAddons.length + customAddons.length) > 0 && (
                    <span className="ml-2 bg-brand-600 text-white text-[10px] font-black rounded-full px-2 py-0.5">
                      {selectedAddons.length + customAddons.length}
                    </span>
                  )}
                </button>
              ) : (
                <div className="border-2 border-brand-700 rounded-xl p-3 bg-dark-900/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-brand-300 text-xs font-bold uppercase tracking-wider">Adiciones disponibles</p>
                    <button
                      type="button"
                      onClick={() => setShowAddonsPanel(false)}
                      className="text-gray-500 hover:text-white text-xs underline"
                    >
                      Ocultar
                    </button>
                  </div>

                  {addons.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {addons.map(a => {
                        const selected = selectedAddons.some(s => s.id === a.id)
                        const hasInventory = !!a.inventory_item_id && Number(a.inventory_quantity) > 0
                        return (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => toggleAddon(a)}
                            title={hasInventory
                              ? `Descontará ${a.inventory_quantity} unidad(es) del insumo vinculado al cobrar`
                              : 'Adición sin vínculo de inventario'}
                            className={`flex flex-col items-stretch px-3 py-2 rounded-xl border-2 transition-all text-left ${
                              selected
                                ? 'border-green-500 bg-green-900/30 text-white'
                                : 'border-dark-500 bg-dark-700 text-gray-300 hover:border-brand-600'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold truncate flex-1">{a.name}</span>
                              <span className={`text-xs font-bold ml-2 ${selected ? 'text-green-300' : 'text-brand-400'}`}>
                                +{formatCurrency(a.additional_price)}
                              </span>
                            </div>
                            {hasInventory && (
                              <span className="text-[9px] uppercase tracking-wider text-blue-400 mt-1">📦 descuenta inv.</span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-xs italic text-center py-2">No hay adiciones predefinidas. Usa "Otros" abajo.</p>
                  )}

                  {/* Botón "Otros" — adición manual */}
                  <div className="border-t border-dark-600 pt-3">
                    <p className="text-yellow-300 text-[11px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1">
                      <Plus size={11} /> Otros · adición manual
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="input flex-1 text-sm py-1.5 h-9"
                        placeholder="Nombre (ej. salsa BBQ)"
                        value={customAddonName}
                        onChange={e => setCustomAddonName(e.target.value)}
                        maxLength={80}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomAddon() } }}
                      />
                      <input
                        type="number"
                        className="input text-sm py-1.5 h-9 w-24 text-right"
                        placeholder="$0"
                        value={customAddonPrice}
                        onChange={e => setCustomAddonPrice(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomAddon() } }}
                      />
                      <button
                        type="button"
                        onClick={addCustomAddon}
                        className="bg-yellow-600 hover:bg-yellow-500 text-white font-bold rounded-lg px-3 text-sm"
                      >
                        +
                      </button>
                    </div>
                    {customAddons.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {customAddons.map((c, i) => (
                          <div key={i} className="flex items-center justify-between bg-yellow-900/20 border border-yellow-800 rounded-lg px-2 py-1">
                            <span className="text-yellow-200 text-xs flex-1 truncate">
                              {c.name} {c.additional_price > 0 && <span className="text-yellow-400">· +{formatCurrency(c.additional_price)}</span>}
                            </span>
                            <button
                              type="button"
                              onClick={() => setCustomAddons(prev => prev.filter((_, j) => j !== i))}
                              className="text-gray-500 hover:text-red-400 p-1"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {(selectedAddons.length + customAddons.length) > 0 && (
                    <p className="text-green-400 text-xs font-semibold text-center pt-1 border-t border-dark-600">
                      ✓ {selectedAddons.length + customAddons.length} adición(es) · +{formatCurrency(
                        selectedAddons.reduce((s, a) => s + Number(a.additional_price), 0) +
                        customAddons.reduce((s, c) => s + c.additional_price, 0)
                      )}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Campo de observaciones — siempre visible */}
          {pendingVariant && (
            <>
              <div className="mb-4">
                <label className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2 block">
                  Observaciones para cocina <span className="text-gray-600 normal-case">(opcional)</span>
                </label>
                <textarea
                  className="input w-full text-sm resize-none"
                  rows={3}
                  placeholder="Ej: sin cebolla, término 3/4, extra salsa, alergia a mariscos..."
                  value={itemNotes}
                  onChange={e => setItemNotes(e.target.value)}
                  maxLength={200}
                />
                {itemNotes && (
                  <p className="text-gray-600 text-xs mt-1 text-right">{itemNotes.length}/200</p>
                )}
              </div>

              <button
                onClick={() => handleAddToCart(selectedProduct, pendingVariant, itemNotes)}
                className="btn-primary w-full py-4 text-base rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-transform"
              >
                <Plus size={18} />
                Agregar al pedido
                <span className="text-brand-200 font-normal ml-1">
                  · {formatCurrency(
                    Number(pendingVariant.price) +
                    selectedAddons.reduce((s, a) => s + Number(a.additional_price), 0) +
                    customAddons.reduce((s, c) => s + c.additional_price, 0)
                  )}
                </span>
              </button>
            </>
          )}
        </Modal>
      )}

      {/* Modal de datos fiscales — Bloque 4 */}
      {showFiscalModal && (
        <Modal title="Datos de facturación" onClose={() => setShowFiscalModal(false)} size="sm">
          <div className="space-y-3">
            <p className="text-gray-400 text-xs">
              Opcional · si se ingresa, aparecerá en la factura.
            </p>
            <div>
              <label className="label text-xs">Tipo de persona</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {(['natural', 'juridica'] as CustomerType[]).map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setCustomerType(v)}
                    className={`py-2 rounded-lg text-sm font-semibold transition-all ${
                      customerType === v ? 'bg-brand-600 text-white' : 'bg-dark-700 text-gray-400'
                    }`}
                  >
                    {v === 'natural' ? 'Natural' : 'Jurídica'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label text-xs">NIT / Cédula</label>
              <input
                className="input"
                placeholder="123456789"
                value={taxId}
                onChange={e => setTaxId(e.target.value)}
              />
            </div>
            <div>
              <label className="label text-xs">Tipo de contribuyente</label>
              <select
                className="input"
                value={taxType}
                onChange={e => setTaxType(e.target.value)}
              >
                <option value="">— Sin especificar —</option>
                <option value="No responsable">No responsable de IVA</option>
                <option value="Responsable IVA">Responsable de IVA</option>
                <option value="Régimen Simple">Régimen Simple</option>
                <option value="Gran contribuyente">Gran contribuyente</option>
                <option value="Autorretenedor">Autorretenedor</option>
              </select>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { setTaxId(''); setTaxType(''); setCustomerType('natural'); setShowFiscalModal(false) }}
                className="btn-secondary flex-1"
              >
                Limpiar
              </button>
              <button onClick={() => setShowFiscalModal(false)} className="btn-primary flex-1">
                Guardar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal de confirmación de pedido */}
      {showConfirmModal && (() => {
        const deliveryAdd = orderType === 'delivery' && deliveryMode === 'managed'
          ? (parseFloat(deliveryFee) || 0) : 0
        const finalTotal = isCourtesy ? 0 : (total() + deliveryAdd)
        return (
          <Modal title="Confirmar pedido" onClose={() => setShowConfirmModal(false)} size="sm">
            <div className="space-y-4">
              {tableNumber && (
                <div className="bg-brand-900/20 border border-brand-700 rounded-xl p-3 text-center">
                  <p className="text-brand-400 font-black text-xl">Mesa {tableNumber}</p>
                </div>
              )}
              {orderType === 'delivery' && (
                <div className="bg-orange-900/20 border border-orange-700 rounded-xl p-3 text-center">
                  <p className="text-orange-300 text-xs uppercase tracking-widest font-bold">🛵 Domicilio</p>
                  <p className="text-white text-sm font-semibold mt-1">
                    {deliveryMode === 'managed'
                      ? `Gestionado · envío ${formatCurrency(parseFloat(deliveryFee) || 0)}`
                      : deliveryMode === 'external' ? 'Repartidor externo' : 'Sin modo definido'}
                  </p>
                  {deliveryAddress && (
                    <p className="text-gray-400 text-xs mt-1 truncate">{deliveryAddress}</p>
                  )}
                </div>
              )}
              <div className="bg-dark-700 rounded-xl p-4">
                <p className="text-gray-400 text-xs mb-2 font-semibold uppercase tracking-wider">Resumen</p>
                {items.map(item => (
                  <div key={item.id} className="flex justify-between text-sm text-white py-1.5 border-b border-dark-600 last:border-0">
                    <span className="flex-1 pr-2 break-words">
                      {item.quantity}× {item.product.name}
                      {item.variant.name !== 'Única' && item.variant.name !== 'Sola' ? ` (${item.variant.name})` : ''}
                    </span>
                    <span className="text-brand-400 font-semibold whitespace-nowrap">{formatCurrency(item.unit_price * item.quantity)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm text-gray-400 mt-2 pt-2 border-t border-dark-600">
                  <span>Subtotal</span><span>{formatCurrency(subtotal())}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-sm text-red-400">
                    <span>Descuento</span><span>-{formatCurrency(discount)}</span>
                  </div>
                )}
                {deliveryAdd > 0 && (
                  <div className="flex justify-between text-sm text-orange-400">
                    <span>Envío gestionado</span><span>+{formatCurrency(deliveryAdd)}</span>
                  </div>
                )}
                <div className="flex justify-between font-black text-white text-lg mt-2 pt-2 border-t border-dark-500">
                  <span>{isCourtesy ? 'CORTESÍA' : 'Total'}</span>
                  <span className={isCourtesy ? 'text-pink-400' : 'text-brand-400'}>{formatCurrency(finalTotal)}</span>
                </div>
              </div>
              <p className="text-gray-500 text-xs text-center">
                El pedido se envía a cocina. El cobro se hace desde <strong className="text-white">Caja</strong>.
              </p>
              <button
                onClick={handlePlaceOrder}
                disabled={placingOrder}
                className="btn-primary w-full py-4 text-base flex items-center justify-center gap-2 rounded-xl active:scale-95 transition-transform disabled:opacity-50"
              >
                <SendHorizonal size={18} />
                {placingOrder ? 'Enviando...' : 'Confirmar y enviar'}
              </button>
            </div>
          </Modal>
        )
      })()}
    </div>
  )
}
