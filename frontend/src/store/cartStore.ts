import { create } from 'zustand'
import { CartItem, Product, ProductVariant } from '../types'

interface CartState {
  items: CartItem[]
  discount: number
  addItem: (product: Product, variant: ProductVariant, options?: CartItem['selected_options'], modifiers?: CartItem['modifiers'], notes?: string, cooking_point?: CartItem['cooking_point']) => void
  removeItem: (id: string) => void
  updateQuantity: (id: string, qty: number) => void
  clearCart: () => void
  setDiscount: (d: number) => void
  total: () => number
  subtotal: () => number
}

const uuid = () => Math.random().toString(36).slice(2)

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  discount: 0,

  addItem: (product, variant, options = [], modifiers = [], notes, cooking_point) => {
    const unit_price = variant.price
      + (options || []).reduce((s, o) => s + o.additional_price, 0)
      + (modifiers || []).filter(m => m.modifier_type === 'extra').reduce((s, m) => s + m.additional_price, 0)

    set(state => ({
      items: [...state.items, {
        id: uuid(),
        product,
        variant,
        quantity: 1,
        unit_price,
        selected_options: options || [],
        modifiers: modifiers || [],
        notes,
        cooking_point: cooking_point || 'none',
      }]
    }))
  },

  removeItem: (id) => set(state => ({ items: state.items.filter(i => i.id !== id) })),

  updateQuantity: (id, qty) => set(state => ({
    items: qty <= 0
      ? state.items.filter(i => i.id !== id)
      : state.items.map(i => i.id === id ? { ...i, quantity: qty } : i)
  })),

  clearCart: () => set({ items: [], discount: 0 }),
  setDiscount: (d) => set({ discount: d }),

  subtotal: () => get().items.reduce((s, i) => s + i.unit_price * i.quantity, 0),
  total: () => {
    const sub = get().subtotal()
    return Math.max(0, sub - get().discount)
  },
}))
