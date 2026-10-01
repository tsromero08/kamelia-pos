export type StationKey =
  | 'neveras' | 'parrilla' | 'sudados' | 'fritos'
  | 'emplatamiento' | 'entradas' | 'sopas' | 'barra'

export type QueueType = 'principal' | 'entradas' | 'sopas' | 'bebidas'

export type CookingPoint =
  | 'none' | 'roja' | 'medio_roja' | 'medio' | 'tres_cuartos' | 'bien_hecha'

export const COOKING_LABEL: Record<CookingPoint, string> = {
  none: '—',
  roja: 'Roja',
  medio_roja: 'Medio Roja',
  medio: 'Medio',
  tres_cuartos: 'Tres Cuartos',
  bien_hecha: 'Bien Hecha',
}

export interface KitchenStation {
  id: number
  key: StationKey
  display_name: string
  color: string
  max_concurrent: number
  is_active: boolean
  sort_order: number
}

export interface TotalsRow {
  product_name: string
  variant_name: string
  cooking_point: CookingPoint
  pending_qty: number
  in_prep_qty: number
  total_qty: number
  earliest_due_at?: string
  longest_wait_seconds: number
  source_station?: string  // solo emplatamiento
}

export interface StationTotals {
  station_key: string
  station_name: string
  color: string
  rows: TotalsRow[]
  orders_in_queue: number
  orders_in_prep: number
  generated_at: string
}

export interface StationItem {
  item_station_id: number
  order_id: number
  order_number: string
  table_number?: string
  product_name: string
  variant_name: string
  quantity: number
  cooking_point: CookingPoint
  notes?: string
  status: 'queued' | 'in_prep' | 'ready' | 'dispatched'
  enqueued_at: string
  waiting_seconds: number
  estimated_minutes: number
}

export interface NeverasItem {
  order_item_id: number
  variant_id: number
  product_name: string
  variant_name: string
  quantity: number
  cooking_point: CookingPoint
  target_station: StationKey
  notes?: string
}

export interface NeverasOrder {
  order_id: number
  order_number: string
  table_number?: string
  created_at: string
  waiting_seconds: number
  items: NeverasItem[]
  status: 'queued' | 'in_prep' | 'ready'
}

export interface DispatchAssignment {
  queue_id: number | null
  order_id?: number
  order_number?: string
  table_number?: string
  queue_type?: QueueType
  items?: Array<{
    order_item_id: number
    product_name: string
    variant_name: string
    quantity: number
    cooking_point: CookingPoint
    notes?: string
    kitchen_section: string
  }>
  assigned_at?: string
  waiting_seconds?: number
  message?: string
}
