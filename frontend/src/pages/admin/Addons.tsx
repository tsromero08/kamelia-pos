import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { productsApi, inventoryApi } from '../../services/api'
import { Addon, InventoryItem } from '../../types'
import { formatCurrency } from '../../utils/format'
import { Plus, Edit3, Trash2, Sparkles, Package } from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '../../components/ui/Modal'

interface AddonForm {
  id?: number
  name: string
  additional_price: string
  inventory_item_id: string
  inventory_quantity: string
  icon: string
  is_active: boolean
  sort_order: string
}

const blankForm: AddonForm = {
  name: '',
  additional_price: '',
  inventory_item_id: '',
  inventory_quantity: '',
  icon: '',
  is_active: true,
  sort_order: '0',
}

export default function Addons() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<AddonForm>(blankForm)

  const { data: addons = [], isLoading } = useQuery<Addon[]>({
    queryKey: ['addons-admin'],
    queryFn: () => productsApi.addons(false).then(r => r.data),
  })

  const { data: items = [] } = useQuery<InventoryItem[]>({
    queryKey: ['inventory'],
    queryFn: () => inventoryApi.items().then(r => r.data),
    staleTime: 60000,
  })

  const openCreate = () => {
    setForm({ ...blankForm, sort_order: String(addons.length + 1) })
    setShowForm(true)
  }

  const openEdit = (a: Addon) => {
    setForm({
      id: a.id,
      name: a.name,
      additional_price: String(a.additional_price),
      inventory_item_id: a.inventory_item_id ? String(a.inventory_item_id) : '',
      inventory_quantity: String(a.inventory_quantity || 0),
      icon: a.icon || '',
      is_active: a.is_active,
      sort_order: String(a.sort_order || 0),
    })
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.additional_price) {
      toast.error('Nombre y precio son obligatorios')
      return
    }
    const payload = {
      name: form.name.trim(),
      additional_price: parseFloat(form.additional_price),
      inventory_item_id: form.inventory_item_id ? parseInt(form.inventory_item_id) : null,
      inventory_quantity: parseFloat(form.inventory_quantity) || 0,
      icon: form.icon || null,
      is_active: form.is_active,
      sort_order: parseInt(form.sort_order) || 0,
    }
    try {
      if (form.id) {
        await productsApi.updateAddon(form.id, payload)
        toast.success('Adición actualizada')
      } else {
        await productsApi.createAddon(payload)
        toast.success('Adición creada')
      }
      qc.invalidateQueries({ queryKey: ['addons-admin'] })
      qc.invalidateQueries({ queryKey: ['addons'] })
      setShowForm(false)
      setForm(blankForm)
    } catch {
      toast.error('Error al guardar la adición')
    }
  }

  const handleDelete = async (a: Addon) => {
    if (!confirm(`¿Desactivar "${a.name}"? Dejará de aparecer en el POS.`)) return
    try {
      await productsApi.deleteAddon(a.id)
      qc.invalidateQueries({ queryKey: ['addons-admin'] })
      qc.invalidateQueries({ queryKey: ['addons'] })
      toast.success('Adición desactivada')
    } catch {
      toast.error('Error al desactivar')
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Sparkles size={22} className="text-brand-400" />
            Adiciones rápidas
          </h1>
          <p className="text-gray-500 text-sm">
            Modificadores aplicables a cualquier producto del POS (doble queso, jalapeños, tocineta...)
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Nueva adición
        </button>
      </div>

      {isLoading ? (
        <p className="text-gray-400">Cargando...</p>
      ) : addons.length === 0 ? (
        <div className="card text-center py-16">
          <Sparkles size={42} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400 font-semibold">Aún no hay adiciones</p>
          <p className="text-gray-600 text-sm mt-1">Crea tu primera para que aparezca en el POS</p>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-dark-600">
              <tr className="text-gray-400 text-xs uppercase tracking-wider">
                <th className="px-4 py-3 text-center w-12">#</th>
                <th className="px-4 py-3 text-left">Adición</th>
                <th className="px-4 py-3 text-right">Precio</th>
                <th className="px-4 py-3 text-left">Insumo vinculado</th>
                <th className="px-4 py-3 text-right">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-600">
              {addons.map(a => {
                const linked = items.find(i => i.id === a.inventory_item_id)
                return (
                  <tr key={a.id} className="hover:bg-dark-700">
                    <td className="px-4 py-3 text-center text-gray-500 font-mono">{a.sort_order}</td>
                    <td className="px-4 py-3 text-white font-medium">{a.name}</td>
                    <td className="px-4 py-3 text-right text-brand-400 font-semibold">
                      +{formatCurrency(a.additional_price)}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {linked ? (
                        <span className="flex items-center gap-1">
                          <Package size={12} /> {linked.name} — {a.inventory_quantity} {linked.unit?.abbreviation}
                        </span>
                      ) : (
                        <span className="text-gray-600 italic">— sin vínculo</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {a.is_active
                        ? <span className="bg-green-900/30 text-green-400 border border-green-700 px-2 py-0.5 rounded-full text-xs">Activa</span>
                        : <span className="bg-gray-900/30 text-gray-500 border border-gray-700 px-2 py-0.5 rounded-full text-xs">Inactiva</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => openEdit(a)}
                          className="p-1.5 hover:bg-dark-600 rounded-lg text-gray-400 hover:text-white"
                          title="Editar"
                        >
                          <Edit3 size={14} />
                        </button>
                        {a.is_active && (
                          <button
                            onClick={() => handleDelete(a)}
                            className="p-1.5 hover:bg-dark-600 rounded-lg text-gray-500 hover:text-red-400"
                            title="Desactivar"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal crear / editar */}
      {showForm && (
        <Modal
          title={form.id ? 'Editar adición' : 'Nueva adición'}
          onClose={() => { setShowForm(false); setForm(blankForm) }}
        >
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="label">Icono</label>
                <input
                  className="input text-center text-xl"
                  placeholder="🧀"
                  value={form.icon}
                  onChange={e => setForm({ ...form, icon: e.target.value })}
                  maxLength={4}
                />
              </div>
              <div className="col-span-3">
                <label className="label">Nombre <span className="text-red-400">*</span></label>
                <input
                  className="input"
                  placeholder="Doble queso"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Precio adicional ($) <span className="text-red-400">*</span></label>
                <input
                  type="number"
                  className="input"
                  placeholder="3500"
                  value={form.additional_price}
                  onChange={e => setForm({ ...form, additional_price: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="label">Orden</label>
                <input
                  type="number"
                  className="input"
                  value={form.sort_order}
                  onChange={e => setForm({ ...form, sort_order: e.target.value })}
                />
              </div>
            </div>
            <div className="border-t border-dark-600 pt-3 space-y-2">
              <p className="text-xs text-gray-400">
                <Package size={12} className="inline mr-1" />
                <strong>Inventario (opcional):</strong> si vinculas un insumo, al cobrar la orden se descontará del stock automáticamente.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Insumo a descontar</label>
                  <select
                    className="input"
                    value={form.inventory_item_id}
                    onChange={e => setForm({ ...form, inventory_item_id: e.target.value })}
                  >
                    <option value="">— Sin vínculo —</option>
                    {items.map(i => (
                      <option key={i.id} value={i.id}>
                        {i.name} ({i.unit?.abbreviation || ''})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Cantidad a descontar</label>
                  <input
                    type="number"
                    step="0.01"
                    className="input"
                    placeholder="1"
                    value={form.inventory_quantity}
                    onChange={e => setForm({ ...form, inventory_quantity: e.target.value })}
                    disabled={!form.inventory_item_id}
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="active"
                checked={form.is_active}
                onChange={e => setForm({ ...form, is_active: e.target.checked })}
              />
              <label htmlFor="active" className="text-sm text-gray-300">Adición activa (visible en POS)</label>
            </div>
            <button type="submit" className="btn-primary w-full">
              {form.id ? 'Guardar cambios' : 'Crear adición'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  )
}
