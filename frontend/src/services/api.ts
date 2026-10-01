import axios from 'axios'
import { enqueueOrder } from '../utils/offlineQueue'

const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
  timeout: 12000,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
      return Promise.reject(error)
    }
    // ── Offline queue para crear pedidos (Rancho La Kamelia, WiFi local) ──
    // Si el POST de un pedido falla por red/timeout, lo guardamos en
    // IndexedDB y devolvemos una respuesta "offline" simulada.
    const cfg = error.config
    const isNetworkError = !error.response
    const isOrderCreate = cfg && cfg.method === 'post' && (cfg.url || '').includes('/orders')
    if (isNetworkError && isOrderCreate) {
      try {
        const payload = cfg.data ? JSON.parse(cfg.data) : null
        if (payload) {
          await enqueueOrder(payload)
          const fakeNum = 'OFFLINE-' + Date.now().toString(36).toUpperCase()
          return Promise.resolve({
            data: { order_number: fakeNum, offline: true, message: 'Pedido guardado offline, se enviará al recuperar conexión.' },
            status: 202,
            statusText: 'queued-offline',
            headers: {},
            config: cfg,
          })
        }
      } catch (e) {
        console.error('Offline queue failed:', e)
      }
    }
    return Promise.reject(error)
  }
)

export default api

// Auth
export const authApi = {
  login: (email: string, password: string) => api.post('/auth/login', { email, password }),
  me: () => api.get('/auth/me'),
  verifySpecialCode: (code: string, action?: string) =>
    api.post('/auth/verify-special-code', { code, action }),
  changeSpecialCode: (current_code: string, new_code: string) =>
    api.post('/auth/change-special-code', { current_code, new_code }),
}

// System (licensing, vendor info)
export const systemApi = {
  license: () => api.get('/system/license'),
  info: () => api.get('/system/info'),
}

// Products
export const productsApi = {
  list: (activeOnly = true) => api.get(`/products/?active_only=${activeOnly}`),
  get: (id: number) => api.get(`/products/${id}`),
  create: (data: unknown) => api.post('/products/', data),
  update: (id: number, data: unknown) => api.put(`/products/${id}`, data),
  delete: (id: number) => api.delete(`/products/${id}`),
  categories: () => api.get('/products/categories'),
  createCategory: (data: unknown) => api.post('/products/categories', data),
  uploadImage: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post('/products/upload-image', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  addVariant: (productId: number, data: unknown) => api.post(`/products/${productId}/variants`, data),
  updateVariant: (variantId: number, data: unknown) => api.put(`/products/variants/${variantId}`, data),
  createOptionGroup: (productId: number, data: unknown) => api.post(`/products/${productId}/option-groups`, data),
  // Addons (adiciones rápidas — Bloque 2)
  addons: (activeOnly = true) => api.get('/products/addons', { params: { active_only: activeOnly } }),
  createAddon: (data: unknown) => api.post('/products/addons', data),
  updateAddon: (id: number, data: unknown) => api.put(`/products/addons/${id}`, data),
  deleteAddon: (id: number) => api.delete(`/products/addons/${id}`),
}

// Inventory
export const inventoryApi = {
  items: () => api.get('/inventory/items'),
  getItem: (id: number) => api.get(`/inventory/items/${id}`),
  createItem: (data: unknown) => api.post('/inventory/items', data),
  updateItem: (id: number, data: unknown) => api.put(`/inventory/items/${id}`, data),
  lowStock: () => api.get('/inventory/items/low-stock'),
  movements: (itemId: number) => api.get(`/inventory/items/${itemId}/movements`),
  adjust: (data: unknown) => api.post('/inventory/adjustments', data),
  units: () => api.get('/inventory/units'),
  suppliers: () => api.get('/inventory/suppliers'),
  createSupplier: (data: unknown) => api.post('/inventory/suppliers', data),
  // Lotes y vencimientos
  batches: (params?: { item_id?: number; include_depleted?: boolean }) =>
    api.get('/inventory/batches', { params }),
  batchAlerts: (days = 7) => api.get('/inventory/batches/alerts', { params: { days } }),
  createBatch: (data: unknown) => api.post('/inventory/batches', data),
  deleteBatch: (id: number) => api.delete(`/inventory/batches/${id}`),
}

// Audit logs
export const auditApi = {
  list: (params?: { user_id?: number; action?: string; entity_type?: string; days?: number; limit?: number; offset?: number }) =>
    api.get('/audit-logs', { params }),
}

// Cash sessions
export const cashApi = {
  current: () => api.get('/cash-sessions/current'),
  open: (data: { initial_cash: number; opening_notes?: string }) => api.post('/cash-sessions/open', data),
  close: (data: { counted_cash: number; closing_notes?: string }) => api.post('/cash-sessions/close', data),
  history: (limit = 50) => api.get('/cash-sessions/history', { params: { limit } }),
  byId: (id: number) => api.get(`/cash-sessions/${id}`),
}

// Recipes
export const recipesApi = {
  list: () => api.get('/recipes/'),
  get: (id: number) => api.get(`/recipes/${id}`),
  byVariant: (variantId: number) => api.get(`/recipes/by-variant/${variantId}`),
  create: (data: unknown) => api.post('/recipes/', data),
  update: (id: number, data: unknown) => api.put(`/recipes/${id}`, data),
  comboComponents: () => api.get('/recipes/combo-components'),
  createComboComponent: (data: unknown) => api.post('/recipes/combo-components', data),
  deleteComboComponent: (id: number) => api.delete(`/recipes/combo-components/${id}`),
}

// Orders
export const ordersApi = {
  list: (status?: string) => api.get('/orders/', { params: status ? { status } : {} }),
  invoices: () => api.get('/orders/invoices'),
  get: (id: number) => api.get(`/orders/${id}`),
  create: (data: unknown) => api.post('/orders/', data),
  pay: (id: number, data: unknown) => api.post(`/orders/${id}/pay`, data),
  updateStatus: (id: number, data: unknown) => api.patch(`/orders/${id}/status`, data),
  kitchen: () => api.get('/orders/kitchen'),
  tablesStatus: () => api.get('/orders/tables/status'),
  edit: (id: number, data: unknown) => api.patch(`/orders/${id}`, data),
  // Mesa abierta — agregar más items a un pedido existente
  appendItems: (id: number, items: unknown[]) => api.post(`/orders/${id}/items`, { items }),
}

// Customers
export const customersApi = {
  list: (search = '') => api.get('/customers/', { params: { search } }),
  get: (id: number) => api.get(`/customers/${id}`),
  create: (data: unknown) => api.post('/customers/', data),
  update: (id: number, data: unknown) => api.put(`/customers/${id}`, data),
}

// Purchases
export const purchasesApi = {
  list: () => api.get('/purchases/'),
  create: (data: unknown) => api.post('/purchases/', data),
  update: (id: number, data: unknown) => api.put(`/purchases/${id}`, data),
  delete: (id: number) => api.delete(`/purchases/${id}`),
}

// Expenses
export const expensesApi = {
  list: (params?: unknown) => api.get('/expenses/', { params }),
  categories: () => api.get('/expenses/categories'),
  create: (data: unknown) => api.post('/expenses/', data),
  update: (id: number, data: unknown) => api.put(`/expenses/${id}`, data),
  delete: (id: number) => api.delete(`/expenses/${id}`),
  createCategory: (data: unknown) => api.post('/expenses/categories', data),
}

// Reports
export const reportsApi = {
  dashboard: () => api.get('/reports/dashboard'),
  financialSummary: (params?: unknown) => api.get('/reports/financial-summary', { params }),
  monthlyComparison: (months = 6) => api.get('/reports/monthly-comparison', { params: { months } }),
  profitability: () => api.get('/reports/profitability'),
  salesByProduct: (params?: unknown) => api.get('/reports/sales-by-product', { params }),
  salesByPayment: (params?: unknown) => api.get('/reports/sales-by-payment-method', { params }),
  dailyPreview: (day?: string) => api.get('/reports/daily-preview', { params: day ? { day } : {} }),
  closeDay: (data: { notes?: string }, day?: string) => api.post('/reports/close-day', data, { params: day ? { day } : {} }),
  dailyHistory: (limit = 90) => api.get('/reports/daily-history', { params: { limit } }),
  schedulerStatus: () => api.get('/reports/scheduler-status'),
  exportDaily: (fmt: 'pdf' | 'xlsx', day?: string) =>
    api.get(`/reports/export/daily/${fmt}`, { params: day ? { day } : {}, responseType: 'blob' }),
  exportSalesByProduct: (fmt: 'pdf' | 'xlsx', params?: { start_date?: string; end_date?: string }) =>
    api.get(`/reports/export/sales-by-product/${fmt}`, { params, responseType: 'blob' }),
  exportSalesByPayment: (fmt: 'pdf' | 'xlsx', params?: { start_date?: string; end_date?: string }) =>
    api.get(`/reports/export/sales-by-payment/${fmt}`, { params, responseType: 'blob' }),
  exportFinancial: (fmt: 'pdf' | 'xlsx', params?: { start_date?: string; end_date?: string }) =>
    api.get(`/reports/export/financial/${fmt}`, { params, responseType: 'blob' }),
}

/** Dispara una descarga del blob recibido del servidor. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    URL.revokeObjectURL(url)
    a.remove()
  }, 100)
}

// Users
export const usersApi = {
  list: () => api.get('/users/'),
  create: (data: unknown) => api.post('/users/', data),
  update: (id: number, data: unknown) => api.put(`/users/${id}`, data),
  roles: () => api.get('/users/roles'),
}

// Losses
export const lossesApi = {
  list: () => api.get('/losses/'),
  create: (data: unknown) => api.post('/losses/', data),
}

// Notifications
export const notificationsApi = {
  get: () => api.get('/notifications/'),
}

// ─── Kitchen (estaciones del Rancho La Kamelia) ────────────────────────
export const kitchenApi = {
  stations: () => api.get('/kitchen/stations'),
  updateStation: (id: number, data: unknown) => api.patch(`/kitchen/stations/${id}`, data),
  totals: (stationKey: string) => api.get(`/kitchen/stations/${stationKey}/totals`),
  items: (stationKey: string, limit = 100) => api.get(`/kitchen/stations/${stationKey}/items`, { params: { limit } }),
  neverasQueue: () => api.get('/kitchen/neveras/queue'),
  completeNeveras: (orderId: number) => api.post(`/kitchen/neveras/orders/${orderId}/complete`),
  itemInPrep: (itemStationId: number) => api.post(`/kitchen/items/${itemStationId}/in-prep`),
  itemReady: (itemStationId: number) => api.post(`/kitchen/items/${itemStationId}/ready`),
  getProductConfig: (productId: number) => api.get(`/kitchen/products/${productId}/config`),
  setProductConfig: (productId: number, data: unknown) => api.put(`/kitchen/products/${productId}/config`, data),
  toggleSoldOut: (productId: number) => api.post(`/kitchen/products/${productId}/toggle-sold-out`),
}

// ─── Dispatch (4 colas: principal, entradas, sopas, bebidas) ───────────
export const dispatchApi = {
  list: (queueType: string) => api.get(`/dispatch/${queueType}/list`),
  myAssignment: (queueType: string) => api.get(`/dispatch/${queueType}/my-assignment`),
  send: (queueId: number, notes?: string) => api.post(`/dispatch/${queueId}/send`, { notes }),
  shifts: (queueType?: string) => api.get('/dispatch/shifts', { params: queueType ? { queue_type: queueType } : {} }),
  setShift: (data: { user_id: number; queue_type: string; is_active: boolean }) =>
    api.post('/dispatch/shifts', data),
}
