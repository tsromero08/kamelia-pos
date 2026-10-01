export interface Role {
  id: number
  name: string
  description?: string
}

export interface User {
  id: number
  name: string
  email: string
  phone?: string
  role_id: number
  is_active: boolean
  role?: Role
}

export interface Category {
  id: number
  name: string
  description?: string
  sort_order: number
  is_active: boolean
}

export interface ProductOption {
  id: number
  group_id: number
  name: string
  additional_price: number
  is_active: boolean
}

export interface ProductOptionGroup {
  id: number
  product_id: number
  name: string
  description?: string
  is_required: boolean
  min_selections: number
  max_selections: number
  options: ProductOption[]
}

export interface ProductVariant {
  id: number
  product_id: number
  name: string
  price: number
  is_combo: boolean
  is_active: boolean
  sort_order: number
}

export interface Product {
  id: number
  name: string
  description?: string
  category_id: number
  product_type: string
  image_url?: string
  is_active: boolean
  has_combo: boolean
  preparation_time_min?: number
  sort_order: number
  category?: Category
  variants: ProductVariant[]
  option_groups: ProductOptionGroup[]
  // Kitchen routing (Rancho La Kamelia)
  kitchen_section?: string
  requires_neveras?: boolean
  requires_cooking_point?: boolean
  is_sold_out?: boolean
}

export interface InventoryItem {
  id: number
  name: string
  description?: string
  unit_id: number
  current_stock: number
  minimum_stock: number
  current_cost: number
  is_active: boolean
  is_low_stock: boolean
  unit?: { id: number; name: string; abbreviation: string }
  preferred_supplier?: { id: number; name: string }
}

export interface RecipeItem {
  id: number
  recipe_id: number
  inventory_item_id: number
  quantity: number
  is_optional: boolean
  deduct_if_removed: boolean
}

export interface Recipe {
  id: number
  variant_id: number
  notes?: string
  is_active: boolean
  items: RecipeItem[]
  estimated_cost?: number
}

export interface Customer {
  id: number
  name: string
  phone?: string
  email?: string
  address?: string
  notes?: string
  tax_id?: string
  tax_type?: string
  customer_type?: CustomerType
}

export type OrderStatus = 'pending' | 'in_preparation' | 'ready' | 'delivered' | 'cancelled'
export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'digital_wallet' | 'nequi' | 'daviplata' | 'courtesy' | 'mixed' | 'other'
export type OrderType = 'dine_in' | 'takeaway' | 'delivery' | 'whatsapp'
export type DeliveryMode = 'none' | 'external' | 'managed'
export type CustomerType = 'natural' | 'juridica'

export interface Addon {
  id: number
  name: string
  additional_price: number
  inventory_item_id?: number
  inventory_quantity: number
  icon?: string
  is_active: boolean
  sort_order: number
}

export interface PaymentSplit {
  id: number
  payment_method: PaymentMethod
  amount: number
  reference?: string
}

export interface OrderItemModifier {
  id: number
  modifier_type: 'extra' | 'remove'
  name: string
  quantity: number
  additional_price: number
}

export interface OrderItem {
  id: number
  variant_id: number
  quantity: number
  unit_price: number
  subtotal: number
  notes?: string
  modifiers: OrderItemModifier[]
  selected_options: { id: number; option_id: number; additional_price: number }[]
}

export interface Payment {
  id: number
  invoice_number?: string
  payment_method: PaymentMethod
  amount: number
  change_given: number
  reference?: string
  is_split?: boolean
  splits?: PaymentSplit[]
}

export interface Order {
  id: number
  order_number: string
  customer_id?: number
  cashier_id?: number
  status: OrderStatus
  order_type: OrderType
  subtotal: number
  discount: number
  tax: number
  total: number
  notes?: string
  table_number?: string
  delivery_address?: string
  is_courtesy?: boolean
  delivery_mode?: DeliveryMode
  delivery_fee?: number
  customer_type?: CustomerType
  tax_type?: string
  tax_id?: string
  items: OrderItem[]
  payment?: Payment
  customer?: { id: number; name: string; phone?: string; email?: string }
  created_at: string
  updated_at?: string
  preparation_started_at?: string
}

export interface DashboardMetrics {
  today_sales: number
  today_orders: number
  month_sales: number
  month_orders: number
  month_purchases: number
  month_expenses: number
  month_estimated_cogs: number
  month_gross_profit: number
  month_net_profit: number
  month_gross_margin_pct: number
  month_net_margin_pct: number
  prev_month_sales: number
  prev_month_net_profit: number
  sales_growth_pct: number
  profit_growth_pct: number
  top_product?: string
  top_product_qty: number
  low_stock_items: number
  today_courtesies?: number
  month_delivery_cost?: number
}

export interface MonthlyComparison {
  year: number
  month: number
  month_name: string
  total_sales: number
  total_orders: number
  avg_ticket: number
  estimated_cogs: number
  total_purchases: number
  total_expenses: number
  gross_profit: number
  net_profit: number
  gross_margin_pct: number
  net_margin_pct: number
}

export interface ProductProfitability {
  product_id: number
  product_name: string
  variant_id: number
  variant_name: string
  price: number
  estimated_cost: number
  estimated_margin: number
  margin_pct: number
  units_sold: number
  total_revenue: number
  total_profit: number
}

export interface FinancialSummary {
  period_start: string
  period_end: string
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
  cost_participation_pct: number
  expense_participation_pct: number
  is_profitable: boolean
  analysis_text: string[]
  total_courtesies?: number
  total_delivery_cost?: number
}

export interface Expense {
  id: number
  category_id: number
  description: string
  amount: number
  payment_method: string
  expense_date: string
  notes?: string
  category?: { id: number; name: string }
}

export interface ExpenseCategory {
  id: number
  name: string
  description?: string
}

export interface Purchase {
  id: number
  purchase_number: string
  supplier_id?: number
  total: number
  notes?: string
  purchase_date: string
  items: PurchaseItem[]
}

export interface PurchaseItem {
  id: number
  inventory_item_id: number
  quantity: number
  unit_cost: number
  total_cost: number
}

// Cart types (frontend only)
export interface CartItemModifier {
  inventory_item_id?: number
  modifier_type: 'extra' | 'remove'
  name: string
  quantity: number
  additional_price: number
}

export interface CartItem {
  id: string // local uuid
  variant: ProductVariant
  product: Product
  quantity: number
  unit_price: number
  selected_options: { option_id: number; name: string; additional_price: number }[]
  modifiers: CartItemModifier[]
  notes?: string
  cooking_point?: 'none' | 'roja' | 'medio_roja' | 'medio' | 'tres_cuartos' | 'bien_hecha'
}
