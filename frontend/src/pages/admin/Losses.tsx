import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { lossesApi, inventoryApi } from '../../services/api'
import { InventoryItem } from '../../types'
import { formatCurrency, formatDate } from '../../utils/format'
import { Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '../../components/ui/Modal'

const LOSS_TYPES = ['waste', 'damage', 'expiry', 'return_order', 'courtesy', 'internal_use', 'kitchen_error', 'other']
const LOSS_LABELS: Record<string, string> = {
  waste: 'Desperdicio', damage: 'Daño', expiry: 'Vencimiento', return_order: 'Devolución',
  courtesy: 'Cortesía', internal_use: 'Consumo interno', kitchen_error: 'Error cocina', other: 'Otro'
}

export default function Losses() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ inventory_item_id: '', quantity: '', loss_type: 'waste', description: '' })

  const { data: losses = [] } = useQuery({
    queryKey: ['losses'],
    queryFn: () => lossesApi.list().then(r => r.data),
  })
  const { data: items = [] } = useQuery<InventoryItem[]>({
    queryKey: ['inventory'],
    queryFn: () => inventoryApi.items().then(r => r.data),
  })

  const totalCost = losses.reduce((s: number, l: { total_cost?: number }) => s + (l.total_cost || 0), 0)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await lossesApi.create({ ...form, inventory_item_id: parseInt(form.inventory_item_id), quantity: parseFloat(form.quantity) })
      qc.invalidateQueries({ queryKey: ['losses'] })
      qc.invalidateQueries({ queryKey: ['inventory'] })
      setShowCreate(false)
      setForm({ inventory_item_id: '', quantity: '', loss_type: 'waste', description: '' })
      toast.success('Pérdida/merma registrada')
    } catch { toast.error('Error') }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Pérdidas y Mermas</h1>
          <p className="text-gray-500 text-sm">Registro de desperdicios, daños y mermas</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Registrar pérdida
        </button>
      </div>

      <div className="card">
        <p className="text-gray-400 text-sm">Costo total de pérdidas (historial)</p>
        <p className="text-red-400 font-bold text-2xl">{formatCurrency(totalCost)}</p>
      </div>

      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-dark-600">
            <tr className="text-gray-400 text-xs uppercase tracking-wider">
              <th className="text-left px-4 py-3">Fecha</th>
              <th className="text-left px-4 py-3">Insumo</th>
              <th className="text-left px-4 py-3">Tipo</th>
              <th className="text-right px-4 py-3">Cantidad</th>
              <th className="text-right px-4 py-3">Costo unit.</th>
              <th className="text-right px-4 py-3">Costo total</th>
              <th className="text-left px-4 py-3">Descripción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dark-600">
            {losses.map((l: { id: number; loss_date: string; inventory_item_id: number; loss_type: string; quantity: number; unit_cost?: number; total_cost?: number; description?: string }) => {
              const item = items.find(i => i.id === l.inventory_item_id)
              return (
                <tr key={l.id} className="hover:bg-dark-700 transition-colors">
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{formatDate(l.loss_date)}</td>
                  <td className="px-4 py-2.5 text-white">{item?.name || `#${l.inventory_item_id}`}</td>
                  <td className="px-4 py-2.5"><span className="bg-dark-600 text-orange-300 text-xs px-2 py-0.5 rounded-full">{LOSS_LABELS[l.loss_type] || l.loss_type}</span></td>
                  <td className="px-4 py-2.5 text-right text-white">{Number(l.quantity).toFixed(2)} {item?.unit?.abbreviation}</td>
                  <td className="px-4 py-2.5 text-right text-gray-400">{l.unit_cost ? formatCurrency(l.unit_cost) : '-'}</td>
                  <td className="px-4 py-2.5 text-right text-red-400 font-semibold">{l.total_cost ? formatCurrency(l.total_cost) : '-'}</td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{l.description || '-'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {losses.length === 0 && <p className="text-gray-500 text-center py-8">No hay registros</p>}
      </div>

      {showCreate && (
        <Modal title="Registrar pérdida/merma" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="label">Insumo</label>
              <select className="input" value={form.inventory_item_id} onChange={e => setForm({...form, inventory_item_id: e.target.value})} required>
                <option value="">Seleccionar...</option>
                {items.map(i => <option key={i.id} value={i.id}>{i.name} (stock: {Number(i.current_stock).toFixed(2)} {i.unit?.abbreviation})</option>)}
              </select>
            </div>
            <div>
              <label className="label">Tipo de pérdida</label>
              <select className="input" value={form.loss_type} onChange={e => setForm({...form, loss_type: e.target.value})}>
                {LOSS_TYPES.map(t => <option key={t} value={t}>{LOSS_LABELS[t]}</option>)}
              </select>
            </div>
            <div><label className="label">Cantidad</label><input type="number" step="0.01" className="input" value={form.quantity} onChange={e => setForm({...form, quantity: e.target.value})} required /></div>
            <div><label className="label">Descripción</label><input className="input" value={form.description} onChange={e => setForm({...form, description: e.target.value})} /></div>
            <button type="submit" className="btn-primary w-full">Registrar</button>
          </form>
        </Modal>
      )}
    </div>
  )
}
