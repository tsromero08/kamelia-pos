import React, { Component, ErrorInfo, ReactNode } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import App from './App'
import './index.css'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('App error:', error, info) }
  render() {
    if (this.state.error) {
      const err = this.state.error as Error
      const msg = `${err.name || 'Error'}: ${err.message || '(sin mensaje)'}`
      const full = `${msg}\n\n${err.stack || ''}`
      const copy = () => navigator.clipboard.writeText(full).then(() => alert('Copiado!'))
      return (
        <div style={{ minHeight: '100vh', background: '#0f0f0f', padding: 32, fontFamily: 'monospace' }}>
          <div style={{ maxWidth: 800, margin: '0 auto' }}>
            <div style={{ background: '#7f1d1d', border: '2px solid #ef4444', borderRadius: 8, padding: '16px 20px', marginBottom: 16 }}>
              <div style={{ color: '#fca5a5', fontSize: 11, marginBottom: 4 }}>MENSAJE DEL ERROR (copia esto):</div>
              <div style={{ color: '#ffffff', fontSize: 16, fontWeight: 'bold', wordBreak: 'break-all' }}>{msg}</div>
            </div>
            <button onClick={copy} style={{ marginBottom: 12, background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Copiar todo el error
            </button>
            <textarea readOnly value={full}
              style={{ display: 'block', width: '100%', height: 200, background: '#1a1a1a', color: '#fca5a5', border: '1px solid #3a3a3a', borderRadius: 6, padding: 10, fontSize: 11, resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30000 },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toaster position="top-right" toastOptions={{
          style: { background: '#1a1a1a', color: '#fff', border: '1px solid #3a3a3a' },
          success: { iconTheme: { primary: '#f97316', secondary: '#fff' } },
        }} />
      </BrowserRouter>
    </QueryClientProvider>
  </ErrorBoundary>,
)

// ── Registro del Service Worker (PWA — funciona en WiFi local sin internet) ──
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('SW registration failed:', err)
    })
  })
}
