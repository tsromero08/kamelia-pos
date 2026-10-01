import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { cashApi } from '../../services/api'
import { formatCurrency, parseServerDate } from '../../utils/format'
import { Banknote, LogIn, LogOut, History, AlertTriangle, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '../../components/ui/Modal'
import { useAuthStore } from '../../store/authStore'

interface Session {
  id: number
  cashier_id: number
  cashier_name?: string
  opened_at?: string
  closed_at?: string
  initial_cash: number
  counted_cash?: number
  expected_cash?: number
  discrepancy?: number
  status: 'open' | 'closed'
  opening_notes?: string
  closing_notes?: string
  cash_sales?: number
  total_sales?: number
  payment_count?: number
  change_given?: number
}

const fmtDT = (s?: string) => s
  ? parseServerDate(s).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  : '—'

export default function CashSessions() {
  const qc = useQueryClient()
  const { hasRole } = useAuthStore()
  const isAdmin = hasRole('Administrador')
  const [showOpen, setShowOpen] = useState(false)
  const [showClose, setShowClose] = useState(false)
  const [openForm, setOpenForm] = useState({ initial_cash: '', opening_notes: '' })
  const [closeForm, setCloseForm] = useState({ counted_cash: '', closing_notes: '' })

  const { data: current } = useQuery<Session | null>({
    queryKey: ['cash-session-current'],
    queryFn: () => cashApi.current().then(r => r.data),
    refetchInterval: 15000,
  })

  const { data: history = [] } = useQuery<Session[]>({
    queryKey: ['cash-sessions-history'],
    queryFn: () => cashApi.history(50).then(r => r.data),
  })

  const handleOpen = async () => {
    const initial = parseFloat(openForm.initial_cash)
    if (isNaN(initial) || initial < 0) {
      toast.error('Base inicial inválida')
      return
    }
    try {
      await cashApi.open({ initial_cash: initial, opening_notes: openForm.opening_notes || undefined })
      toast.success('Caja abierta')
      setShowOpen(false)
      setOpenForm({ initial_cash: '', opening_notes: '' })
      qc.invalidateQueries({ queryKey: ['cash-session-current'] })
      qc.invalidateQueries({ queryKey: ['cash-sessions-history'] })
    } catch (err: unknown) {
      const d = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(d || 'Error al abrir caja')
    }
  }

  const handleClose = async () => {
    const counted = parseFloat(closeForm.counted_cash)
    if (isNaN(counted) || counted < 0) {
      toast.error('Conteo inválido')
      return
    }
    try {
      await cashApi.close({ counted_cash: counted, closing_notes: closeForm.closing_notes || undefined })
      toast.success('Caja cerrada')
      setShowClose(false)
      setCloseForm({ counted_cash: '', closing_notes: '' })
      qc.invalidateQueries({ queryKey: ['cash-session-current'] })
      qc.invalidateQueries({ queryKey: ['cash-sessions-history'] })
    } catch (err: unknown) {
      const d = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(d || 'Error al cerrar caja')
    }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Banknote size={22} className="text-brand-400" />
            Apertura y cierre de caja
          </h1>
          <p className="text-gray-500 text-sm">Control de turnos · base inicial · conteo al cierre · discrepancias</p>
        </div>
      </div>

      {/* Sesión actual */}
      {current ? (
        <div className="card border-green-700 bg-green-900/10">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <p className="text-green-400 text-xs uppercase tracking-widest font-bold flex items-center gap-1">
                <CheckCircle size={12} /> Caja abierta · Sesión #{current.id}
              </p>
              <p className="text-white text-lg font-bold mt-1">{current.cashier_name}</p>
              <p className="text-gray-500 text-xs">Abierta: {fmtDT(current.opened_at)}</p>
              {current.opening_notes && <p className="text-gray-400 text-xs mt-1 italic">"{current.opening_notes}"</p>}
            </div>
            <button onClick={() => {
              setCloseForm({ counted_cash: '', closing_notes: '' })
              setShowClose(true)
            }} className="btn-danger flex items-center gap-2">
              <LogOut size={16} /> Cerrar caja
            </button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
            <Box label="Base inicial" value={formatCurrency(Number(current.initial_cash))} />
            <Box label="Ventas en efectivo" value={formatCurrency(Number(current.cash_sales || 0))} sub={`${current.payment_count || 0} pagos`} />
            <Box label="Cambio entregado" value={formatCurrency(Number(current.change_given || 0))} />
            <Box label="Efectivo esperado en caja" value={formatCurrency(Number(current.expected_cash || 0))} accent="text-brand-400" />
          </div>
        </div>
      ) : (
        <div className="card text-center py-10">
          <Banknote size={48} className="text-gray-700 mx-auto mb-3" />
          <p className="text-white font-bold">No tienes una caja abierta</p>
          <p className="text-gray-500 text-sm mb-4">Abre caja con la base inicial para empezar a cobrar.</p>
          <button onClick={() => setShowOpen(true)} className="btn-primary inline-flex items-center gap-2">
            <LogIn size={16} /> Abrir caja
          </button>
        </div>
      )}

      {/* Historial */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-dark-700 flex items-center gap-2">
          <History size={16} className="text-gray-400" />
          <h2 className="font-semibold text-white">Historial ({history.length})</h2>
          {!isAdmin && <span className="text-xs text-gray-500 ml-2">Solo tus sesiones</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-dark-700 text-gray-400 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Cajero</th>
                <th className="px-3 py-2 text-left">Abierta</th>
                <th className="px-3 py-2 text-left">Cerrada</th>
                <th className="px-3 py-2 text-right">Base</th>
                <th className="px-3 py-2 text-right">Ventas efectivo</th>
                <th className="px-3 py-2 text-right">Esperado</th>
                <th className="px-3 py-2 text-right">Contado</th>
                <th className="px-3 py-2 text-right">Discrepancia</th>
                <th className="px-3 py-2 text-center">Estado</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 && (
                <tr><td colSpan={10} className="text-center text-gray-500 py-6">Sin sesiones registradas</td></tr>
              )}
              {history.map(s => {
                const dis = Number(s.discrepancy ?? 0)
                return (
                  <tr key={s.id} className="border-t border-dark-700 hover:bg-dark-700/40">
                    <td className="px-3 py-2 font-mono text-gray-300">{s.id}</td>
                    <td className="px-3 py-2 text-white">{s.cashier_name}</td>
                    <td className="px-3 py-2 text-gray-400 text-xs">{fmtDT(s.opened_at)}</td>
                    <td className="px-3 py-2 text-gray-400 text-xs">{fmtDT(s.closed_at)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(Number(s.initial_cash))}</td>
                    <td className="px-3 py-2 text-right text-green-400">{formatCurrency(Number(s.cash_sales || 0))}</td>
                    <td className="px-3 py-2 text-right">{s.status === 'closed' ? formatCurrency(Number(s.expected_cash || 0)) : '—'}</td>
                    <td className="px-3 py-2 text-right">{s.status === 'closed' ? formatCurrency(Number(s.counted_cash || 0)) : '—'}</td>
                    <td className={`px-3 py-2 text-right font-bold ${Math.abs(dis) < 1 ? 'text-gray-400' : dis < 0 ? 'text-red-400' : 'text-yellow-400'}`}>
                      {s.status === 'closed' ? (
                        dis === 0 ? '✓ Cuadrada' :
                        dis < 0 ? `Falta ${formatCurrency(Math.abs(dis))}` :
                        `Sobra ${formatCurrency(dis)}`
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                        s.status === 'open' ? 'bg-green-900/40 text-green-300 border border-green-700' : 'bg-dark-700 text-gray-400 border border-dark-500'
                      }`}>
                        {s.status === 'open' ? 'Abierta' : 'Cerrada'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal abrir caja */}
      {showOpen && (
        <Modal title="Abrir caja" onClose={() => setShowOpen(false)} size="sm">
          <div className="space-y-3">
            <p className="text-gray-400 text-sm">
              Cuenta el efectivo físico antes de abrir. Esa es la <strong className="text-white">base inicial</strong>.
              Al cierre el sistema comparará vs el efectivo esperado.
            </p>
            <div>
              <label className="label">Base inicial (efectivo en caja) *</label>
              <input
                type="number" step="0.01" autoFocus
                className="input text-xl font-bold text-center"
                value={openForm.initial_cash}
                onChange={e => setOpenForm(f => ({ ...f, initial_cash: e.target.value }))}
                placeholder="0"
              />
            </div>
            <div>
              <label className="label">Notas (opcional)</label>
              <textarea className="input" rows={2}
                value={openForm.opening_notes}
                onChange={e => setOpenForm(f => ({ ...f, opening_notes: e.target.value }))}
                placeholder="Ej: caja contada con cajero saliente"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowOpen(false)} className="btn-secondary">Cancelar</button>
              <button onClick={handleOpen} className="btn-primary flex items-center gap-2">
                <LogIn size={15} /> Abrir
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal cerrar caja */}
      {showClose && current && (
        <Modal title="Cerrar caja" onClose={() => setShowClose(false)} size="sm">
          <div className="space-y-3">
            <div className="bg-dark-700 rounded-lg p-3 space-y-1 text-sm">
              <RowKV label="Base inicial" value={formatCurrency(Number(current.initial_cash))} />
              <RowKV label="Ventas efectivo" value={formatCurrency(Number(current.cash_sales || 0))} />
              <RowKV label="Cambio entregado" value={`- ${formatCurrency(Number(current.change_given || 0))}`} />
              <div className="border-t border-dark-500 pt-1 mt-1">
                <RowKV label="Efectivo esperado" value={formatCurrency(Number(current.expected_cash || 0))} bold accent="text-brand-400" />
              </div>
            </div>
            <div>
              <label className="label">Efectivo contado físicamente *</label>
              <input
                type="number" step="0.01" autoFocus
                className="input text-xl font-bold text-center"
                value={closeForm.counted_cash}
                onChange={e => setCloseForm(f => ({ ...f, counted_cash: e.target.value }))}
                placeholder={String(Number(current.expected_cash || 0))}
              />
              {closeForm.counted_cash && (() => {
                const counted = parseFloat(closeForm.counted_cash) || 0
                const diff = counted - Number(current.expected_cash || 0)
                return (
                  <p className={`text-sm font-bold text-center mt-2 ${Math.abs(diff) < 1 ? 'text-green-400' : diff < 0 ? 'text-red-400' : 'text-yellow-400'}`}>
                    {Math.abs(diff) < 1 ? '✓ Caja cuadrada' :
                     diff < 0 ? `⚠ Falta ${formatCurrency(Math.abs(diff))}` :
                     `⚠ Sobra ${formatCurrency(diff)}`}
                  </p>
                )
              })()}
            </div>
            <div>
              <label className="label">Notas del cierre</label>
              <textarea className="input" rows={2}
                value={closeForm.closing_notes}
                onChange={e => setCloseForm(f => ({ ...f, closing_notes: e.target.value }))}
                placeholder="Ej: justificación de discrepancia"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowClose(false)} className="btn-secondary">Cancelar</button>
              <button onClick={handleClose} className="btn-danger flex items-center gap-2">
                <LogOut size={15} /> Cerrar caja
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Box({ label, value, sub, accent = '' }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="bg-dark-700 rounded-lg p-3">
      <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">{label}</p>
      <p className={`font-bold text-lg ${accent || 'text-white'}`}>{value}</p>
      {sub && <p className="text-gray-500 text-xs mt-0.5">{sub}</p>}
    </div>
  )
}

function RowKV({ label, value, bold, accent }: { label: string; value: string; bold?: boolean; accent?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-400">{label}</span>
      <span className={`${bold ? 'font-black' : 'font-medium'} ${accent || 'text-white'}`}>{value}</span>
    </div>
  )
}
