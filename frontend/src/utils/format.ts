export const formatCurrency = (value: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value)

/**
 * Parsea un ISO timestamp del backend respetando UTC.
 * El backend envía datetimes "naive" en UTC ("2026-05-15T03:49:14" SIN 'Z').
 * Si los pasamos directo a `new Date(...)` el navegador los interpreta como
 * hora LOCAL, lo que produce desfases de ~5h en Colombia (UTC-5) y rompe los
 * cronómetros de cocina. Si falta el indicador de zona, asumimos UTC.
 */
export function parseServerDate(iso: string | null | undefined): Date {
  if (!iso) return new Date(NaN)
  const hasTZ = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso)
  return new Date(hasTZ ? iso : iso + 'Z')
}

export const formatDate = (dateStr: string) =>
  parseServerDate(dateStr).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })

export const formatDateTime = (dateStr: string) =>
  parseServerDate(dateStr).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export const orderTypeLabel: Record<string, string> = {
  dine_in: 'Mesa',
  takeaway: 'Para llevar',
  delivery: 'Domicilio',
  whatsapp: 'WhatsApp',
}

export const paymentMethodLabel: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  digital_wallet: 'Billetera digital',
  nequi: 'Nequi',
  daviplata: 'Daviplata',
  courtesy: 'Cortesía',
  mixed: 'Pago dividido',
  other: 'Otro',
}

export const deliveryModeLabel: Record<string, string> = {
  none: 'Sin domicilio',
  external: 'Domicilio externo',
  managed: 'Domicilio gestionado',
}

export const customerTypeLabel: Record<string, string> = {
  natural: 'Persona natural',
  juridica: 'Persona jurídica',
}
