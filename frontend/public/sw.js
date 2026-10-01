/**
 * Service Worker para Rancho La Kamelia.
 * Estrategia:
 *   - App shell + assets estáticos → cache-first
 *   - /api/* → network-first con fallback a cache (solo GET)
 *   - POSTs (crear pedido) NO se interceptan; el cliente los encola
 *     en IndexedDB cuando hay error de red (ver offlineQueue.ts).
 *   - /ws/* nunca pasa por SW.
 *
 * Objetivo: que el sistema funcione en WiFi local del rancho aunque
 * el backend tenga latencia o caídas de 5-10 segundos.
 */
const CACHE_NAME = 'kamelia-v1'
const SHELL_CACHE = 'kamelia-shell-v1'
const API_CACHE = 'kamelia-api-v1'

const SHELL_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logos/logo.jpg',
]

// Install: pre-cache del shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_FILES)).catch(() => null)
  )
  self.skipWaiting()
})

// Activate: limpiar caches viejos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => ![SHELL_CACHE, API_CACHE, CACHE_NAME].includes(k))
            .map((k) => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

// Fetch handler
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // No interceptar WebSockets ni cross-origin
  if (url.origin !== location.origin) return
  if (url.pathname.startsWith('/ws/')) return

  // POST/PUT/DELETE — siempre red, sin cache. Los errores los maneja la app.
  if (request.method !== 'GET') return

  // API: network-first con fallback al cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // Sólo cachear respuestas OK
          if (res.ok) {
            const clone = res.clone()
            caches.open(API_CACHE).then((c) => c.put(request, clone))
          }
          return res
        })
        .catch(() => caches.match(request).then((r) => r || new Response(
          JSON.stringify({ offline: true, error: 'sin_conexion_servidor' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        )))
    )
    return
  }

  // Assets: cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((res) => {
        if (res.ok && res.type === 'basic') {
          const clone = res.clone()
          caches.open(CACHE_NAME).then((c) => c.put(request, clone))
        }
        return res
      }).catch(() => {
        // Navegación SPA → fallback al index cacheado
        if (request.mode === 'navigate') {
          return caches.match('/index.html')
        }
        return new Response('offline', { status: 503 })
      })
    })
  )
})

// Mensaje desde el cliente para forzar update
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting()
})
