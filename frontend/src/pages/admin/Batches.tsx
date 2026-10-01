import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { inventoryApi } from '../../services/api'
import { formatCurrency, parseServerDate } from '../../utils/format'
import { Calendar, AlertTriangle, Plus, X, Trash2, Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '../../components/ui/Modal'
import { useAuthStore } from '../../store/authStore'

interface Batch {
  id: number
  item_id: number
  item_name?: string
  batch_code?: string
  initial_quantity: number
  remaining_quantity: number
  unit_cost: number
  received_date?: string
  expiry_date?: string
  is_depleted: boolean
  days_to_expiry?: number | null
  status: 'ok' | 'warning' | 'critical' | 'expired' | 'depleted'
  notes?: string
}

const STATUS_STYLE: Record<string, { label: string; bg: string; border: string; text: string }> = {
  ok:       { label: 'OK',       bg: 'bg-green-900/30',  border: 'border-green-700',  text: 'text-green-300' },
  warning:  { label: 'Pronto',   bg: 'bg-yellow-900/30', border: 'border-yellow-700', text: 'text-yellow-300' },
  critical: { label: 'Crítico',  bg: 'bg-orange-900/30', border: 'border-orange-700', text: 'text-orange-300' },
  expired:  { label: 'VENCIDO',  bg: 'bg-red-900/40',    border: 'border-red-700',    text: 'text-red-300' },
  depleted: { label: 'Agotado',  bg: 'bg-dark-700',      border: 'border-dark-500',   text: 'text-gray-400' },
}

const fmtDate = (s?: string) => s ? parseServerDate(s).toLocaleDateString('es-CO',
  { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export default function Batches() {
  const qc = useQueryClient()
  const { hasRole } = useAuthStore()
  const isAdmin = hasRole('Administrador')
  const [showCreate, setShowCreate] = useState(false)
  const [includeDepleted, setIncludeDepleted] = useState(false)
  const [filter, setFilter] = useState<'all' | 'alerts'>('all')

  const { data: items = [] } = useQuery({
    queryKey: ['inventory'],
    queryFn: () => inventoryApi.items().then(r => r.data),
  })

  const { data: batches = [], isLoading } = useQuery<Batch[]>({
    queryKey: ['batches', includeDepleted, filter],
    queryFn: () => filter === 'alerts'
      ? inventoryApi.batchAlerts(7).then(r => r.data)
      : inventoryApi.batches({ include_depleted: includeDepleted }).then(r => r.data),
    refetchInterval: 60000,
  })

  const counts = {
    expired: batches.filter(b => b.status === 'expired').length,
    critical: batches.filter(b => b.status === 'critical').length,
    warning: batches.filter(b => b.status === 'warning').length,
  }

  const [form, setForm] = useState({
    item_id: '', batch_code: '', initial_quantity: '', unit_cost: '',
    expiry_date: '', notes: '',
  })

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.item_id || !form.initial_quantity) {
      toast.error('Insumo y cantidad son obligatorios')
      return
    }
    try {
      await inventoryApi.createBatch({
        item_id: parseInt(form.item_id),
        batch_code: form.batch_code || null,
        initial_quantity: parseFloat(form.initial_quantity),
        unit_cost: parseFloat(form.unit_cost) || 0,
        expiry_date: form.expiry_date ? new Date(form.expiry_date).toISOString() : null,
        notes: form.notes || null,
      })
      toast.success('Lote registrado')
      setForm({ item_id: '', batch_code: '', initial_quantity: '', unit_cost: '', expiry_date: '', notes: '' })
      setShowCreate(false)
      qc.invalidateQueries({ queryKey: ['batches'] })
      qc.invalidateQueries({ queryKey: ['inventory'] })
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(detail || 'Error al crear lote')
    }
  }

  const handleDelete = async (b: Batch) => {
    const msg = b.remaining_quantity > 0
      ? `Descartar lote ${b.batch_code || `#${b.id}`} con ${b.remaining_quantity} ${b.item_name ? 'unid. de ' + b.item_name : ''} restante? Se registrará como pérdida.`
      : `Eliminar lote ${b.batch_code || `#${b.id}`}?`
    if (!confirm(msg)) return
    try {
      await inventoryApi.deleteBatch(b.id)
      toast.success('Lote eliminado')
      qc.invalidateQueries({ queryKey: ['batches'] })
      qc.invalidateQueries({ queryKey: ['inventory'] })
    } catch {
      toast.error('Error al eliminar')
    }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Calendar size={22} className="text-brand-400" />
            Lotes y vencimientos
          </h1>
          <p className="text-gray-500 text-sm">Trazabilidad de insumos perecederos · FEFO automático al vender</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Registrar lote
          </button>
        )}
      </div>

      {/* Alertas */}
      {(counts.expired + counts.critical + counts.warning) > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {counts.expired > 0 && (
            <div className="card border-red-700 bg-red-900/20 flex items-center gap-2">
              <AlertTriangle size={22} className="text-red-400" />
              <div>
                <p className="text-red-300 font-black text-2xl">{counts.expired}</p>
                <p className="text-red-400 text-xs">Vencido(s)</p>
              </div>
            </div>
          )}
          {counts.critical > 0 && (
            <div className="card border-orange-700 bg-orange-900/20 flex items-center gap-2">
              <Clock size={22} className="text-orange-400" />
              <div>
                <p className="text-orange-300 font-black text-2xl">{counts.critical}</p>
                <p className="text-orange-400 text-xs">Vence en ≤ 2 días</p>
              </div>
            </div>
          )}
          {counts.warning > 0 && (
            <div className="card border-yellow-700 bg-yellow-900/20 flex items-center gap-2">
              <Clock size={22} className="text-yellow-400" />
              <div>
                <p className="text-yellow-300 font-black text-2xl">{counts.warning}</p>
                <p className="text-yellow-400 text-xs">Vence en ≤ 7 días</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold ${filter === 'all' ? 'bg-brand-600 text-white' : 'bg-dark-700 text-gray-400'}`}
        >
          Todos ({batches.length})
        </button>
        <button
          onClick={() => setFilter('alerts')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold ${filter === 'alerts' ? 'bg-red-600 text-white' : 'bg-dark-700 text-gray-400'}`}
        >
          Solo alertas
        </button>
        <label className="text-xs text-gray-400 ml-auto flex items-center gap-1.5">
          <input type="checkbox" checked={includeDepleted} onChange={e => setIncludeDepleted(e.target.checked)} />
          Mostrar agotados
        </label>
      </div>

      {/* Tabla */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-dark-700 text-gray-400 text-xs uppercase tracking-wider">
            <tr>
              <th className="px-3 py-2 text-left">Insumo</th>
              <th className="px-3 py-2 text-left">Código lote</th>
              <th className="px-3 py-2 text-right">Inicial</th>
              <th className="px-3 py-2 text-right">Restante</th>
              <th className="px-3 py-2 text-right">Costo</th>
              <th className="px-3 py-2 text-center">Recibido</th>
              <th className="px-3 py-2 text-center">Vence</th>
              <th className="px-3 py-2 text-center">Estado</th>
              {isAdmin && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={9} className="text-center text-gray-500 py-8">Cargando...</td></tr>
            )}
            {!isLoading && batches.length === 0 && (
              <tr><td colSpan={9} className="text-center text-gray-500 py-8">
                No hay lotes registrados. Crea uno para activar trazabilidad y FEFO.
              </td></tr>
            )}
            {batches.map(b => {
              const style = STATUS_STYLE[b.status]
              return (
                <tr key={b.id} className="border-t border-dark-700 hover:bg-dark-700/50">
                  <td className="px-3 py-2 text-white font-medium">{b.item_name || `#${b.item_id}`}</td>
                  <td className="px-3 py-2 text-gray-400 font-mono text-xs">{b.batch_code || '—'}</td>
                  <td className="px-3 py-2 text-right text-gray-300">{Number(b.initial_quantity)}</td>
                  <td className="px-3 py-2 text-right font-bold text-white">{Number(b.remaining_quantity)}</td>
                  <td className="px-3 py-2 text-right text-gray-400">{formatCurrency(Number(b.unit_cost))}</td>
                  <td className="px-3 py-2 text-center text-gray-500 text-xs">{fmtDate(b.received_date)}</td>
                  <td className="px-3 py-2 text-center text-xs">
                    {b.expiry_date ? (
                      <div>
                        <p className="text-gray-300">{fmtDate(b.expiry_date)}</p>
                        {b.days_to_expiry !== null && b.days_to_expiry !== undefined && (
                          <p className={`text-[10px] ${b.days_to_expiry < 0 ? 'text-red-400' : b.days_to_expiry <= 2 ? 'text-orange-400' : b.days_to_expiry <= 7 ? 'text-yellow-400' : 'text-gray-500'}`}>
                            {b.days_to_expiry < 0 ? `${Math.abs(b.days_to_expiry)} días vencido` : `en ${b.days_to_expiry} días`}
                          </p>
                        )}
                      </div>
                    ) : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`text-[10px] px-2 py-1 rounded-full font-bold uppercase border ${style.bg} ${style.border} ${style.text}`}>
                      {style.label}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => handleDelete(b)}
                        title="Descartar o eliminar lote"
                        className="text-gray-500 hover:text-red-400 p-1"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modal crear lote */}
      {showCreate && (
        <Modal title="Registrar nuevo lote" onClose={() => setShowCreate(false)} size="md">
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="label">Insumo *</label>
              <select required className="input" value={form.item_id} onChange={e => setForm(f => ({ ...f, item_id: e.target.value }))}>
                <option value="">— Selecciona —</option>
                {items.map((i: { id: number; name: string; unit?: { abbreviation: string } }) => (
                  <option key={i.id} value={i.id}>{i.name} {i.unit?.abbreviation ? `(${i.unit.abbreviation})` : ''}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Cantidad inicial *</label>
                <input required type="number" step="0.01" className="input" value={form.initial_quantity}
                  onChange={e => setForm(f => ({ ...f, initial_quantity: e.target.value }))} placeholder="10" />
              </div>
              <div>
                <label className="label">Costo unitario</label>
                <input type="number" step="0.01" className="input" value={form.unit_cost}
                  onChange={e => setForm(f => ({ ...f, unit_cost: e.target.value }))} placeholder="0" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Código lote</label>
                <input className="input" value={form.batch_code} placeholder="L-2026-001 (opcional)"
                  onChange={e => setForm(f => ({ ...f, batch_code: e.target.value }))} />
              </div>
              <div>
                <label className="label">Fecha de vencimiento</label>
                <input type="date" className="input" value={form.expiry_date}
                  onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="label">Notas</label>
              <textarea className="input" rows={2} value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancelar</button>
              <button type="submit" className="btn-primary">Crear lote</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
