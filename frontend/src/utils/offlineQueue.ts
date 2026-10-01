/**
 * Cola offline para pedidos del POS.
 * Cuando POST /api/v1/orders falla por red, el pedido se guarda en
 * IndexedDB y se reintenta al recuperar conexión.
 *
 * Diseñado para WiFi local del rancho: si el servidor parpadea 10-30s,
 * el mesero NO pierde el pedido — queda en su celular y se sincroniza solo.
 */

const DB_NAME = 'kamelia-offline'
const DB_VERSION = 1
const STORE_NAME = 'pending-orders'

interface PendingOrder {
  id?: number
  payload: unknown
  created_at: number
  attempts: number
  last_error?: string
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true })
      }
    }
  })
}

export async function enqueueOrder(payload: unknown): Promise<number> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.add({ payload, created_at: Date.now(), attempts: 0 } as PendingOrder)
    req.onsuccess = () => resolve(req.result as number)
    req.onerror = () => reject(req.error)
  })
}

export async function pendingOrders(): Promise<PendingOrder[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const req = store.getAll()
    req.onsuccess = () => resolve(req.result as PendingOrder[])
    req.onerror = () => reject(req.error)
  })
}

export async function removeOrder(id: number): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function bumpAttempt(id: number, error: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const getReq = store.get(id)
    getReq.onsuccess = () => {
      const item = getReq.result as PendingOrder
      if (item) {
        item.attempts++
        item.last_error = error
        store.put(item)
      }
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/**
 * Procesa la cola: intenta enviar los pedidos pendientes uno por uno.
 * Llamar al recuperar conexión (event 'online' o ping exitoso).
 */
export async function flushQueue(token: string | null): Promise<{ sent: number; failed: number }> {
  const list = await pendingOrders()
  let sent = 0, failed = 0
  for (const p of list) {
    if (!p.id) continue
    try {
      const res = await fetch('/api/v1/orders/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(p.payload),
      })
      if (res.ok) {
        await removeOrder(p.id)
        sent++
      } else {
        await bumpAttempt(p.id, `HTTP ${res.status}`)
        failed++
      }
    } catch (e: any) {
      await bumpAttempt(p.id, e?.message || 'network')
      failed++
    }
  }
  return { sent, failed }
}

export async function queueSize(): Promise<number> {
  const list = await pendingOrders()
  return list.length
}
