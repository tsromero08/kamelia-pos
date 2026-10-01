import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { inventoryApi } from '../../services/api'
import { InventoryItem } from '../../types'
import { formatCurrency } from '../../utils/format'
import { Package, AlertTriangle, Plus, Search, History, SlidersHorizontal } from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '../../components/ui/Modal'
import SpecialCodeModal from '../../components/SpecialCodeModal'
import { useAuthStore } from '../../store/authStore'

export default function Inventory() {
  const qc = useQueryClient()
  const { hasRole } = useAuthStore()
  const isAdmin = hasRole('Administrador')
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showAdjust, setShowAdjust] = useState<InventoryItem | null>(null)
  const [showMovements, setShowMovements] = useState<InventoryItem | null>(null)
  const [adjustQty, setAdjustQty] = useState('')
  const [adjustNotes, setAdjustNotes] = useState('')
  const [pendingCriticalAction, setPendingCriticalAction] = useState<null | { action: string; run: () => Promise<void> | void }>(null)

  const runWithSpecialCode = (action: string, run: () => Promise<void> | void) => {
    setPendingCriticalAction({ action, run })
  }

  const { data: items = [], isLoading } = useQuery<InventoryItem[]>({
    queryKey: ['inventory'],
    queryFn: () => inventoryApi.items().then(r => r.data),
  })

  const { data: units = [] } = useQuery({
    queryKey: ['units'],
    queryFn: () => inventoryApi.units().then(r => r.data),
  })

  const { data: movements = [] } = useQuery({
    queryKey: ['movements', showMovements?.id],
    queryFn: () => showMovements ? inventoryApi.movements(showMovements.id).then(r => r.data) : [],
    enabled: !!showMovements,
  })

  const [form, setForm] = useState({ name: '', unit_id: '', current_stock: '', minimum_stock: '', current_cost: '' })

  const filtered = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
  const lowStock = items.filter(i => i.is_low_stock)

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isAdmin) { toast.error('Solo el administrador puede crear insumos'); return }
    runWithSpecialCode('create_inventory_item', async () => {
      try {
        await inventoryApi.createItem({
          name: form.name,
          unit_id: parseInt(form.unit_id),
          current_stock: parseFloat(form.current_stock) || 0,
          minimum_stock: parseFloat(form.minimum_stock) || 0,
          current_cost: parseFloat(form.current_cost) || 0,
        })
        qc.invalidateQueries({ queryKey: ['inventory'] })
        setShowCreate(false)
        setForm({ name: '', unit_id: '', current_stock: '', minimum_stock: '', current_cost: '' })
        toast.success('Insumo creado')
      } catch {
        toast.error('Error al crear insumo')
      }
    })
  }

  const handleAdjust = (e: React.FormEvent) => {
    e.preventDefault()
    if (!showAdjust) return
    if (!isAdmin) { toast.error('Solo el administrador puede ajustar stock'); return }
    const item = showAdjust
    const qty = adjustQty
    const notes = adjustNotes
    runWithSpecialCode('adjust_inventory', async () => {
      try {
        await inventoryApi.adjust({ item_id: item.id, quantity: parseFloat(qty), notes })
        qc.invalidateQueries({ queryKey: ['inventory'] })
        setShowAdjust(null)
        setAdjustQty(''); setAdjustNotes('')
        toast.success('Ajuste aplicado')
      } catch {
        toast.error('Error al ajustar stock')
      }
    })
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Inventario</h1>
          <p className="text-gray-500 text-sm">Gestión de insumos y stock</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Nuevo insumo
        </button>
      </div>

      {lowStock.length > 0 && (
        <div className="bg-red-900/20 border border-red-700 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-400 font-semibold text-sm">Stock crítico en {lowStock.length} insumo(s)</p>
            <p className="text-gray-400 text-xs mt-1">{lowStock.map(i => i.name).join(', ')}</p>
          </div>
        </div>
      )}

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input className="input pl-9" placeholder="Buscar insumo..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {isLoading ? <div className="text-gray-400">Cargando...</div> : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-dark-600">
              <tr className="text-gray-400 text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-3">Insumo</th>
                <th className="text-right px-4 py-3">Stock actual</th>
                <th className="text-right px-4 py-3">Stock mín.</th>
                <th className="text-right px-4 py-3">Costo unit.</th>
                <th className="text-right px-4 py-3">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-600">
              {filtered.map(item => (
                <tr key={item.id} className="hover:bg-dark-700 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-white font-medium">{item.name}</p>
                    <p className="text-gray-500 text-xs">{item.unit?.abbreviation}</p>
                  </td>
                  <td className="px-4 py-3 text-right text-white font-mono">{Number(item.current_stock).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-gray-400 font-mono">{Number(item.minimum_stock).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-gray-400">{formatCurrency(item.current_cost)}</td>
                  <td className="px-4 py-3 text-right">
                    {item.is_low_stock
                      ? <span className="bg-red-900/30 text-red-400 border border-red-700 px-2 py-0.5 rounded-full text-xs">Crítico</span>
                      : <span className="bg-green-900/30 text-green-400 border border-green-700 px-2 py-0.5 rounded-full text-xs">OK</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => setShowAdjust(item)} className="p-1.5 hover:bg-dark-600 rounded-lg text-gray-400 hover:text-white transition-colors" title="Ajustar stock">
                        <SlidersHorizontal size={14} />
                      </button>
                      <button onClick={() => setShowMovements(item)} className="p-1.5 hover:bg-dark-600 rounded-lg text-gray-400 hover:text-white transition-colors" title="Ver movimientos">
                        <History size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <Modal title="Nuevo insumo" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate} className="space-y-3">
            <div><label className="label">Nombre</label><input className="input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required /></div>
            <div>
              <label className="label">Unidad</label>
              <select className="input" value={form.unit_id} onChange={e => setForm({...form, unit_id: e.target.value})} required>
                <option value="">Seleccionar...</option>
                {units.map((u: { id: number; name: string }) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div><label className="label">Stock inicial</label><input type="number" className="input" value={form.current_stock} onChange={e => setForm({...form, current_stock: e.target.value})} /></div>
              <div><label className="label">Stock mín.</label><input type="number" className="input" value={form.minimum_stock} onChange={e => setForm({...form, minimum_stock: e.target.value})} /></div>
              <div><label className="label">Costo unit.</label><input type="number" className="input" value={form.current_cost} onChange={e => setForm({...form, current_cost: e.target.value})} /></div>
            </div>
            <button type="submit" className="btn-primary w-full">Crear insumo</button>
          </form>
        </Modal>
      )}

      {/* Adjust stock modal */}
      {showAdjust && (
        <Modal title={`Ajustar stock: ${showAdjust.name}`} onClose={() => setShowAdjust(null)} size="sm">
          <form onSubmit={handleAdjust} className="space-y-3">
            <div className="bg-dark-700 rounded-lg p-3 text-center">
              <p className="text-gray-400 text-sm">Stock actual</p>
              <p className="text-white font-bold text-2xl">{Number(showAdjust.current_stock).toFixed(2)} {showAdjust.unit?.abbreviation}</p>
            </div>
            <div>
              <label className="label">Cantidad (positivo = entrada, negativo = salida)</label>
              <input type="number" step="0.01" className="input text-center text-xl font-bold" value={adjustQty} onChange={e => setAdjustQty(e.target.value)} placeholder="0" required />
              {adjustQty && (
                <p className="text-xs mt-1 text-center text-gray-400">
                  Nuevo stock: <span className="text-brand-400 font-bold">{(Number(showAdjust.current_stock) + parseFloat(adjustQty || '0')).toFixed(2)}</span>
                </p>
              )}
            </div>
            <div><label className="label">Motivo del ajuste</label><input className="input" value={adjustNotes} onChange={e => setAdjustNotes(e.target.value)} placeholder="Corrección de inventario..." /></div>
            <button type="submit" className="btn-primary w-full">Aplicar ajuste</button>
          </form>
        </Modal>
      )}

      {/* Special Code modal — gate para acciones críticas */}
      {pendingCriticalAction && (
        <SpecialCodeModal
          title="Autorización requerida"
          description="Modificar inventario o ajustar stock afecta los datos contables. Ingresa el Código de Acceso Especial."
          actionContext={pendingCriticalAction.action}
          onClose={() => setPendingCriticalAction(null)}
          onConfirm={() => {
            const run = pendingCriticalAction.run
            setPendingCriticalAction(null)
            void run()
          }}
        />
      )}

      {/* Movements modal */}
      {showMovements && (
        <Modal title={`Movimientos: ${showMovements.name}`} onClose={() => setShowMovements(null)} size="lg">
          <div className="space-y-2">
            {movements.length === 0 && <p className="text-gray-400 text-center py-4">Sin movimientos registrados</p>}
            {movements.map((m: { id: number; movement_type: string; quantity: number; quantity_before: number; quantity_after: number; notes: string; created_at: string }) => (
              <div key={m.id} className="flex items-center justify-between bg-dark-700 rounded-lg px-3 py-2 text-sm">
                <div>
                  <span className={`font-medium ${Number(m.quantity) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {Number(m.quantity) >= 0 ? '+' : ''}{Number(m.quantity).toFixed(2)}
                  </span>
                  <span className="text-gray-400 ml-2 text-xs">{m.movement_type}</span>
                  {m.notes && <p className="text-gray-500 text-xs">{m.notes}</p>}
                </div>
                <div className="text-right">
                  <p className="text-white text-xs">{Number(m.quantity_before).toFixed(2)} → {Number(m.quantity_after).toFixed(2)}</p>
                  <p className="text-gray-500 text-xs">{new Date(m.created_at).toLocaleDateString('es-CO')}</p>
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}
