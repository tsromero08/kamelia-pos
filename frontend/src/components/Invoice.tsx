import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Printer, X, CheckCircle } from 'lucide-react'
import { formatCurrency, orderTypeLabel, paymentMethodLabel } from '../utils/format'
import { BRANDING } from '../config/branding'

export interface InvoiceItem {
  productName: string
  variantName: string
  quantity: number
  unitPrice: number
  subtotal: number
  basePrice?: number  // precio del producto sin extras (unitario)
  options: { name: string; additional_price?: number }[]
  modifiers: { type: 'extra' | 'remove'; name: string; additional_price?: number }[]
  notes?: string
}

export interface InvoiceSplit {
  payment_method: string
  amount: number
}

export interface InvoiceData {
  invoiceNumber?: string
  orderNumber: string
  orderType: string
  tableNumber?: string
  cashierName?: string
  items: InvoiceItem[]
  subtotal: number
  discount: number
  tip?: number
  total: number
  paymentMethod: string
  amountPaid: number
  change: number
  createdAt: string
  // Bloque 2: cortesía
  isCourtesy?: boolean
  // Bloque 3: domicilios
  deliveryMode?: 'none' | 'external' | 'managed'
  deliveryFee?: number
  deliveryAddress?: string
  // Bloque 4: split + datos fiscales
  splits?: InvoiceSplit[]
  customerType?: 'natural' | 'juridica'
  taxType?: string
  taxId?: string
  customerName?: string
  customerPhone?: string
}

interface Props {
  data: InvoiceData
  onClose: () => void
}

/* ─── Portal: renders #invoice-print directly into document.body ─────────
   This ensures the print CSS can reach it regardless of React tree depth.
────────────────────────────────────────────────────────────────────────── */
function PrintPortal({ data, dateStr, timeStr }: {
  data: InvoiceData; dateStr: string; timeStr: string
}) {
  const elRef = useRef<HTMLDivElement | null>(null)

  if (!elRef.current) {
    elRef.current = document.createElement('div')
    elRef.current.id = 'invoice-print'
    // Invisible on screen — revealed only by print CSS
    elRef.current.style.cssText = 'position:absolute;left:-9999px;top:-9999px;visibility:hidden;'
  }

  useEffect(() => {
    document.body.appendChild(elRef.current!)
    return () => {
      if (document.body.contains(elRef.current!)) {
        document.body.removeChild(elRef.current!)
      }
    }
  }, [])

  return createPortal(
    <ReceiptContent data={data} dateStr={dateStr} timeStr={timeStr} />,
    elRef.current
  )
}

/* ─── Main component ───────────────────────────────────────────────────── */
export default function Invoice({ data, onClose }: Props) {
  // Use actual print time (now) so the receipt matches the real payment moment
  const now = new Date()
  const dateStr = now.toLocaleDateString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
  const timeStr = now.toLocaleTimeString('es-CO', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })

  const handlePrint = () => {
    const prev = document.title
    document.title = `Pedido-${data.orderNumber}`
    window.print()
    document.title = prev
  }

  // Atajo F3 = imprimir automáticamente sin tener que hacer click
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F3') {
        e.preventDefault()
        handlePrint()
      }
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      {/* Portal writes #invoice-print directly to body */}
      <PrintPortal data={data} dateStr={dateStr} timeStr={timeStr} />

      {/* Screen overlay — hidden on print via print:hidden Tailwind class */}
      <div className="print:hidden fixed inset-0 bg-black/80 z-50 flex flex-col items-center justify-center p-4 overflow-y-auto">
        {/* Action bar */}
        <div className="flex items-center gap-3 mb-4 w-full max-w-sm">
          <div className="flex items-center gap-2">
            <CheckCircle size={18} className="text-green-400" />
            <span className="font-semibold text-white text-sm">
              {data.invoiceNumber ? `Factura ${data.invoiceNumber}` : `Pedido #${data.orderNumber}`} registrado
            </span>
          </div>
          <div className="ml-auto flex gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold px-4 py-2 rounded-lg transition-colors text-sm"
              title="Imprimir (F3)"
            >
              <Printer size={15} />
              Imprimir <kbd className="ml-1 text-[10px] bg-brand-800 px-1.5 py-0.5 rounded">F3</kbd>
            </button>
            <button
              onClick={onClose}
              className="flex items-center gap-2 bg-dark-600 hover:bg-dark-500 text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm"
            >
              <X size={15} />
              Cerrar
            </button>
          </div>
        </div>

        {/* Screen preview (white receipt on dark bg) */}
        <div className="w-full max-w-sm bg-white text-black rounded-xl shadow-2xl overflow-hidden">
          <ReceiptContent data={data} dateStr={dateStr} timeStr={timeStr} />
        </div>

        <p className="text-gray-600 text-xs mt-3">
          Vista previa — pulsa <kbd className="px-1.5 py-0.5 rounded bg-dark-700 text-gray-300 text-[11px] font-mono">F3</kbd> para imprimir directamente
        </p>
      </div>
    </>
  )
}

/* ─── Receipt visual content (shared between screen and print) ────────── */
function ReceiptContent({ data, dateStr, timeStr }: {
  data: InvoiceData; dateStr: string; timeStr: string
}) {
  const typeLabel = orderTypeLabel[data.orderType] || data.orderType
  const itemsTotal = data.items.reduce((s, i) => s + i.subtotal, 0)
  const tip = data.tip || 0
  const tipPct = data.subtotal > 0 ? Math.round((tip / data.subtotal) * 100) : 0

  return (
    <div className="font-mono text-xs text-black bg-white">
      {/* Header empresa */}
      <div className="text-center py-4 px-4 border-b border-dashed border-gray-300">
        <img
          src={BRANDING.logoPath}
          alt={BRANDING.name}
          className="h-16 mx-auto mb-2 object-contain"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
        <h1 className="font-black text-base uppercase tracking-wider">{BRANDING.name}</h1>
        <p className="text-[11px] text-gray-700 mt-0.5">NIT: {BRANDING.nit}</p>
        <p className="text-[11px] text-gray-700">Tel: {BRANDING.phone}</p>
      </div>

      {/* Mesa destacada (si aplica) */}
      {data.tableNumber && (
        <div className="text-center py-2 px-4 border-b border-dashed border-gray-300 bg-gray-50">
          <p className="text-[10px] text-gray-500 uppercase tracking-widest">Mesa</p>
          <p className="font-black text-3xl leading-none">N° {data.tableNumber}</p>
        </div>
      )}

      {/* Cortesía destacada — Bloque 2 */}
      {data.isCourtesy && (
        <div className="text-center py-2 px-4 border-b-2 border-dashed border-pink-500 bg-pink-50">
          <p className="font-black text-base tracking-wider text-pink-700">★ CORTESÍA ★</p>
          <p className="text-[10px] text-gray-600 mt-0.5">Pedido sin cobro — descuento de inventario aplicado</p>
        </div>
      )}

      {/* Domicilio destacado — Bloque 3 */}
      {data.deliveryMode && data.deliveryMode !== 'none' && (
        <div className="text-center py-2 px-4 border-b border-dashed border-gray-300 bg-orange-50">
          <p className="text-[10px] text-orange-700 uppercase tracking-widest font-bold">
            {data.deliveryMode === 'managed' ? 'Domicilio gestionado por el local' : 'Domicilio externo'}
          </p>
          {data.deliveryAddress && (
            <p className="text-[11px] text-gray-700 mt-0.5">{data.deliveryAddress}</p>
          )}
        </div>
      )}

      {/* Invoice number & order info */}
      <div className="px-4 py-3 border-b border-dashed border-gray-300 space-y-0.5">
        {data.invoiceNumber && (
          <div className="text-center mb-2 border-2 border-black rounded px-2 py-1 bg-gray-50">
            <p className="text-xs text-gray-500 uppercase tracking-widest">Factura N°</p>
            <p className="font-black text-xl tracking-wider">{data.invoiceNumber}</p>
          </div>
        )}
        <div className="text-center mb-1">
          <p className="text-xs text-gray-400 uppercase tracking-widest">Pedido</p>
          <p className="font-semibold text-sm tracking-wide text-gray-600">{data.orderNumber}</p>
        </div>
        <InfoRow label="Fecha" value={dateStr} />
        <InfoRow label="Hora" value={timeStr} />
        {data.cashierName && <InfoRow label="Cajero" value={data.cashierName} />}
        <InfoRow label="Tipo" value={typeLabel} />
      </div>

      {/* Datos fiscales del cliente — Bloque 4 */}
      {(data.taxId || data.customerName || data.taxType || data.customerPhone) && (
        <div className="px-4 py-2 border-b border-dashed border-gray-300 space-y-0.5 bg-blue-50/30">
          <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Datos de facturación</p>
          {data.customerName && <InfoRow label="Cliente" value={data.customerName} bold />}
          {data.taxId && <InfoRow label="NIT / Cédula" value={data.taxId} />}
          {data.customerPhone && <InfoRow label="Teléfono" value={data.customerPhone} />}
          {data.customerType && (
            <InfoRow
              label="Tipo persona"
              value={data.customerType === 'juridica' ? 'Jurídica' : 'Natural'}
            />
          )}
          {data.taxType && <InfoRow label="Contribuyente" value={data.taxType} />}
        </div>
      )}

      {/* Items con costos detallados */}
      <div className="px-3 py-3 border-b border-dashed border-gray-300">
        <p className="font-bold uppercase text-gray-500 tracking-widest text-[10px] mb-2">
          Productos · detalle
        </p>
        {data.items.map((item, i) => {
          const extras = item.modifiers.filter(m => m.type === 'extra')
          const removed = item.modifiers.filter(m => m.type === 'remove')
          const extrasTotal = extras.reduce((s, e) => s + (Number(e.additional_price) || 0), 0)
          const optionsTotal = item.options.reduce((s, o) => s + (Number(o.additional_price) || 0), 0)
          const basePrice = item.basePrice !== undefined
            ? item.basePrice
            : Math.max(0, item.unitPrice - extrasTotal - optionsTotal)
          const baseLine = basePrice * item.quantity
          return (
            <div key={i} className="mb-2.5 last:mb-0">
              {/* Línea principal del producto: nombre con cantidad y precio del producto base */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-bold leading-snug break-words">
                    <span className="inline-block bg-gray-100 px-1.5 py-0.5 rounded text-[11px] font-black mr-1">{item.quantity}×</span>
                    {item.productName}
                    {item.variantName && !['Única', 'Sola'].includes(item.variantName) && (
                      <span className="text-gray-600 font-normal"> · {item.variantName}</span>
                    )}
                  </p>
                </div>
                <span className="font-bold whitespace-nowrap tabular-nums text-right">
                  {formatCurrency(baseLine)}
                </span>
              </div>

              {/* Opciones seleccionadas (con precio si aplica) */}
              {item.options.map((opt, j) => (
                <div key={j} className="flex justify-between pl-5 text-[11px] text-gray-700">
                  <span className="flex-1 pr-2 break-words">→ {opt.name}</span>
                  {Number(opt.additional_price) > 0 && (
                    <span className="whitespace-nowrap tabular-nums">+ {formatCurrency(Number(opt.additional_price) * item.quantity)}</span>
                  )}
                </div>
              ))}

              {/* Extras con precio individual */}
              {extras.map((mod, j) => (
                <div key={j} className="flex justify-between pl-5 text-[11px] text-green-800">
                  <span className="flex-1 pr-2 break-words">+ {mod.name}</span>
                  {Number(mod.additional_price) > 0 ? (
                    <span className="whitespace-nowrap tabular-nums font-semibold">
                      {formatCurrency(Number(mod.additional_price) * item.quantity)}
                    </span>
                  ) : (
                    <span className="whitespace-nowrap text-gray-500 italic">sin costo</span>
                  )}
                </div>
              ))}

              {/* Quitados (sin costo) */}
              {removed.map((mod, j) => (
                <div key={j} className="pl-5 text-[11px] text-red-700">
                  − Sin {mod.name}
                </div>
              ))}

              {item.notes && (
                <div className="pl-5 text-[11px] text-yellow-800 italic break-words">★ {item.notes}</div>
              )}

              {/* Subtotal del item si tiene extras (para que cuadre con total) */}
              {(extras.length > 0 || optionsTotal > 0) && (
                <div className="flex justify-between pl-5 mt-0.5 text-[11px] border-t border-dotted border-gray-300 pt-0.5">
                  <span className="text-gray-500 italic">Subtotal del producto</span>
                  <span className="font-bold tabular-nums">{formatCurrency(item.subtotal)}</span>
                </div>
              )}
            </div>
          )
        })}
        <div className="border-t border-gray-300 pt-1.5 mt-1.5 flex justify-between text-[11px]">
          <span className="text-gray-600 font-semibold">Suma productos</span>
          <span className="font-bold tabular-nums">{formatCurrency(itemsTotal)}</span>
        </div>
      </div>

      {/* Totales con desglose explícito */}
      <div className="px-4 py-3 border-b border-dashed border-gray-300 space-y-0.5">
        <InfoRow label="Subtotal" value={formatCurrency(data.subtotal)} />
        {data.discount > 0 && (
          <div className="flex justify-between text-red-700">
            <span>Descuento aplicado</span>
            <span>-{formatCurrency(data.discount)}</span>
          </div>
        )}
        {/* Envío gestionado — Bloque 3 */}
        {data.deliveryMode === 'managed' && (data.deliveryFee || 0) > 0 && (
          <div className="flex justify-between text-orange-700 bg-orange-50 -mx-1 px-1 rounded">
            <span>Envío (gestionado)</span>
            <span>+{formatCurrency(data.deliveryFee || 0)}</span>
          </div>
        )}
        {tip > 0 ? (
          <div className="flex justify-between text-gray-700 bg-yellow-50 -mx-1 px-1 rounded">
            <span>Servicio voluntario ({tipPct}%)</span>
            <span>+{formatCurrency(tip)}</span>
          </div>
        ) : (
          <div className="flex justify-between text-gray-500 italic">
            <span>Servicio</span>
            <span>No aplicado</span>
          </div>
        )}
        <div className="flex justify-between font-black text-base border-t-2 border-black pt-1 mt-1">
          <span>{data.isCourtesy ? 'VALOR DE REFERENCIA' : 'TOTAL A PAGAR'}</span>
          <span>{data.isCourtesy ? formatCurrency(data.subtotal) : formatCurrency(data.total)}</span>
        </div>
        {data.isCourtesy && (
          <div className="flex justify-between font-black text-base text-pink-700 mt-1">
            <span>COBRADO</span>
            <span>$0 (CORTESÍA)</span>
          </div>
        )}
      </div>

      {/* Payment */}
      <div className="px-4 py-3 border-b border-dashed border-gray-300 space-y-0.5">
        <InfoRow
          label="Forma de pago"
          value={paymentMethodLabel[data.paymentMethod] || data.paymentMethod}
          bold
        />
        {/* Desglose del pago dividido — Bloque 4 */}
        {data.splits && data.splits.length > 0 && (
          <div className="mt-1 pl-2 border-l-2 border-gray-300 space-y-0.5">
            <p className="text-[10px] text-gray-500 uppercase tracking-widest">Desglose</p>
            {data.splits.map((s, i) => (
              <div key={i} className="flex justify-between text-[11px]">
                <span className="text-gray-600">
                  {i + 1}. {paymentMethodLabel[s.payment_method] || s.payment_method}
                </span>
                <span className="font-semibold">{formatCurrency(s.amount)}</span>
              </div>
            ))}
          </div>
        )}
        {data.paymentMethod === 'cash' && data.amountPaid > 0 && (
          <>
            <InfoRow label="Efectivo recibido" value={formatCurrency(data.amountPaid)} />
            <InfoRow label="Cambio" value={formatCurrency(Math.max(0, data.change))} bold />
          </>
        )}
      </div>

      {/* Aviso legal del 10% de propina — Rancho La Kamelia (texto del menú) */}
      <div className="px-4 py-3 border-t border-dashed border-gray-300 text-[9px] text-gray-600 leading-tight italic">
        Se informa a los consumidores que este establecimiento sugiere un 10%
        de propina del valor de la cuenta, el cual podrá ser aceptado, rechazado
        o modificado por el cliente de acuerdo a su valoración del servicio
        prestado. Al solicitar la cuenta, indique si quiere que dicho valor sea
        o no agregado a la factura, o indique el monto que desea dar como propina.
      </div>

      {/* Footer */}
      <div className="text-center px-4 py-4 text-gray-500">
        <p className="font-black text-black text-sm mb-1">¡Gracias por tu visita!</p>
        <p className="font-bold">{BRANDING.name}</p>
        <p className="text-[10px] mt-1">NIT {BRANDING.nit} · Tel {BRANDING.phone}</p>
        <p className="text-[9px] mt-2 italic">¡Sabor, parrilla y un buen trago... así se vive el Rancho!</p>
        <p className="text-[9px]">Música en vivo y caballos · fines de semana cada hora</p>
        <p className="text-[9px]">rancholakamelia.com</p>
      </div>

      {/* Marca Software Titanova */}
      <div className="text-center px-4 pb-3 text-[10px] text-gray-500 border-t border-dashed border-gray-300 pt-2">
        <div className="flex items-center justify-center gap-1.5 mb-0.5">
          <img src="/logos/logo-titanova.png" alt="" className="h-5 w-5 object-contain" />
          <p className="font-bold text-black">Software Titanova · 3013896861</p>
        </div>
        <p className="italic">Soluciones inteligentes, negocios en movimiento</p>
      </div>
    </div>
  )
}

function InfoRow({
  label, value, bold = false,
}: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between text-gray-600">
      <span>{label}</span>
      <span className={bold ? 'font-semibold text-black' : ''}>{value}</span>
    </div>
  )
}
