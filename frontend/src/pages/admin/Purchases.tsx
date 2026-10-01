import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { purchasesApi, inventoryApi } from '../../services/api'
import { Purchase, InventoryItem } from '../../types'
import { formatCurrency, formatDate } from '../../utils/format'
import { Plus, Trash2, ChevronDown, ChevronUp, Edit3 } from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '../../components/ui/Modal'
import { useAuthStore } from '../../store/authStore'

export default function Purchases() {
  const qc = useQueryClient()
  const { hasRole } = useAuthStore()
  const isAdmin = hasRole('Administrador')
  const [showCreate, setShowCreate] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [items, setItems] = useState([{ inventory_item_id: '', quantity: '', unit_cost: '' }])
  const [editing, setEditing] = useState<Purchase | null>(null)
  const [editForm, setEditForm] = useState({ notes: '', purchase_date: '' })
  const [savingEdit, setSavingEdit] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const { data: purchases = [] } = useQuery<Purchase[]>({
    queryKey: ['purchases'],
    queryFn: () => purchasesApi.list().then(r => r.data),
  })

  const { data: invItems = [] } = useQuery<InventoryItem[]>({
    queryKey: ['inventory'],
    queryFn: () => inventoryApi.items().then(r => r.data),
  })

  const total = purchases.reduce((s, p) => s + Number(p.total), 0)

  const addItem = () => setItems([...items, { inventory_item_id: '', quantity: '', unit_cost: '' }])
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i))
  const updateItem = (i: number, field: string, val: string) =>
    setItems(items.map((item, idx) => idx === i ? { ...item, [field]: val } : item))

  const lineTotal = (item: typeof items[0]) =>
    (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_cost) || 0)

  const grandTotal = items.reduce((s, i) => s + lineTotal(i), 0)

  const openEditPurchase = (p: Purchase) => {
    setEditing(p)
    const dt = p.purchase_date ? new Date(p.purchase_date).toISOString().slice(0, 16) : ''
    setEditForm({ notes: p.notes || '', purchase_date: dt })
  }

  const saveEdit = async () => {
    if (!editing) return
    setSavingEdit(true)
    try {
      await purchasesApi.update(editing.id, {
        notes: editForm.notes.trim() || null,
        purchase_date: editForm.purchase_date ? new Date(editForm.purchase_date).toISOString() : null,
      })
      qc.invalidateQueries({ queryKey: ['purchases'] })
      setEditing(null)
      toast.success('Compra actualizada')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg || 'Error al editar')
    } finally {
      setSavingEdit(false)
    }
  }

  const handleDelete = async (p: Purchase) => {
    if (!window.confirm(`¿Eliminar compra ${p.purchase_number}? Se revertirá el inventario añadido.`)) return
    setDeletingId(p.id)
    try {
      await purchasesApi.delete(p.id)
      qc.invalidateQueries({ queryKey: ['purchases'] })
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success('Compra eliminada e inventario revertido')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg || 'No se pudo eliminar')
    } finally {
      setDeletingId(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const validItems = items.filter(i => i.inventory_item_id && i.quantity && i.unit_cost)
    if (validItems.length === 0) { toast.error('Agrega al menos un ítem'); return }
    try {
      await purchasesApi.create({
        items: validItems.map(i => ({
          inventory_item_id: parseInt(i.inventory_item_id),
          quantity: parseFloat(i.quantity),
          unit_cost: parseFloat(i.unit_cost),
        })),
      })
      qc.invalidateQueries({ queryKey: ['purchases'] })
      qc.invalidateQueries({ queryKey: ['inventory'] })
      setShowCreate(false)
      setItems([{ inventory_item_id: '', quantity: '', unit_cost: '' }])
      toast.success('Compra registrada e inventario actualizado')
    } catch { toast.error('Error al registrar compra') }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Compras</h1>
          <p className="text-gray-500 text-sm">Compras de insumos e inventario</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Nueva compra
        </button>
      </div>

      <div className="card">
        <p className="text-gray-400 text-sm">Total en compras (historial)</p>
        <p className="text-blue-400 font-bold text-2xl">{formatCurrency(total)}</p>
      </div>

      <div className="space-y-3">
        {purchases.map(p => (
          <div key={p.id} className="card p-0 overflow-hidden">
            <div
              className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-dark-700 transition-colors"
              onClick={() => setExpanded(expanded === p.id ? null : p.id)}
            >
              <div>
                <p className="text-white font-semibold">{p.purchase_number}</p>
                <p className="text-gray-500 text-xs">{formatDate(p.purchase_date)} · {p.items.length} ítems</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-blue-400 font-bold">{formatCurrency(p.total)}</span>
                {isAdmin && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); openEditPurchase(p) }}
                      className="text-gray-500 hover:text-brand-400 p-1"
                      title="Editar (solo Admin)"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(p) }}
                      disabled={deletingId === p.id}
                      className="text-gray-500 hover:text-red-400 p-1 disabled:opacity-50"
                      title="Eliminar y revertir inventario (solo Admin)"
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
                {expanded === p.id ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
              </div>
            </div>
            {expanded === p.id && (
              <div className="border-t border-dark-600 px-4 py-3">
                <table className="w-full text-sm">
                  <thead><tr className="text-gray-500 text-xs"><th className="text-left pb-2">Insumo</th><th className="text-right pb-2">Cantidad</th><th className="text-right pb-2">Costo unit.</th><th className="text-right pb-2">Total</th></tr></thead>
                  <tbody className="divide-y divide-dark-600">
                    {p.items.map(item => {
                      const inv = invItems.find(i => i.id === item.inventory_item_id)
                      return (
                        <tr key={item.id}>
                          <td className="py-1.5 text-white">{inv?.name || `#${item.inventory_item_id}`}</td>
                          <td className="text-right text-gray-400">{Number(item.quantity).toFixed(2)}</td>
                          <td className="text-right text-gray-400">{formatCurrency(item.unit_cost)}</td>
                          <td className="text-right text-blue-400 font-semibold">{formatCurrency(item.total_cost)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
        {purchases.length === 0 && <p className="text-gray-500 text-center py-8">No hay compras registradas</p>}
      </div>

      {showCreate && (
        <Modal title="Nueva compra" onClose={() => setShowCreate(false)} size="xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="flex gap-2 items-end">
                  <div className="flex-1">
                    {i === 0 && <label className="label text-xs">Insumo</label>}
                    <select className="input text-sm" value={item.inventory_item_id} onChange={e => updateItem(i, 'inventory_item_id', e.target.value)} required>
                      <option value="">Seleccionar insumo...</option>
                      {invItems.map(inv => <option key={inv.id} value={inv.id}>{inv.name} ({inv.unit?.abbreviation})</option>)}
                    </select>
                  </div>
                  <div className="w-24">
                    {i === 0 && <label className="label text-xs">Cantidad</label>}
                    <input type="number" step="0.01" className="input text-sm" placeholder="0" value={item.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)} required />
                  </div>
                  <div className="w-28">
                    {i === 0 && <label className="label text-xs">Costo unit.</label>}
                    <input type="number" step="0.01" className="input text-sm" placeholder="0" value={item.unit_cost} onChange={e => updateItem(i, 'unit_cost', e.target.value)} required />
                  </div>
                  <div className="w-28 text-right pb-2">
                    {i === 0 && <div className="label text-xs opacity-0">-</div>}
                    <span className="text-blue-400 text-sm font-semibold">{formatCurrency(lineTotal(item))}</span>
                  </div>
                  {items.length > 1 && (
                    <button type="button" onClick={() => removeItem(i)} className="pb-2 text-gray-500 hover:text-red-400">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" onClick={addItem} className="btn-secondary text-sm flex items-center gap-1">
              <Plus size={14} /> Agregar ítem
            </button>
            <div className="flex items-center justify-between border-t border-dark-600 pt-3">
              <span className="text-gray-400">Total de la compra:</span>
              <span className="text-blue-400 font-bold text-xl">{formatCurrency(grandTotal)}</span>
            </div>
            <button type="submit" className="btn-primary w-full py-3">Registrar compra</button>
          </form>
        </Modal>
      )}

      {/* Modal: Editar compra (admin) */}
      {editing && (
        <Modal title={`Editar compra ${editing.purchase_number}`} onClose={() => setEditing(null)} size="sm">
          <div className="space-y-3">
            <div className="bg-brand-900/20 border border-brand-700 rounded-lg px-3 py-2 text-xs text-brand-300 flex items-center gap-2">
              <Edit3 size={13} /> Solo se editan metadatos. Para cambiar items, elimina y crea una nueva.
            </div>
            <div>
              <label className="label">Fecha</label>
              <input type="datetime-local" className="input" value={editForm.purchase_date} onChange={e => setEditForm({...editForm, purchase_date: e.target.value})} />
            </div>
            <div>
              <label className="label">Notas</label>
              <textarea className="input" rows={3} value={editForm.notes} onChange={e => setEditForm({...editForm, notes: e.target.value})} />
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setEditing(null)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={saveEdit} disabled={savingEdit} className="btn-primary flex-1">
                {savingEdit ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
